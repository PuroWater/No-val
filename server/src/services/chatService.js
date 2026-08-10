import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { newId, normalizeBook, parseTargetWords } from '../lib/bookUtils.js';
import { chatCompletion } from './deepseek.js';
import { finalizeDraftBook, continueBook, rewriteChapter, ensureChapterTitle } from './bookService.js';
import { runToolDecision } from './toolkit.js';

const activeJobs = new Map();

export function isConfirmation(text) {
  return /确认|确定|可以|没问题|不用改|不需要修改|就这样|开始生成|生成吧/.test(String(text));
}

export function hasPending(book) {
  return book.chat.some((message) => message.kind === 'processing');
}

function appendMessage(book, role, content, kind = 'text', extra = {}) {
  book.chat.push({
    id: newId('m'),
    role,
    content,
    kind,
    createdAt: new Date().toISOString(),
    ...extra
  });
  book.updatedAt = new Date().toISOString();
}

function replaceProcessing(book, content, kind = 'text', extra = {}) {
  let index = -1;
  for (let i = book.chat.length - 1; i >= 0; i -= 1) {
    if (book.chat[i].kind === 'processing') {
      index = i;
      break;
    }
  }
  if (index === -1) {
    appendMessage(book, 'agent', content, kind, extra);
    return;
  }
  const message = book.chat[index];
  message.content = content;
  message.kind = kind;
  message.createdAt = new Date().toISOString();
  Object.assign(message, extra);
  book.updatedAt = new Date().toISOString();
}

function buildDraft(userId) {
  const now = new Date().toISOString();
  return normalizeBook({
    id: newId('b'),
    userId,
    status: 'draft',
    title: '未命名新书',
    outline: '',
    chapters: [],
    relations: { nodes: [], edges: [] },
    chat: [],
    draft: { concept: '', summary: '' },
    createdAt: now,
    updatedAt: now
  });
}

export function createDraft(userId) {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = buildDraft(userId);
  books.push(book);
  writeJson(BOOKS_FILE, books);
  return book;
}

function fuzzyScore(title, query) {
  const t = String(title || '').toLowerCase();
  const q = String(query || '').toLowerCase();
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.includes(q) || q.includes(t)) return 90;
  const setT = new Set(t.split(''));
  const setQ = new Set(q.split(''));
  let overlap = 0;
  for (const ch of setQ) {
    if (setT.has(ch)) overlap += 1;
  }
  return Math.round((overlap / setQ.size) * 60);
}

function chineseNumberToInt(text) {
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let current = 0;
  for (const ch of String(text)) {
    if (ch in digits) {
      current = digits[ch];
    } else if (ch in units) {
      if (current === 0) current = 1;
      total += current * units[ch];
      current = 0;
    }
  }
  return total + current;
}

export function searchChapters(book, text) {
  const value = String(text || '').trim();
  if (!value) return [];
  const chapterMatch = value.match(/(?:第)?\s*([0-9零一二两三四五六七八九十百千]+)\s*章/);
  let chapterNumber = 0;
  if (chapterMatch) {
    const raw = chapterMatch[1];
    chapterNumber = /^\d+$/.test(raw) ? Number(raw) : chineseNumberToInt(raw);
  }
  if (!chapterNumber) {
    const numberMatch = value.match(/\d+/);
    if (numberMatch) chapterNumber = Number(numberMatch[0]);
  }
  if (chapterNumber > 0 && book.chapters[chapterNumber - 1]) {
    const index = chapterNumber - 1;
    return [{ index, title: book.chapters[index].title, score: 100 }];
  }
  return book.chapters
    .map((chapter, index) => ({ index, title: chapter.title, score: fuzzyScore(chapter.title, value) }))
    .filter((item) => item.score >= 40)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function intToChinese(number) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const n = Math.max(1, Math.floor(number));
  if (n < 10) return digits[n];
  if (n < 20) return n === 10 ? '十' : `十${digits[n - 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${digits[tens]}十${ones ? digits[ones] : ''}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${digits[hundreds]}百${rest ? (rest < 10 ? `零${digits[rest]}` : intToChinese(rest)) : ''}`;
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${digits[thousands]}千${rest ? (rest < 100 ? `零${intToChinese(rest)}` : intToChinese(rest)) : ''}`;
}

export function fixChapterPrefixes(book, format, changeLog = new Set()) {
  let count = 0;
  book.chapters.forEach((chapter, index) => {
    const original = chapter.title;
    let title = ensureChapterTitle(index, original);
    const prefix = format === 'chinese' ? `第${intToChinese(index + 1)}章` : `第${index + 1}章`;
    title = title.replace(/^第\s*[0-9零一二两三四五六七八九十百千]+\s*章/, prefix);
    if (title !== original) {
      chapter.title = title;
      chapter.updatedAt = new Date().toISOString();
      changeLog.add(chapter.id);
      count += 1;
    }
  });
  return count;
}

const EDIT_FIELDS = {
  title: {
    needsChapter: true,
    apply: (book, { index, value }, deps) => {
      const nextTitle = ensureChapterTitle(index, value);
      const chapter = book.chapters[index];
      if (chapter.title !== nextTitle) {
        chapter.title = nextTitle;
        chapter.updatedAt = new Date().toISOString();
        deps.changeLog.add(chapter.id);
      }
      return { followUp: true, data: `第 ${index + 1} 章标题已更新为《${chapter.title}》。` };
    }
  },
  outline: {
    needsChapter: false,
    apply: (book, { value }) => {
      book.outline = String(value || '').trim();
      return { content: '已更新书籍简介。', kind: 'text' };
    }
  },
  content: {
    needsChapter: true,
    apply: async (book, { index, value }, deps) => {
      const rewrittenId = book.chapters[index]?.id;
      await rewriteChapter(book, index, String(value || '').trim(), { ...deps.settings, signal: deps.signal });
      if (rewrittenId) deps.changeLog.add(rewrittenId);
      return {
        content: `已修改第 ${index + 1} 章《${book.chapters[index]?.title || '本章'}》，可打开并列窗口查看。`,
        kind: 'book',
        extra: { bookId: book.id, chapter: index + 1 }
      };
    }
  }
};

function buildReadyTools(book, settings, signal, changeLog) {
  return [
    {
      name: 'fix_chapter_prefixes',
      description: '批量修复全部章节标题的“第X章”前缀，一次性处理，无需逐章调用。format 只能是 arabic（阿拉伯数字，如 第1章）或 chinese（汉字，如 第一章）。',
      parameters: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['arabic', 'chinese'], description: 'arabic=第1章 / chinese=第一章' }
        },
        required: ['format']
      },
      handler: async ({ format }) => {
        const count = fixChapterPrefixes(book, format, changeLog.chapterIds);
        return count > 0
          ? { content: `已统一处理 ${count} 个章节标题前缀（${format === 'chinese' ? '汉字' : '阿拉伯数字'}标号）。`, kind: 'text' }
          : { content: '章节标题前缀已是目标格式，无需修改。', kind: 'text' };
      }
    },
    {
      name: 'edit_book',
      description: '修改书籍内容。target 为修改目标，只能是 title（章节标题）/ outline（简介）/ content（章节内容）三选一；target 为 content/title 时必须提供 chapter（章节号或标题）；value 为新的标题/简介/内容。修改标题后可继续调用本工具处理其它章节。',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', enum: ['title', 'outline', 'content'], description: 'title=章节标题 / outline=简介 / content=章节内容' },
          chapter: { type: 'string', description: '章节号或标题，如 "第二章"、"古卷传承"' },
          value: { type: 'string', minLength: 1, description: '新的标题/简介/章节内容' }
        },
        required: ['target', 'value']
      },
      handler: async ({ target, chapter, value }, context) => {
        const field = EDIT_FIELDS[target];
        if (!field) {
          return { content: '未知的修改目标，仅支持 title / outline / content。', kind: 'text' };
        }
        const deps = { changeLog: changeLog.chapterIds, settings, signal };
        if (!field.needsChapter) {
          return field.apply(book, { value }, deps);
        }
        const requestText = String(chapter || '').trim() || context.user || '';
        if (!requestText) {
          return {
            content: '请提供要修改的章节号或标题，例如“第二章”。',
            kind: 'text'
          };
        }
        const matches = searchChapters(book, requestText);
        if (matches.length === 0) {
          return {
            content: '没有找到对应章节。请在下方书籍中打开并列查看或详情确认章节，然后回复章节号或章节名（支持模糊匹配）。',
            kind: 'book',
            extra: { bookId: book.id }
          };
        }
        if (matches.length > 1) {
          const list = matches.slice(0, 5).map((item, order) => `${order + 1}. ${item.title}`).join('\n');
          return { content: `找到多个相似章节，请选择要修改哪一章：\n${list}`, kind: 'question' };
        }
        return field.apply(book, { index: matches[0].index, value }, deps);
      }
    },
    {
      name: 'continue_book',
      description: '续写小说下一批章节。instruction 为续写方向（可省略）。',
      parameters: {
        type: 'object',
        properties: { instruction: { type: 'string' } },
        required: []
      },
      handler: async ({ instruction }) => {
        const before = book.chapters.length;
        await continueBook(book, String(instruction || '').trim() || '继续写', { ...settings, signal });
        return {
          content: continueMessage(book, book.chapters.length - before),
          kind: 'book',
          extra: { bookId: book.id, chapter: book.chapters.length }
        };
      }
    },
    {
      name: 'read_book',
      description: '查询书籍信息或章节内容。field 为 info（书名/简介/章节数/进度/目标字数）、chapters（章节目录）、chapter（指定章节内容）；查询具体章节时必须先调用本工具读取后再回答，不要凭摘要猜测。',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'info | chapters | chapter' },
          target: { type: 'string', description: '章节号或标题，field=chapter 时必填' },
          scope: { type: 'string', description: 'summary 或 content，field=chapter 时生效' }
        },
        required: ['field']
      },
      handler: async ({ field, target, scope }, context) => {
        if (field === 'info') {
          const totalWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
          return {
            followUp: true,
            data: [
              `书名：${book.title}`,
              `简介：${book.outline || '无'}`,
              `章节数：${book.chapters.length}`,
              `当前字数：约 ${totalWords} 字`,
              book.targetWords > 0
                ? `全书目标：约 ${book.targetWords} 字（已完成 ${Math.round((totalWords / book.targetWords) * 100)}%）`
                : ''
            ].filter(Boolean).join('\n')
          };
        }
        if (field === 'chapters') {
          const titles = book.chapters.map((chapter, index) => `${index + 1}. ${chapter.title}`);
          const list = titles.length > 200 ? `${titles.slice(0, 200).join('\n')}\n…（共 ${titles.length} 章）` : titles.join('\n');
          return { followUp: true, data: `章节目录：\n${list || '暂无章节'}` };
        }
        const matches = searchChapters(book, String(target || '').trim() || context.user || '');
        if (matches.length === 0) {
          return { content: '没有找到对应章节，请确认章节号或标题。', kind: 'text' };
        }
        if (matches.length > 1) {
          const list = matches.slice(0, 5).map((item, order) => `${order + 1}. ${item.title}`).join('\n');
          return { content: `找到多个相似章节：\n${list}\n请回复具体章节号。`, kind: 'text' };
        }
        const index = matches[0].index;
        const chapter = book.chapters[index];
        const useContent = String(scope || '') === 'content';
        const excerpt = useContent && chapter.content ? chapter.content.slice(0, 1200) : '';
        const data = [
          `第 ${index + 1} 章《${chapter.title}》`,
          `摘要：${chapter.summary || '无'}`,
          excerpt ? `正文节选（${excerpt.length} 字）：\n${excerpt}` : ''
        ].filter(Boolean).join('\n');
        return { followUp: true, data };
      }
    },
    {
      name: 'open_book_widget',
      description: '当用户需要查看书籍、选择章节，或改写目标不明确时，展示书籍卡片并提供并列查看/详情入口；chapter 为打开并列窗口后定位的章节号（从 1 开始，默认 1）。',
      parameters: {
        type: 'object',
        properties: { chapter: { type: 'integer', description: '章节号，从 1 开始' } },
        required: []
      },
      handler: async ({ chapter }) => ({
        content: '请在下方书籍中打开并列查看或详情浏览章节，然后回复章节号或章节名（支持模糊匹配）。',
        kind: 'book',
        extra: { bookId: book.id, chapter: Number(chapter) || 1 }
      })
    }
  ];
}

function continueMessage(book, count) {
  const added = book.chapters.slice(-count);
  if (count <= 1) {
    return `已续写下一章《${added[0]?.title || '本章'}》，可打开并列窗口查看。`;
  }
  const titles = added.map((chapter) => chapter.title).join('》《');
  return `已续写 ${count} 章：《${titles}》，可打开并列窗口查看。`;
}

export function mergeBookState(latest, mutated, changedChapterIds = new Set()) {
  latest.title = mutated.title;
  latest.outline = mutated.outline;
  latest.status = mutated.status;
  latest.storySummary = mutated.storySummary;
  latest.targetWords = mutated.targetWords;
  latest.draft = mutated.draft;
  latest.updatedAt = mutated.updatedAt;
  const mutatedChapters = new Map(mutated.chapters.map((chapter) => [chapter.id, chapter]));
  const seen = new Set();
  latest.chapters = latest.chapters.map((chapter) => {
    seen.add(chapter.id);
    const ours = mutatedChapters.get(chapter.id);
    return ours && changedChapterIds.has(chapter.id) ? Object.assign(chapter, ours) : chapter;
  });
  for (const chapter of mutated.chapters) {
    if (!seen.has(chapter.id)) {
      latest.chapters.push(chapter);
      seen.add(chapter.id);
    }
  }
  const mutatedChat = new Map(mutated.chat.map((message) => [message.id, message]));
  latest.chat = latest.chat.map((message) => {
    const ours = mutatedChat.get(message.id);
    if (!ours) return message;
    const latestFinalized = message.kind !== 'processing';
    const mutatedFinalized = ours.kind !== 'processing';
    return latestFinalized && !mutatedFinalized ? message : Object.assign(message, ours);
  });
  const latestIds = new Set(latest.chat.map((message) => message.id));
  for (const message of mutated.chat) {
    if (!latestIds.has(message.id)) latest.chat.push(message);
  }
}

function writeMergedBook(userId, mutated, changedChapterIds = new Set()) {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const latest = books.find((item) => item.id === mutated.id && item.userId === userId);
  if (latest) {
    mergeBookState(latest, mutated, changedChapterIds);
  } else {
    books.push(mutated);
  }
  writeJson(BOOKS_FILE, books);
}

export function interruptProcessing(userId, bookId = '') {
  const prefix = `${userId}:`;
  const targets = new Set();
  for (const [key, job] of activeJobs.entries()) {
    if (!key.startsWith(prefix)) continue;
    const jobBookId = key.slice(prefix.length);
    const matches = bookId ? jobBookId === bookId : job.isNewDraft;
    if (!matches) continue;
    job.controller.abort(new Error('用户中断'));
    activeJobs.delete(key);
    targets.add(jobBookId);
  }
  if (targets.size === 0) return { interrupted: false };
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  let changed = false;
  for (const book of books) {
    if (book.userId !== userId) continue;
    if (!targets.has(book.id)) continue;
    for (let i = book.chat.length - 1; i >= 0; i -= 1) {
      const message = book.chat[i];
      if (message.kind === 'processing') {
        message.content = '输出已中断';
        message.kind = 'text';
        message.createdAt = new Date().toISOString();
        book.updatedAt = message.createdAt;
        changed = true;
        break;
      }
    }
  }
  if (changed) writeJson(BOOKS_FILE, books);
  return { interrupted: true };
}

export async function handleMessage(userId, bookId, content, settings = {}) {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  let book = books.find((item) => item.id === bookId && item.userId === userId);
  let created = false;
  if (!book && !bookId) {
    book = buildDraft(userId);
    books.push(book);
    created = true;
  }
  if (!book) throw new Error('书籍或创作会话不存在');
  if (hasPending(book)) throw new Error('上一轮仍在处理中，请稍候');

  appendMessage(book, 'user', content, 'text');
  if (created) {
    const brief = content.slice(0, 18);
    book.title = `构思：${brief}${content.length > 18 ? '…' : ''}`;
  }
  writeJson(BOOKS_FILE, books);

  appendMessage(book, 'agent', '正在处理，请稍候…', 'processing');
  writeJson(BOOKS_FILE, books);

  const jobKey = `${userId}:${book.id}`;
  const controller = new AbortController();
  const changeLog = { chapterIds: new Set() };
  activeJobs.set(jobKey, { controller, isNewDraft: created });
  try {
    if (book.status === 'draft') {
      await handleDraftMessage(book, content, settings, controller.signal);
    } else {
      await handleReadyMessage(book, content, settings, controller.signal, changeLog);
    }
  } catch (err) {
    const message = String(err.message || '');
    const stillProcessing = book.chat.some((item) => item.kind === 'processing');
    if (stillProcessing) {
      if (/中断/.test(message)) {
        replaceProcessing(book, '输出已中断', 'text');
      } else {
        replaceProcessing(book, `处理失败：${message}`, 'error');
      }
    }
  } finally {
    activeJobs.delete(jobKey);
    writeMergedBook(userId, book, changeLog.chapterIds);
  }
  return book;
}

async function handleDraftMessage(book, content, settings, signal) {
  if (book.draft.summary && isConfirmation(content)) {
    await finalizeDraftBook(book, { ...settings, signal });
    replaceProcessing(book, `《${book.title}》已生成，共 ${book.chapters.length} 章。`, 'book', { bookId: book.id });
    return;
  }
  const conversation = book.chat.map((message) => `${message.role}: ${message.content}`).join('\n');
  const decision = await runToolDecision({
    system: '你是小说构思采集 Agent。根据对话判断构思信息是否齐全（主角、故事背景、分类、小说总字数，字数可选千字/万字/10万/20万/50万/百万）。信息不足时调用 ask_draft_question 只问当前最缺的一项；信息齐全时调用 confirm_draft 输出整合后的完整构思。',
    tools: [
      {
        name: 'ask_draft_question',
        description: '构思信息不足时，向用户追问当前最需要的一个缺失信息。',
        parameters: {
          type: 'object',
          properties: { question: { type: 'string', minLength: 2 } },
          required: ['question']
        },
        handler: async ({ question }) => ({
          content: String(question || '').trim() || '请补充主角、故事背景、分类或小说总字数。',
          kind: 'question'
        })
      },
      {
        name: 'confirm_draft',
        description: '构思信息齐全时，输出整合后的完整构思摘要供用户确认。',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string', minLength: 5 },
            targetWords: { type: 'string', description: '全书目标字数，如 100000 或 "10万"' }
          },
          required: ['summary']
        },
        handler: async ({ summary, targetWords }) => {
          book.draft.summary = String(summary || '').trim();
          book.draft.targetWords = parseTargetWords(targetWords);
          return {
            content: `构思已整合：\n${book.draft.summary}\n\n是否需要修改？回复“确认”开始生成，或直接提出修改意见。`,
            kind: 'confirm'
          };
        }
      }
    ],
    user: conversation,
    signal
  });
  if (!decision.tool) {
    replaceProcessing(book, decision.outcome?.content || '我还没有完全理解你的构思，请补充主角、故事背景、分类或小说总字数。', 'question');
    return;
  }
  const outcome = decision.outcome || {};
  replaceProcessing(book, outcome.content || '请继续补充构思信息。', outcome.kind || 'question', outcome.extra || {});
}

async function handleReadyMessage(book, content, settings, signal, changeLog) {
  const last = book.chapters[book.chapters.length - 1];
  const decision = await runToolDecision({
    system: [
      '你是小说协作 Agent，根据用户消息选择一个工具调用。',
      '回答具体章节的内容、摘要或细节问题前，必须使用 read_chapter 工具读取章节，再根据返回内容作答。',
      `全书摘要：${book.storySummary || '暂无'}`,
      `最近章节摘要：${last?.summary || last?.title || '暂无'}`
    ].join('\n'),
    tools: buildReadyTools(book, settings, signal, changeLog),
    user: content,
    signal
  });
  if (!decision.tool) {
    const outcome = decision.outcome || {};
    replaceProcessing(book, outcome.content || '好的，我记下了。', outcome.kind || 'text', outcome.extra || { bookId: book.id });
    return;
  }
  const outcome = decision.outcome || {};
  replaceProcessing(book, outcome.content || '好的，我记下了。', outcome.kind || 'text', outcome.extra || { bookId: book.id });
}

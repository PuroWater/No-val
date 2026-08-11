import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { newId, normalizeBook, parseTargetWords } from '../lib/bookUtils.js';
import { finalizeDraftBook } from './bookService.js';
import { extractOutputScale, OVER_LIMIT_REPLY, prefilterIntent, runToolDecision } from './toolkit.js';
import { defineReadyTools, READY_TOOL_GROUPS } from './tools.js';

const activeJobs = new Map();

export function isConfirmation(text) {
  return /确认|确定|可以|没问题|不用改|不需要修改|就这样|开始生成|生成吧/.test(String(text));
}

export function hasPending(book) {
  return book.chat.some((message) => message.kind === 'processing');
}

function localDateKey(iso) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildTodayHistory(book) {
  const chat = book.chat || [];
  const end = chat[chat.length - 1]?.kind === 'processing' ? chat.length - 2 : chat.length - 1;
  const today = localDateKey(new Date().toISOString());
  return chat
    .slice(0, Math.max(0, end))
    .filter((message) => message.kind !== 'processing' && message.kind !== 'typing' && localDateKey(message.createdAt) === today)
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n');
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
  const conversation = book.chat.map((message) => `${message.role}: ${message.content}`).join('\n');
  // 构思路径复用初筛/规模解析：用户明确指定“N章 × 每章M字”时存入草稿，确认后覆盖默认设置。
  const scale = await extractOutputScale({ user: content, history: conversation, signal });
  if (scale.over) {
    replaceProcessing(book, OVER_LIMIT_REPLY, 'text');
    return;
  }
  if (scale.output) {
    if (Number.isInteger(scale.output.chapters)) book.draft.chaptersPerOutput = scale.output.chapters;
    if (Number.isFinite(scale.output.chapterWords)) book.draft.chapterWords = scale.output.chapterWords;
  }
  if (book.draft.summary && isConfirmation(content)) {
    await finalizeDraftBook(book, {
      ...settings,
      ...(Number.isInteger(book.draft.chaptersPerOutput) ? { chaptersPerOutput: book.draft.chaptersPerOutput } : {}),
      ...(Number.isFinite(book.draft.chapterWords) ? { chapterWords: book.draft.chapterWords } : {}),
      signal
    });
    replaceProcessing(book, `《${book.title}》已生成，共 ${book.chapters.length} 章。`, 'book', { bookId: book.id });
    return;
  }
  const decision = await runToolDecision({
    system: '你是小说构思采集 Agent。根据对话判断构思信息是否齐全（主角、故事背景、小说总字数，字数可选千字/万字/10万/20万/50万/百万）。分类/类型不是必填信息：用户提到类型时正常回应即可，不要追问；用户表示由你自行决定或全权发挥时，不要追问缺失信息，直接整合构思调用 confirm_draft。信息不足时调用 ask_draft_question 只问当前最缺的一项；信息齐全时调用 confirm_draft 输出整合后的完整构思。',
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
          content: String(question || '').trim() || '请补充主角、故事背景或小说总字数。',
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
    replaceProcessing(book, decision.outcome?.content || '我还没有完全理解你的构思，请补充主角、故事背景或小说总字数。', 'question');
    return;
  }
  const outcome = decision.outcome || {};
  replaceProcessing(book, outcome.content || '请继续补充构思信息。', outcome.kind || 'question', outcome.extra || {});
}

async function handleReadyMessage(book, content, settings, signal, changeLog) {
  const last = book.chapters[book.chapters.length - 1];
  const prefilter = await prefilterIntent({
    groups: READY_TOOL_GROUPS,
    user: content,
    history: buildTodayHistory(book),
    signal,
    system: [
      '你是小说协作 Agent，负责判断用户是在聊天还是需要调用工具，必要时直接回答。',
      `全书概况：${book.storySummary || '暂无'}`,
      `最近章节摘要：${last?.summary || last?.title || '暂无'}`,
      `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
    ].join('\n')
  });
  if (prefilter.mode === 'chat') {
    replaceProcessing(book, prefilter.reply || '好的，我记下了。', 'text', { bookId: book.id });
    return;
  }
  const { groups, output } = prefilter;
  const allowed = new Set(groups.length > 0 ? groups : READY_TOOL_GROUPS.map((group) => group.name));
  const effectiveSettings = output
    ? {
        ...settings,
        ...(output.chapters ? { chaptersPerOutput: output.chapters } : {}),
        ...(output.chapterWords ? { chapterWords: output.chapterWords } : {})
      }
    : settings;
  const tools = defineReadyTools(book, effectiveSettings, signal, changeLog).filter((tool) => allowed.has(tool.group));
  const decision = await runToolDecision({
    system: [
      '你是小说协作 Agent，根据用户消息选择一个工具调用。',
      '回答具体章节的内容、摘要或细节问题前，必须使用 read_book 工具读取章节，再根据返回内容作答。',
      `全书摘要：${book.storySummary || '暂无'}`,
      `最近章节摘要：${last?.summary || last?.title || '暂无'}`
    ].join('\n'),
    tools,
    user: content,
    context: buildTodayHistory(book),
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

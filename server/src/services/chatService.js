import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { newId, normalizeBook, parseTargetWords } from '../lib/bookUtils.js';
import { chatCompletion } from './deepseek.js';
import { finalizeDraftBook, continueBook, rewriteChapter } from './bookService.js';

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

function pickCandidate(candidates, reply) {
  const value = String(reply || '').trim();
  if (!value) return null;
  const chapterMatch = value.match(/(?:第)?\s*([0-9零一二两三四五六七八九十百千]+)\s*章/);
  let order = 0;
  if (chapterMatch) {
    const raw = chapterMatch[1];
    order = /^\d+$/.test(raw) ? Number(raw) : chineseNumberToInt(raw);
  }
  if (!order) {
    const numberMatch = value.match(/\d+/);
    if (numberMatch) order = Number(numberMatch[0]);
  }
  if (order > 0) {
    const candidate = candidates[order - 1];
    if (candidate) return candidate;
  }
  const matches = searchChapters({ chapters: candidates.map((item) => ({ title: item.title })) }, value);
  return matches.length === 1 ? candidates[matches[0].index] : null;
}

function extractInstruction(book, content, chapterIndex) {
  const chapter = book.chapters[chapterIndex];
  let text = String(content || '');
  if (chapter?.title) text = text.split(chapter.title).join('');
  text = text.replace(/(?:第\s*[0-9零一二两三四五六七八九十百千]+\s*章|[0-9零一二两三四五六七八九十百千]+\s*章)/g, '');
  text = text.replace(/改写|修改|重写|润色|调整|改一下|改改|帮我|我想|把|的/g, '');
  text = text.replace(/[，。、！？；：,.!?;:\s]/g, '');
  return text;
}

export function resolveRewrite(book, content) {
  const matches = searchChapters(book, content);
  if (matches.length === 1) {
    const match = matches[0];
    const instruction = extractInstruction(book, content, match.index);
    return instruction
      ? { type: 'direct', index: match.index, instruction }
      : { type: 'askPart', index: match.index, title: match.title };
  }
  if (matches.length > 1) {
    return { type: 'candidates', candidates: matches.slice(0, 5) };
  }
  return { type: 'none' };
}

async function applyRewriteRequest(book, content, settings, signal, changeLog) {
  const resolved = resolveRewrite(book, content);
  if (resolved.type === 'direct') {
    const index = resolved.index;
    const rewrittenId = book.chapters[index]?.id;
    await rewriteChapter(book, index, resolved.instruction, { ...settings, signal });
    if (rewrittenId) changeLog.chapterIds.add(rewrittenId);
    book.rewrite = { step: 'none', chapterIndex: -1, candidates: [] };
    replaceProcessing(book, `已修改第 ${index + 1} 章《${book.chapters[index]?.title || '本章'}》，可打开并列窗口查看。`, 'book', { bookId: book.id });
    return;
  }
  if (resolved.type === 'candidates') {
    book.rewrite = { step: 'chapter', chapterIndex: -1, candidates: resolved.candidates };
    const list = resolved.candidates.map((item, order) => `${order + 1}. ${item.title}`).join('\n');
    replaceProcessing(book, `找到多个相似章节，请选择要修改哪一章：\n${list}`, 'question');
    return;
  }
  if (resolved.type === 'askPart') {
    book.rewrite = { step: 'part', chapterIndex: resolved.index, candidates: [] };
    replaceProcessing(book, `好的，要修改《${resolved.title}》的哪一部分？例如：开头、人物描写、结尾，或直接输入具体修改意见。`, 'question');
    return;
  }
  book.rewrite = { step: 'chapter', chapterIndex: -1, candidates: [] };
  replaceProcessing(book, '想改写哪一章？请在下方书籍中打开并列查看或详情浏览章节，然后回复章节号或章节名（支持模糊匹配）。', 'book', { bookId: book.id });
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
  latest.rewrite = mutated.rewrite;
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
  const targets = [];
  for (const [key, job] of activeJobs.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (bookId && !key.endsWith(`:${bookId}`)) continue;
    job.controller.abort(new Error('用户中断'));
    activeJobs.delete(key);
    targets.push(key.slice(prefix.length));
  }
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  let changed = false;
  for (const book of books) {
    if (book.userId !== userId) continue;
    if (bookId && book.id !== bookId) continue;
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
  return { interrupted: targets.length > 0 };
}

export function startRewriteSession(userId, bookId) {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === bookId && item.userId === userId);
  if (!book) throw new Error('书籍或创作会话不存在');
  if (book.status !== 'ready' || book.chapters.length === 0) {
    throw new Error('这本书还没有可改写的章节');
  }
  book.rewrite = { step: 'chapter', chapterIndex: -1 };
  book.rewrite.candidates = [];
  appendMessage(book, 'agent', '想改写哪一章？请在下方书籍中打开并列查看或详情浏览章节，然后回复章节号或章节名（支持模糊匹配）。', 'book', { bookId: book.id });
  writeJson(BOOKS_FILE, books);
  return book;
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
  activeJobs.set(jobKey, { controller });
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
    book.rewrite = { step: 'none', chapterIndex: -1, candidates: [] };
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
  const result = await chatCompletion({
    system: '你是小说构思采集助手。根据对话判断缺少主角、故事背景、分类、小说总字数（千字/万字/10万/20万/50万/百万）中的哪些信息。缺少时只返回 JSON：{"question":"只问当前最需要的一个问题"}；信息齐全时返回 JSON：{"summary":"整合后的完整小说构思","ready":true,"targetWords":100000}。不要包含 Markdown。',
    user: conversation,
    maxTokens: 1200,
    signal
  });
  if (result.summary && result.ready) {
    book.draft.summary = result.summary;
    book.draft.targetWords = parseTargetWords(result.targetWords);
    replaceProcessing(book, `构思已整合：\n${result.summary}\n\n是否需要修改？回复“确认”开始生成，或直接提出修改意见。`, 'confirm');
  } else if (result.question) {
    replaceProcessing(book, result.question, 'question');
  } else {
    replaceProcessing(book, '我还没有完全理解你的构思，请补充主角、故事背景、分类或小说总字数。', 'question');
  }
}

async function handleReadyMessage(book, content, settings, signal, changeLog) {
  if (book.rewrite?.step === 'chapter') {
    if (Array.isArray(book.rewrite.candidates) && book.rewrite.candidates.length > 0) {
      const picked = pickCandidate(book.rewrite.candidates, content);
      if (picked) {
        book.rewrite.chapterIndex = picked.index;
        book.rewrite.step = 'part';
        book.rewrite.candidates = [];
        replaceProcessing(
          book,
          `好的，要修改《${picked.title}》的哪一部分？例如：开头、人物描写、结尾，或直接输入具体修改意见。`,
          'question'
        );
        return;
      }
    }
    const matches = searchChapters(book, content);
    if (matches.length === 1) {
      const match = matches[0];
      book.rewrite.chapterIndex = match.index;
      book.rewrite.step = 'part';
      book.rewrite.candidates = [];
      replaceProcessing(
        book,
        `好的，要修改《${match.title}》的哪一部分？例如：开头、人物描写、结尾，或直接输入具体修改意见。`,
        'question'
      );
      return;
    }
    if (matches.length > 1) {
      book.rewrite.candidates = matches.slice(0, 5);
      const list = book.rewrite.candidates.map((item, order) => `${order + 1}. ${item.title}`).join('\n');
      replaceProcessing(book, `找到多个相似章节，请选择要修改哪一章：\n${list}`, 'question');
      return;
    }
    book.rewrite.candidates = [];
    replaceProcessing(book, '没有找到对应章节。请在下方书籍中打开并列查看或详情确认章节，然后回复章节号或章节名（支持模糊匹配）。', 'book', { bookId: book.id });
    return;
  }
  if (book.rewrite?.step === 'part') {
    const index = book.rewrite.chapterIndex;
    const rewrittenId = book.chapters[index]?.id;
    await rewriteChapter(book, index, content, { ...settings, signal });
    if (rewrittenId) changeLog.chapterIds.add(rewrittenId);
    const title = book.chapters[index]?.title || '本章';
    book.rewrite = { step: 'none', chapterIndex: -1 };
    replaceProcessing(book, `已修改第 ${index + 1} 章《${title}》，可打开并列窗口查看。`, 'book', { bookId: book.id });
    return;
  }
  const rewriteIntent = /改写|修改|重写|改一下|调整一下|改改|润色/.test(content);
  const continueIntent = /续写|继续写|接着写|写下一章|继续创作|下一章|接着创作/.test(content);
  if (rewriteIntent) {
    await applyRewriteRequest(book, content, settings, signal, changeLog);
    return;
  }
  if (continueIntent) {
    const before = book.chapters.length;
    await continueBook(book, content, { ...settings, signal });
    replaceProcessing(book, continueMessage(book, book.chapters.length - before), 'book', { bookId: book.id });
    return;
  }
  const last = book.chapters[book.chapters.length - 1];
  const context = [
    `全书摘要：${book.storySummary || '暂无'}`,
    last ? `最近章节摘要：${last.summary || last.title}` : '暂无章节',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
  ].join('\n');
  const result = await chatCompletion({
    system: '你是小说协作助手。根据书籍内容和用户消息判断意图，只返回 JSON。',
    user: `书籍摘要上下文：\n${context}\n\n用户消息：${content}\n返回格式：续写 {"type":"continue","instruction":"..."}；修改章节 {"type":"rewrite","chapterIndex":0,"instruction":"..."}；回答问题 {"type":"question","reply":"..."}`,
    maxTokens: 1200,
    signal
  });
  if (result.type === 'rewrite') {
    const suggested = Number(result.chapterIndex);
    const instruction = String(result.instruction || '').trim();
    if (Number.isInteger(suggested) && book.chapters[suggested] && instruction) {
      const index = suggested;
      const rewrittenId = book.chapters[index]?.id;
      await rewriteChapter(book, index, instruction, { ...settings, signal });
      if (rewrittenId) changeLog.chapterIds.add(rewrittenId);
      book.rewrite = { step: 'none', chapterIndex: -1, candidates: [] };
      replaceProcessing(book, `已修改第 ${index + 1} 章《${book.chapters[index]?.title || '本章'}》，可打开并列窗口查看。`, 'book', { bookId: book.id });
    } else {
      await applyRewriteRequest(book, content, settings, signal, changeLog);
    }
  } else if (result.type === 'continue') {
    const before = book.chapters.length;
    await continueBook(book, result.instruction || content, { ...settings, signal });
    replaceProcessing(book, continueMessage(book, book.chapters.length - before), 'book', { bookId: book.id });
  } else {
    replaceProcessing(book, result.reply || '好的，我记下了。', 'text', { bookId: book.id });
  }
}

import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { newId, normalizeBook } from '../lib/bookUtils.js';
import { chatCompletion } from './deepseek.js';
import { finalizeDraftBook, continueBook, rewriteChapter } from './bookService.js';

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

export async function handleMessage(userId, bookId, content) {
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

  try {
    if (book.status === 'draft') {
      await handleDraftMessage(book, content);
    } else {
      await handleReadyMessage(book, content);
    }
  } catch (err) {
    replaceProcessing(book, `处理失败：${err.message}`, 'error');
  }
  writeJson(BOOKS_FILE, books);
  return book;
}

async function handleDraftMessage(book, content) {
  if (book.draft.summary && isConfirmation(content)) {
    await finalizeDraftBook(book);
    replaceProcessing(book, `《${book.title}》已生成，共 ${book.chapters.length} 章。`, 'book', { bookId: book.id });
    return;
  }
  const conversation = book.chat.map((message) => `${message.role}: ${message.content}`).join('\n');
  const result = await chatCompletion({
    system: '你是小说构思采集助手。根据对话判断缺少主角、故事背景、分类中的哪些信息。缺少时只返回 JSON：{"question":"只问当前最需要的一个问题"}；信息齐全时返回 JSON：{"summary":"整合后的完整小说构思","ready":true}。不要包含 Markdown。',
    user: conversation,
    maxTokens: 1200
  });
  if (result.summary && result.ready) {
    book.draft.summary = result.summary;
    replaceProcessing(book, `构思已整合：\n${result.summary}\n\n是否需要修改？回复“确认”开始生成，或直接提出修改意见。`, 'confirm');
  } else if (result.question) {
    replaceProcessing(book, result.question, 'question');
  } else {
    replaceProcessing(book, '我还没有完全理解你的构思，请补充主角、故事背景或分类。', 'question');
  }
}

async function handleReadyMessage(book, content) {
  const context = book.chapters.map((chapter) => `${chapter.title}\n${chapter.content}`).join('\n\n');
  const result = await chatCompletion({
    system: '你是小说协作助手。根据书籍内容和用户消息判断意图，只返回 JSON。',
    user: `书籍内容：\n${context}\n\n用户消息：${content}\n返回格式：续写 {"type":"continue","instruction":"..."}；修改章节 {"type":"rewrite","chapterIndex":0,"instruction":"..."}；回答问题 {"type":"question","reply":"..."}`,
    maxTokens: 1200
  });
  if (result.type === 'rewrite') {
    const index = Number(result.chapterIndex);
    if (!Number.isInteger(index) || !book.chapters[index]) throw new Error('模型返回的章节序号无效');
    const before = book.chapters[index];
    await rewriteChapter(book, index, result.instruction || content);
    replaceProcessing(book, `已修改第 ${index + 1} 章《${before.title}》，可打开并列窗口查看。`, 'text', { bookId: book.id });
  } else if (result.type === 'continue') {
    await continueBook(book, result.instruction || content);
    const last = book.chapters[book.chapters.length - 1];
    replaceProcessing(book, `已续写下一章《${last.title}》，可打开并列窗口查看。`, 'book', { bookId: book.id });
  } else {
    replaceProcessing(book, result.reply || '好的，我记下了。', 'text', { bookId: book.id });
  }
}

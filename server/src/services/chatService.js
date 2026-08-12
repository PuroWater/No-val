import { readBookById, listBooks, saveBook } from '../lib/store.js';
import { newId, normalizeBook } from '../lib/bookUtils.js';
import { finalizeDraftBook } from './draftService.js';
import { prefilterDraftIntent, prefilterIntent, runToolDecision } from './toolkit.js';
import { defineReadyTools, READY_TOOL_GROUPS } from './tools.js';
import { defineDraftTools } from './draftTools.js';

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
  const book = buildDraft(userId);
  saveBook(book);
  return book;
}

export function mergeBookState(latest, mutated, changedChapterIds = new Set(), deletedChapterIds = new Set()) {
  latest.title = mutated.title;
  latest.outline = mutated.outline;
  latest.status = mutated.status;
  latest.storySummary = mutated.storySummary;
  latest.targetWords = mutated.targetWords;
  latest.draft = mutated.draft;
  latest.pendingDeletes = mutated.pendingDeletes;
  latest.updatedAt = mutated.updatedAt;
  const mutatedChapters = new Map(mutated.chapters.map((chapter) => [chapter.id, chapter]));
  const seen = new Set();
  latest.chapters = latest.chapters
    .filter((chapter) => !deletedChapterIds.has(chapter.id))
    .map((chapter) => {
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

function writeMergedBook(userId, mutated, changedChapterIds = new Set(), deletedChapterIds = new Set()) {
  const latest = readBookById(mutated.id);
  if (latest && latest.userId === userId) {
    mergeBookState(latest, mutated, changedChapterIds, deletedChapterIds);
    saveBook(latest);
  } else {
    saveBook(mutated);
  }
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
  let changed = false;
  for (const book of listBooks()) {
    if (book.userId !== userId || !targets.has(book.id)) continue;
    let touched = false;
    for (let i = book.chat.length - 1; i >= 0; i -= 1) {
      const message = book.chat[i];
      if (message.kind === 'processing') {
        message.content = '输出已中断';
        message.kind = 'text';
        message.createdAt = new Date().toISOString();
        book.updatedAt = message.createdAt;
        touched = true;
        break;
      }
    }
    if (touched) { saveBook(book); changed = true; }
  }
  return { interrupted: changed };
}

export function getJobProgress(userId, bookId = '') {
  const job = activeJobs.get(`${userId}:${bookId}`);
  return job?.progress || null;
}

export async function handleMessage(userId, bookId, content, settings = {}) {
  let book = bookId ? readBookById(bookId) : null;
  let created = false;
  if (!book && !bookId) { book = buildDraft(userId); created = true; }
  if (!book || book.userId !== userId) throw new Error('书籍或创作会话不存在');
  if (hasPending(book)) throw new Error('上一轮仍在处理中，请稍候');

  appendMessage(book, 'user', content, 'text');
  if (created) {
    const brief = content.slice(0, 18);
    book.title = `构思：${brief}${content.length > 18 ? '…' : ''}`;
  }
  saveBook(book);

  appendMessage(book, 'agent', '正在处理，请稍候…', 'processing');
  saveBook(book);

  const jobKey = `${userId}:${book.id}`;
  const controller = new AbortController();
  const changeLog = { chapterIds: new Set(), deletedChapterIds: new Set(), writtenCount: 0 };
  const job = { controller, isNewDraft: created, progress: { total: 0, done: 0, text: '处理中…' } };
  activeJobs.set(jobKey, job);
  try {
    if (book.status === 'draft') {
      job.progress.text = '正在整理构思…';
      await handleDraftMessage(book, content, settings, controller.signal);
    } else {
      await handleReadyMessage(book, content, settings, controller.signal, changeLog, job);
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
    writeMergedBook(userId, book, changeLog.chapterIds, changeLog.deletedChapterIds);
  }
  return book;
}

async function handleDraftMessage(book, content, settings, signal) {
  const conversation = book.chat.map((message) => `${message.role}: ${message.content}`).join('\n');
  // 构思统一走“意愿初筛”：chat = 纯文本回复不调工具（信息不足/无关闲聊/规模越界），confirm = 进入构思整合。
  const filter = await prefilterDraftIntent({ user: content, history: conversation, signal });
  if (filter.mode === 'chat') {
    replaceProcessing(book, filter.reply || '请继续补充你的小说构思。', 'text');
    return;
  }
  if (filter.output) {
    if (Number.isInteger(filter.output.chapters)) book.draft.chaptersPerOutput = filter.output.chapters;
    if (Number.isFinite(filter.output.chapterWords)) book.draft.chapterWords = filter.output.chapterWords;
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
    system: '你是小说构思整合 Agent。构思信息已齐全（或由用户决定），调用 confirm_draft 输出整合后的完整构思摘要；用户此前已确认过摘要时，根据最新修改意见重新整合。',
    tools: defineDraftTools(book),
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

async function handleReadyMessage(book, content, settings, signal, changeLog, job) {
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
  const totalChapters = output?.chapters || settings.chaptersPerOutput || 0;
  job.progress.total = totalChapters;
  job.progress.text = totalChapters > 0 ? `开始生成（共 ${totalChapters} 章）…` : '正在处理…';
  const scaleHint = output
    ? `\n本次用户指定输出规模：${output.chapters ? `共 ${output.chapters} 章` : ''}${output.chapterWords ? `、每章约 ${output.chapterWords} 字` : ''}。必须严格按指定章数逐章调用 edit_book(mode=new)，全部完成后再回复用户。`
    : `\n用户未指定输出规模，按默认设置执行：共 ${settings.chaptersPerOutput} 章、每章约 ${settings.chapterWords} 字；用户只要求一章时只写一章，全部完成后统一回复。`;
  const tools = defineReadyTools(book, effectiveSettings, signal, changeLog).filter((tool) => allowed.has(tool.group));
  const decision = await runToolDecision({
    system: [
      '你是小说协作 Agent，根据用户消息选择一个工具调用。',
      '回答具体章节的内容、摘要或细节问题前，必须使用 read_book 工具读取章节，再根据返回内容作答。',
      '用户明确要求操作（续写、改写、删除、插入、新建章节、更新简介、批量修改等）时必须调用对应工具完成，不得仅以聊天方式回应；工具能力不足时如实说明。',
      '章节新建/改写/删除等操作完成后，若适合向用户展示书籍卡片定位到相关章节，可调用 open_book_widget 并在 chapter 传入目标章节号；用户也可通过工作台右上角按钮打开并列查看/详情。',
      `全书摘要：${book.storySummary || '暂无'}`,
      `最近章节摘要：${last?.summary || last?.title || '暂无'}`,
      scaleHint
    ].join('\n'),
    tools,
    user: content,
    context: buildTodayHistory(book),
    signal,
    onStep: (toolName, outcome, args) => {
      const mode = String(args?.mode || '');
      const done = changeLog.writtenCount || 0;
      if (mode === 'new') {
        job.progress = {
          total: totalChapters,
          done,
          text: done > 0 ? `正在生成第 ${done}/${totalChapters || '?'} 章…` : '正在生成章节…'
        };
      } else if (mode === 'modify') {
        job.progress = { ...job.progress, done, text: '正在改写章节…' };
      } else if (mode === 'delete') {
        job.progress = { ...job.progress, done, text: '正在删除章节…' };
      } else if (toolName === 'refresh_chapter_meta') {
        job.progress = { ...job.progress, done, text: '正在维护章节元数据…' };
      } else if (toolName === 'update_outline') {
        job.progress = { ...job.progress, done, text: '正在更新整书简介…' };
      }
    }
  });
  if (!decision.tool) {
    const outcome = decision.outcome || {};
    replaceProcessing(book, outcome.content || '好的，我记下了。', outcome.kind || 'text', outcome.extra || { bookId: book.id });
    return;
  }
  const outcome = decision.outcome || {};
  replaceProcessing(book, outcome.content || '好的，我记下了。', outcome.kind || 'text', outcome.extra || { bookId: book.id });
}

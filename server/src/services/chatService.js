import { readBookById, listBooks, saveBook } from '../lib/store.js';
import { newId, normalizeBook } from '../lib/bookUtils.js';
import { finalizeDraftBook } from './draftService.js';
import { prefilterDraftIntent, prefilterIntent, runToolDecision } from './toolkit.js';
import { defineReadyTools, READY_TOOL_GROUPS } from './tools.js';
import { defineDraftTools } from './draftTools.js';
import { createChapter } from './bookService.js';

const activeJobs = new Map();

export function isConfirmation(text) {
  return /确认|确定|可以|没问题|不用改|不需要修改|就这样|开始生成|生成吧/.test(String(text));
}

export function hasPending(book) {
  return book.chat.some((message) => message.kind === 'processing');
}

// 最终回复的渲染附加信息：卡片未指定 chapter 时，用本轮最后一个变更章补齐定位。
// 属于协议层默认（open_book_widget 只发信号），模型显式传 chapter 时以其为准。
function finalOutcomeExtra(book, outcome, changeLog) {
  const extra = outcome?.extra && typeof outcome.extra === 'object' ? { ...outcome.extra } : {};
  if (outcome?.kind === 'book' && !extra.chapter && Number.isInteger(changeLog.lastEditedIndex) && changeLog.lastEditedIndex >= 0) {
    extra.chapter = changeLog.lastEditedIndex + 1;
  }
  return Object.keys(extra).length > 0 ? extra : { bookId: book.id };
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

  // 两阶段新书：前端先 /sessions 建空草稿再发首条消息，此时 chat 为空，仍按“首轮构思”命名
  const isFirstDraftMessage = created || (book.status === 'draft' && (book.chat || []).length === 0);
  appendMessage(book, 'user', content, 'text');
  if (isFirstDraftMessage) {
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
      'read_book 可读取图书最新数据（书名、简介、元数据、章节目录、章节内容、概况、时间线等）；用户询问任何书籍信息（书名、字数、进度、设定、章节内容、统计等）时，优先调用 read_book 获取真实数据，不要凭对话历史或猜测回答，也不要编造或沿用历史中可能错误的信息。',
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
  // navigate（open_book_widget）始终可用：展示类工具只发卡片信号，最终回复由模型产出
  const allowed = new Set([...(groups.length > 0 ? groups : READY_TOOL_GROUPS.map((group) => group.name)), 'navigate']);
  const rawNewCount = Number.isInteger(output?.chapters) ? output.chapters : 0;
  const chapterRefInText = /第\s*[0-9零一二两三四五六七八九十百千]+\s*章/.test(content);
  // 只有“明确要求新建/续写/插入”的指令才把章数当作新建规模；改写/删除等不消费该数字，
  // 避免“改写三章”被误判为新建 3 章（此前“再写一章”按默认规模反复生成的根因之一）。
  const newIntentRef = /续写|再写|继续写|新建|添加|插入|(?<![改重])写/.test(content);
  const userNewCount = rawNewCount > 0 && newIntentRef ? rawNewCount : 0;
  // 纯追加（无“第X章”锚点）的续写/新建走后端循环，次数不交给 AI 自律；
  // 带锚点/插入/新建的请求走 ReAct，由 AI 传 chapter/position，maxNewChapters 兜底防超量。
  const batchNew = userNewCount > 0 && !chapterRefInText && /续写|再写|继续写|(?<![改重])写/.test(content);
  const effectiveSettings = output
    ? {
        ...settings,
        ...(userNewCount > 0 ? { chaptersPerOutput: userNewCount } : {}),
        ...(output.chapterWords ? { chapterWords: output.chapterWords } : {})
      }
    : settings;
  const totalChapters = userNewCount || settings.chaptersPerOutput || 0;
  job.progress.total = totalChapters;
  job.progress.text = userNewCount > 0 ? `开始生成（共 ${userNewCount} 章）…` : '正在处理…';
  changeLog.maxNewChapters = totalChapters;
  const scaleHint = batchNew
    ? `\n本次用户指定续写/新建共 ${rawNewCount} 章，后端将按该数量批量生成；生成完成后请总结本次结果并调用 open_book_widget 展示书籍卡片。`
    : userNewCount > 0
      ? `\n本次用户要求处理共 ${rawNewCount} 章：新建/插入请逐章调用 edit_book(mode=new) 并传对 chapter/position（最多 ${rawNewCount} 章，后端已拦截超量）；完成后请总结并调用 open_book_widget 展示书籍卡片。`
      : `\n用户未明确指定新建章节数：默认一次新建 ${settings.chaptersPerOutput} 章、每章约 ${settings.chapterWords} 字；仅当用户要求续写/新建时才新建章节，改写/删除/插入等操作请使用对应工具，不要擅自新建章节。`;
  if (batchNew) {
    job.progress = { total: totalChapters, done: 0, text: `正在生成第 1/${totalChapters} 章…` };
    for (let i = 0; i < totalChapters; i += 1) {
      await createChapter(book, {
        instruction: content,
        settings: { ...effectiveSettings, chaptersPerOutput: 1 },
        signal
      });
      changeLog.writtenCount = i + 1;
      changeLog.lastEditedIndex = book.chapters.length - 1;
      job.progress = { total: totalChapters, done: i + 1, text: `正在生成第 ${i + 1}/${totalChapters} 章…` };
    }
    // 批量完成后只给“读 + 展示 + 轻量编辑”工具，不提供 edit_book 等章节编辑工具，防止 AI 再调
    const tools = defineReadyTools(book, effectiveSettings, signal, changeLog)
      .filter((tool) => tool.group === 'read' || tool.group === 'navigate' || ['update_outline', 'update_book_target'].includes(tool.name));
    const decision = await runToolDecision({
      system: [
        '你是小说协作 Agent，根据用户消息选择一个工具调用。',
        `本次已按用户指定规模批量生成 ${totalChapters} 章，生成已完成（新增前共 ${book.chapters.length - totalChapters} 章，现全书共 ${book.chapters.length} 章），不要再调用 edit_book(mode=new) 等编辑工具，也无需调用 read_book 确认书籍状态。`,
        `请直接总结本次续写结果（新增 ${totalChapters} 章、现全书共 ${book.chapters.length} 章），并调用 open_book_widget 展示书籍卡片；最终回复请用自己的话总结，不要复述工具内置文案。`,
        `全书摘要：${book.storySummary || '暂无'}`
      ].join('\n'),
      tools,
      user: content,
      context: buildTodayHistory(book),
      signal,
      onStep: (toolName, outcome, args) => {
        const mode = String(args?.mode || '');
        if (mode === 'new') job.progress = { total: totalChapters, done: changeLog.writtenCount, text: '批量生成已完成，正在整理回复…' };
      }
    });
    const outcome = decision.outcome || {};
    const extra = finalOutcomeExtra(book, outcome, changeLog);
    // 批量生成由后端执行，新章序号后端确定：卡片统一定位到最后新建的一章
    if (outcome.kind === 'book') extra.chapter = book.chapters.length;
    replaceProcessing(book, outcome.content || `已按指定规模生成 ${totalChapters} 章。`, outcome.kind || 'text', extra);
    return;
  }
  const tools = defineReadyTools(book, effectiveSettings, signal, changeLog).filter((tool) => allowed.has(tool.group));
  const decision = await runToolDecision({
    system: [
      '你是小说协作 Agent，根据用户消息选择一个工具调用。',
      '回答具体章节的内容、摘要或细节问题前，必须使用 read_book 工具读取章节，再根据返回内容作答。',
      '用户以数字指代章节（如“第十章”“第5到15章”）时，直接按数字/范围读取（read_book 的 target 传纯阿拉伯数字 "10" 或从小到大范围 "5-15"，不得 "15-5"），不必先读目录；仅当用户以标题指代且不确定序号时才先 read_book(field=chapters) 查目录；编辑类工具的章节参数一律传阿拉伯数字序号（从 1 开始）。',
      '用户明确要求操作（续写、改写、删除、插入、新建章节、更新简介、批量修改等）时必须调用对应工具完成，不得仅以聊天方式回应；工具能力不足时如实说明。',
      '章节新建/改写/删除/事件背景修改等操作完成后，必须调用 open_book_widget 展示书籍卡片并定位到相关章节（chapter 传数字序号）；调用后请用自己的话总结本次操作结果作为最终回复，不要复述工具内置文案。',
      'read_book 可读取图书最新数据（书名、简介、元数据、章节目录、章节内容、概况、时间线等）；用户询问任何书籍信息（书名、字数、进度、设定、章节内容、统计等）时，优先调用 read_book 获取真实数据，不要凭对话历史或猜测回答，也不要编造或沿用历史中可能错误的信息。',
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
          text: `正在生成第 ${Math.min(done, totalChapters || 1)}/${totalChapters || 1} 章…`
        };
      } else if (mode === 'modify') {
        job.progress = { total: 1, done: 0, text: '当前进度 0/1，正在改写章节…' };
      } else if (mode === 'delete') {
        job.progress = { total: 1, done: 0, text: '当前进度 0/1，正在删除章节…' };
      } else if (toolName === 'refresh_chapter_meta') {
        job.progress = { ...job.progress, done, text: '正在维护章节元数据…' };
      } else if (toolName === 'update_outline') {
        job.progress = { ...job.progress, done, text: '正在更新整书简介…' };
      }
    }
  });
  if (!decision.tool) {
    const outcome = decision.outcome || {};
    replaceProcessing(book, outcome.content || '好的，我记下了。', outcome.kind || 'text', finalOutcomeExtra(book, outcome, changeLog));
    return;
  }
  const outcome = decision.outcome || {};
  replaceProcessing(book, outcome.content || '好的，我记下了。', outcome.kind || 'text', finalOutcomeExtra(book, outcome, changeLog));
}

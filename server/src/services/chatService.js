import { readBookById, listBooks, saveBook } from '../lib/store.js';
import { newId, normalizeBook } from '../lib/bookUtils.js';
import { finalizeDraftBook } from './draftService.js';
import { prefilterDraftIntent, runRouter } from './router.js';
import { runTask } from './executor.js';
import { buildPlan } from './intentPlans.js';
import { defineReadyTools } from './tools.js';
import { defineDraftTools } from './draftTools.js';

const activeJobs = new Map();

// 需要写前确认（系统级 interrupt）的写意图
const WRITE_INTENTS = new Set(['create_append', 'create_insert', 'rewrite', 'delete', 'batch_edit', 'context_edit']);

function intentConfirmText(intent, output, target, settings) {
  switch (intent) {
    case 'create_append':
      return `将续写/新建 ${output?.chapters || settings.chaptersPerOutput || 1} 章（追加到末尾）。`;
    case 'create_insert':
      return `将在${Number.isInteger(target?.chapter) ? `第 ${target.chapter} 章${target?.position === 'before' ? '前' : '后'}` : '指定位置'}插入 ${output?.chapters || 1} 章。`;
    case 'rewrite':
      return `将改写第 ${target?.chapter || '目标'} 章。`;
    case 'delete':
      return `将删除第 ${target?.chapter || '目标'} 章（不可恢复）。`;
    case 'batch_edit':
      return '将执行批量修改（替换文本 / 修复前缀 / 删除末尾章节）。';
    case 'context_edit':
      return '将修改指定章节范围的事件背景。';
    default:
      return '将执行章节操作。';
  }
}

export function isConfirmation(text) {
  return /确认|确定|可以|没问题|不用改|不需要修改|就这样|开始生成|生成吧/.test(String(text));
}

export function hasPending(book) {
  return book.chat.some((message) => message.kind === 'processing');
}

// P2：工具效果统一记账——handler 只返回 effect（声明改了什么），
// 写回所需的 changeLog（chapterIds/deletedChapterIds/lastEditedIndex）由编排层从 effect 同步，单一真相。
export function syncChangeLogFromEffect(changeLog, book, outcome) {
  const effect = outcome?.effect;
  if (!effect || typeof effect !== 'object') return changeLog;
  const ids = Array.isArray(effect.ids) ? effect.ids : [];
  const renamedIds = Array.isArray(effect.renamedIds) ? effect.renamedIds : [];
  if (effect.type === 'chapters' && Number(effect.delta) < 0) {
    ids.forEach((id) => changeLog.deletedChapterIds.add(id));
  } else {
    ids.forEach((id) => changeLog.chapterIds.add(id));
  }
  renamedIds.forEach((id) => changeLog.chapterIds.add(id));
  // 最后变更章定位（卡片默认定位用）：删除场景用重排后仍存在的章，创建/改写用变更章
  const candidates = [...renamedIds, ...ids];
  let lastIndex = -1;
  for (const id of candidates) {
    const idx = book.chapters.findIndex((chapter) => chapter.id === id);
    if (idx !== -1) lastIndex = idx;
  }
  if (lastIndex !== -1) {
    changeLog.lastEditedIndex = lastIndex;
  } else if (Number(effect.delta) < 0) {
    changeLog.lastEditedIndex = Math.max(0, book.chapters.length - 1);
  }
  return changeLog;
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
  latest.pendingAction = mutated.pendingAction;
  latest.lastAppliedMessageId = mutated.lastAppliedMessageId;
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

export async function handleMessage(userId, bookId, content, settings = {}, messageId = '') {
  let book = bookId ? readBookById(bookId) : null;
  let created = false;
  if (!book && !bookId) { book = buildDraft(userId); created = true; }
  if (!book || book.userId !== userId) throw new Error('书籍或创作会话不存在');
  // 跨消息幂等：同一客户端消息 id 已成功应用过 → 直接返回该书，不再执行（防重试重复写入）
  if (messageId && book.lastAppliedMessageId === messageId) return book;
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
  const changeLog = { chapterIds: new Set(), deletedChapterIds: new Set() };
  const startChapterCount = book.chapters.length;
  const job = { controller, isNewDraft: created, progress: { total: 0, done: 0, text: '处理中…' } };
  activeJobs.set(jobKey, job);
  let succeeded = false;
  try {
    if (book.status === 'draft') {
      job.progress.text = '正在整理构思…';
      await handleDraftMessage(book, content, settings, controller.signal);
    } else {
      await handleReadyMessage(book, content, settings, controller.signal, changeLog, job);
    }
    succeeded = true;
  } catch (err) {
    const message = String(err.message || '');
    const stillProcessing = book.chat.some((item) => item.kind === 'processing');
    if (stillProcessing) {
      if (/中断/.test(message)) {
        replaceProcessing(book, '输出已中断', 'text');
      } else {
        // 写入已发生但后续中断/失败：提示部分完成，避免用户误判后重试造成重复写入
        const hasWrites = changeLog.chapterIds.size > 0 || changeLog.deletedChapterIds.size > 0 || book.chapters.length !== startChapterCount;
        replaceProcessing(
          book,
          hasWrites ? `处理中断，但已有部分操作完成（章节可能已更新），请查看后继续；错误：${message}` : `处理失败：${message}`,
          hasWrites ? 'text' : 'error'
        );
      }
    }
  } finally {
    activeJobs.delete(jobKey);
    if (succeeded && messageId) book.lastAppliedMessageId = messageId;
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
    // 与 ready 路径一致的信任守卫：仅当消息提到规模关键词才采纳
    if (Number.isInteger(filter.output.chapters) && /章/.test(content)) book.draft.chaptersPerOutput = filter.output.chapters;
    if (Number.isFinite(filter.output.chapterWords) && /字数|每章/.test(content)) book.draft.chapterWords = filter.output.chapterWords;
  }
  if (book.draft.summary && isConfirmation(content)) {
    await finalizeDraftBook(book, {
      ...settings,
      chatContext: [buildTodayHistory(book), `用户：${content}`].filter(Boolean).join('\n'),
      ...(Number.isInteger(book.draft.chaptersPerOutput) ? { chaptersPerOutput: book.draft.chaptersPerOutput } : {}),
      ...(Number.isFinite(book.draft.chapterWords) ? { chapterWords: book.draft.chapterWords } : {}),
      signal
    });
    replaceProcessing(book, `《${book.title}》已生成，共 ${book.chapters.length} 章。`, 'book', { bookId: book.id });
    return;
  }
  const decision = await runTask({
    system: '你是小说构思整合 Agent。构思信息已齐全（或由用户决定），调用 confirm_draft 输出整合后的完整构思摘要；用户此前已确认过摘要时，根据最新修改意见重新整合。',
    tools: defineDraftTools(book),
    user: conversation,
    signal,
    plan: { termination: { kind: 'single' } }
  });
  if (decision.tool === 'confirm_draft' && decision.outcome?.data) {
    replaceProcessing(book, decision.outcome.data, 'confirm');
    return;
  }
  replaceProcessing(book, decision.outcome?.content || '我还没有完全理解你的构思，请补充主角、故事背景或小说总字数。', 'question', decision.outcome?.extra || {});
}

async function handleReadyMessage(book, content, settings, signal, changeLog, job) {
  const last = book.chapters[book.chapters.length - 1];
  // 系统级 interrupt：上一条消息已落 pendingAction，本条为“确认”则恢复执行；否则清除 pending 按新消息路由
  const isConfirmReply = isConfirmation(content) && Boolean(book.pendingAction);
  let route;
  if (isConfirmReply) {
    route = {
      mode: 'tool',
      intent: book.pendingAction.intent,
      output: book.pendingAction.output,
      target: book.pendingAction.target
    };
  } else {
    if (book.pendingAction) book.pendingAction = null;
    route = await runRouter({
      user: content,
      history: buildTodayHistory(book),
      signal,
      system: [
        '你是小说创作平台的意图路由 Agent。',
        '只负责判断用户意图，不要判断章节内容是否正确或连贯：剧情对错必须由执行阶段 read_book 实证，路由阶段看到的概况/摘要仅供参考定位，不得据此直接回复用户或下结论。',
        'read_book 可读取图书最新数据（书名、简介、元数据、章节目录、章节内容、概况、发展线等）；用户询问任何书籍信息时意图为 read。',
        `全书概况：${book.storySummary || '暂无'}`,
        `最近章节摘要：${last?.summary || last?.title || '暂无'}`
      ].join('\n')
    });
  }
  if (route.mode === 'chat') {
    replaceProcessing(book, route.reply || '好的，我记下了。', 'text', { bookId: book.id });
    return;
  }
  // 路由产出意图 → 任务单（工具白名单 + 步骤 + 完成条件），执行器按任务单执行
  // 输出规模信任守卫：仅当用户消息明确提到 章/字数/每章 时才采用路由解析的 output，
  // 防止模型虚构 chapterWords/chapters 覆盖用户设置（自查发现“再写一章”被虚构 1000 字）。
  const safeOutput = /章|字数|每章/.test(content) ? route.output : null;
  const plan = buildPlan(route.intent, { output: safeOutput, target: route.target, settings });
  if (settings.confirmBeforeWrite && !isConfirmReply && WRITE_INTENTS.has(route.intent)) {
    book.pendingAction = { intent: route.intent, output: route.output, target: route.target, content };
    replaceProcessing(book, `确认执行：${intentConfirmText(route.intent, route.output, route.target, settings)}\n\n回复“确认”继续，或直接提出修改。`, 'question');
    return;
  }
  const effectiveSettings = safeOutput?.chapterWords
    ? { ...settings, chapterWords: safeOutput.chapterWords }
    : settings;
  // 任务单显式工具白名单：模型只能调用任务允许的工具（如改写意图不再暴露 update_events_context 等）
  const allowedTools = new Set(plan.tools);
  const tools = defineReadyTools(book, effectiveSettings, signal).filter((tool) => allowedTools.has(tool.name));
  const counted = plan.termination.kind === 'counted';
  const totalChapters = counted ? plan.termination.target : 0;
  job.progress.total = totalChapters;
  job.progress.text = counted ? `开始生成（共 ${totalChapters} 章）…` : '正在处理…';
  const decision = await runTask({
    system: [
      '你是小说协作 Agent，按任务单执行，不要自行扩展或缩减任务。',
      `任务单：${plan.text}`,
      '只能使用任务单允许的工具；完成条件由系统强制，达到后立即用自己的话总结回复用户（不要复述工具返回文本，不要重复调用已完成步骤的工具）。',
      '回答具体章节的内容、摘要或细节问题前，必须使用 read_book 读取最新真实数据，以工具返回为准；不要凭记忆猜测，也不要沿用或复述对话历史中的旧结论/旧摘要（包括此前模型的分析），数据冲突时一律以 read_book 最新返回为准。',
      '编辑类工具参数一律传阿拉伯数字序号（从 1 开始）；仅当用户以标题指代且不确定序号时才先 read_book(field=chapters) 查目录。',
      `全书摘要：${book.storySummary || '暂无'}`,
      `最近章节摘要：${last?.summary || last?.title || '暂无'}`
    ].join('\n'),
    tools,
    user: content,
    context: buildTodayHistory(book),
    signal,
    plan,
    onStep: (toolName, outcome, args, state) => {
      syncChangeLogFromEffect(changeLog, book, outcome);
      if (counted) {
        job.progress = {
          total: totalChapters,
          done: Math.min(state.done, totalChapters),
          text: `正在生成第 ${Math.min(state.done, totalChapters)}/${totalChapters} 章…`
        };
        return;
      }
      const mode = String(args?.mode || '');
      if (mode === 'modify') {
        job.progress = { total: 1, done: 0, text: '当前进度 0/1，正在改写章节…' };
      } else if (mode === 'delete') {
        job.progress = { total: 1, done: 0, text: '当前进度 0/1，正在删除章节…' };
      } else if (toolName === 'refresh_chapter_meta') {
        job.progress = { total: 1, done: 0, text: '正在维护章节元数据…' };
      } else if (toolName === 'update_outline') {
        job.progress = { total: 1, done: 0, text: '正在更新整书简介…' };
      } else if (toolName === 'update_book_target') {
        job.progress = { total: 1, done: 0, text: '正在调整目标字数…' };
      } else if (toolName === 'open_book_widget') {
        job.progress = { total: 1, done: 0, text: '正在展示书籍卡片…' };
      }
    }
  });
  const outcome = decision.outcome || {};
  const extra = finalOutcomeExtra(book, outcome, changeLog);
  if (outcome.kind === 'book' && counted && !extra.chapter) extra.chapter = book.chapters.length;
  book.pendingAction = null;
  replaceProcessing(book, outcome.content || '好的，我记下了。', outcome.kind || 'text', extra);
}

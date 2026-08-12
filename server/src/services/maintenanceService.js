// 章节元数据统一维护内核：章节 summary/event 与全书概况的新建、更新、清理全部收敛于此。
// 输入始终与“变更量”成正比（变更章 + 前后章摘要 + 全书概况 + 删除记录），不携带全书 events 列表，长书安全。
// 维护调用关闭思考模式（thinking=disabled）以换取速度。
import { callModel } from '../lib/modelCall.js';

function eventId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function cleanEvents(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      id: eventId(),
      event: String(item?.event || '').trim(),
      characters: Array.isArray(item?.characters) ? item.characters.map(String) : [],
      time: String(item?.time || '').trim(),
      context: Array.isArray(item?.context)
        ? item.context.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 3)
        : [],
      foreshadow: item?.foreshadow === 'setup' || item?.foreshadow === 'pay' ? item.foreshadow : null,
      foreshadowFor: String(item?.foreshadowFor || '').trim()
    }))
    .filter((item) => item.event);
}

function deletedText(book) {
  const deletes = Array.isArray(book.pendingDeletes) ? book.pendingDeletes : [];
  if (deletes.length === 0) return '';
  return `已删除章节（概况与事件中不得再出现其内容）：${deletes
    .map((item) => `第${Number(item.index) + 1}章《${item.title || ''}》`)
    .join('、')}\n`;
}

function chapterEventsText(chapter) {
  const items = Array.isArray(chapter?.events) ? chapter.events.slice(0, 5) : [];
  if (items.length === 0) return '';
  return items
    .map((item) => {
      const ctx = Array.isArray(item.context) && item.context.length > 0 ? `（${item.context.join('/')}）` : '';
      return `${item.event}${ctx}`;
    })
    .join('；');
}

// 单章维护：一次关思考调用产出 新 summary + events + 更新后全书概况，原子写入并消费 pendingDeletes。
// mode: 'new'（新建章）| 'modify'（改写章）。
export async function maintainChapterMeta(book, { chapterIndex, mode = 'modify', signal } = {}) {
  const index = Number(chapterIndex);
  const chapter = book.chapters[index];
  if (!chapter) throw new Error('章节不存在');
  const prev = index > 0 ? book.chapters[index - 1] : null;
  const next = index < book.chapters.length - 1 ? book.chapters[index + 1] : null;
  const content = String(chapter.content || '').trim();
  if (!content) {
    // 空章不产出无意义摘要/事件：直接落“该章暂无内容”，不走 AI；pendingDeletes 保留待有内容章维护时清理。
    chapter.summary = '该章暂无内容';
    chapter.events = [];
    chapter.updatedAt = new Date().toISOString();
    book.updatedAt = chapter.updatedAt;
    return book;
  }
  const existingEvents = Array.isArray(chapter.events) && chapter.events.length > 0
    ? `该章现有事件：${chapter.events.map((item) => item.event).join('；')}\n`
    : '';
  const prevEvents = prev ? chapterEventsText(prev) : '';
  const nextEvents = next ? chapterEventsText(next) : '';
  const user = [
    `全书概况：\n${book.storySummary || '暂无'}`,
    deletedText(book),
    `目标章节：第 ${index + 1} 章《${chapter.title}》（${mode === 'new' ? '新建' : '改写'}）`,
    prev ? `上一章摘要：${prev.summary || `${prev.title}\n${prev.content.slice(0, 500)}`}` : '',
    next ? `下一章摘要：${next.summary || `${next.title}\n${next.content.slice(0, 500)}`}` : '',
    prevEvents ? `上一章事件：${prevEvents}` : '',
    nextEvents ? `下一章事件：${nextEvents}` : '',
    `章节正文：\n${content.slice(0, 12000)}`,
    existingEvents,
    '返回 JSON：{"summary":"本章 80-150 字剧情摘要","events":[{"event":"事件","characters":["人物"],"time":"文中时间点（可选）","context":["大背景","细场景"],"foreshadow":"setup|pay|null","foreshadowFor":"伏笔指向（可选）"}],"prose":"更新后的精简全书概况（300-800 字）"}。events 只包含本章事件且必须能在本章正文中找到依据，不得凭空编造；context 为背景路径数组（从大到小最多 3 层，如 ["秘境探险","藏宝室"]），应延续前后章事件中的背景并随阶段细化；删除的章节不得出现。'
  ].filter(Boolean).join('\n');
  const result = await callModel(
    () => ({
      system: '你是全书概况与章节元数据维护助手。事件必须来自本章正文内容，不得凭空编造；背景 context 延续前后章事件，同一大事件跨多章时按阶段/地点细化 context（如“秘境探险→藏宝室→决战之地”），避免整段只有一个粗背景；只返回 JSON，不要包含 Markdown。',
      user,
      temperature: 0.4,
      maxTokens: 4096,
      thinkingType: 'disabled'
    }),
    (r) => r && typeof r.summary === 'string' && r.summary.trim() && typeof r.prose === 'string'
  );
  chapter.summary = String(result.summary).trim();
  chapter.events = cleanEvents(result.events);
  book.storySummary = String(result.prose).trim();
  book.pendingDeletes = [];
  chapter.updatedAt = new Date().toISOString();
  book.updatedAt = chapter.updatedAt;
  return book;
}

// 新书一次性初始化：输入各章标题+摘要（O(章数)，≤5 章），输出每章 events 与全书概况。
// 构思生成独立通道专用，与已生成图书的单章维护内核分离。
export async function initializeBookMeta(book, signal) {
  const chapters = (book.chapters || [])
    .map((chapter, index) => `第 ${index + 1} 章《${chapter.title}》：${chapter.summary || '（无摘要）'}`)
    .join('\n');
  if (!chapters.trim()) return book;
  const result = await callModel(
    () => ({
      system: '你是全书概况初始化助手。只返回 JSON，不要包含 Markdown。',
      user: `根据各章摘要生成每章结构化事件与全书概况。\n章节：\n${chapters}\n返回 JSON：{"chapters":[{"chapterIndex":0,"events":[{"event":"事件","characters":["人物"],"time":"文中时间点（可选）","context":["大背景","细场景"]}]}],"prose":"精简全书概况（300-800 字）"}。事件必须能在对应章节摘要中找到依据；context 为背景路径数组（从大到小最多 3 层）。`,
      temperature: 0.4,
      maxTokens: 4096,
      thinkingType: 'disabled'
    }),
    (r) => Array.isArray(r?.chapters) && typeof r.prose === 'string'
  );
  const byIndex = new Map(
    (Array.isArray(result.chapters) ? result.chapters : [])
      .map((item) => [Number(item.chapterIndex), cleanEvents(item.events)])
  );
  book.chapters.forEach((chapter, index) => {
    if (byIndex.has(index)) chapter.events = byIndex.get(index);
  });
  if (typeof result.prose === 'string' && result.prose.trim()) {
    book.storySummary = result.prose.trim();
  }
  book.updatedAt = new Date().toISOString();
  return book;
}

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

// 事件确定性归一化（维护内核通用规则，非单工具补丁）：
// 1) 每章最多 3 个事件（prompt 要求按重要性排序，这里做硬上限）；
// 2) 一章只允许一个主要背景 context[0]：取出现最多的为统一背景，其余事件归入，
//    保留各自 context[1]/[2]（场景可不同，大背景唯一）。
export function normalizeChapterEvents(raw) {
  const events = cleanEvents(raw).slice(0, 3);
  if (events.length === 0) return events;
  const counts = new Map();
  for (const item of events) {
    const label = Array.isArray(item.context) && item.context[0] ? item.context[0] : '';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  let dominant = '';
  let max = -1;
  for (const [label, n] of counts) {
    if (n > max) {
      dominant = label;
      max = n;
    }
  }
  return events.map((item) => ({
    ...item,
    context: dominant
      ? [dominant, ...(Array.isArray(item.context) ? item.context.slice(1, 3) : [])]
      : []
  }));
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
    '返回 JSON：{"summary":"本章 80-150 字剧情摘要","events":[{"event":"事件","characters":["人物"],"time":"文中时间点（可选）","context":["大背景","场景"],"foreshadow":"setup|pay|null","foreshadowFor":"伏笔指向（可选）"}],"prose":"更新后的精简全书概况（300-800 字）"}。事件规则：events 只包含本章事件且必须能在本章正文中找到依据，不得凭空编造；每章只输出最重要的 3 个事件（最多 3 个，按重要性排序），删除琐碎细节；每条 event 正文不超过 50 字（event 只描述事件本身，背景/伏笔/时间分别放 context/foreshadow/time 字段）。背景规则：context[0] 是贯穿当前情节段的大背景/阶段（如"家族""北境矿脉之行"），不是确切地名，同一情节段的章节 context[0] 必须保持一致——即使本章出现其他地点的细节（如北境途中写到家族宅院），只要主线属于该阶段，context[0] 统一为该阶段；context[1] 是场景/剧情推进细分，可以是确切地点（如"家里""藏书阁""矿洞深处"）并体现剧情推进到什么阶段；大背景下场景最多 3 个；context 最多 3 层并延续前后章事件中的背景；每条事件都必须给出 context（至少 1 层），不得返回空数组；删除的章节不得出现。'
  ].filter(Boolean).join('\n');
  const result = await callModel(
    () => ({
      system: '你是全书概况与章节元数据维护助手。事件必须来自本章正文内容，不得凭空编造；背景 context 延续前后章事件，同一大事件跨多章时按阶段/地点细化 context（如“秘境探险→藏宝室→决战之地”），避免整段只有一个粗背景；只返回 JSON，不要包含 Markdown。',
      user,
      temperature: 0.4,
      maxTokens: 16384,
      thinkingType: 'disabled'
    }),
    (r) => r && typeof r.summary === 'string' && r.summary.trim() && typeof r.prose === 'string'
  );
  chapter.summary = String(result.summary).trim();
  chapter.events = normalizeChapterEvents(result.events);
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
      user: `根据各章摘要生成每章结构化事件与全书概况。\n章节：\n${chapters}\n返回 JSON：{"chapters":[{"chapterIndex":0,"events":[{"event":"事件","characters":["人物"],"time":"文中时间点（可选）","context":["大背景","场景"]}]}],"prose":"精简全书概况（300-800 字）"}。事件规则：事件必须能在对应章节摘要中找到依据；每章只输出最重要的 3 个事件（最多 3 个，按重要性排序）；每条 event 正文不超过 50 字（简洁概括事件本身）。背景规则：context[0] 是贯穿情节段的大背景/阶段（如"家族"），不是确切地名，同一情节段保持一致，即使章内出现其他地点细节也统一归入主线阶段；context[1] 是场景，可以是确切地点并体现剧情推进；大背景下场景最多 3 个；每条事件都必须给出 context（至少 1 层），不得返回空数组。`,
      temperature: 0.4,
      maxTokens: 16384,
      thinkingType: 'disabled'
    }),
    (r) => Array.isArray(r?.chapters) && typeof r.prose === 'string'
  );
  const byIndex = new Map(
    (Array.isArray(result.chapters) ? result.chapters : [])
      .map((item) => [Number(item.chapterIndex), normalizeChapterEvents(item.events)])
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

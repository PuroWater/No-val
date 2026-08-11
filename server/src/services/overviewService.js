// 概况/事件维护服务：全书概况（storySummary）与章节事件（chapter.events）的写内核。
// 平行职责：新增章节、续写、改写、摘要编辑、删除末尾章后都由本模块自动差分维护概况；
// 所有函数输入均为 O(变更数)，不携带全书事件列表，长篇小说安全。
import { callModel } from '../lib/modelCall.js';

export function applyChapterEvents(book, changedIndexes, eventsByChapter, prose) {
  const indexes = new Set(changedIndexes.map(Number));
  book.chapters.forEach((chapter, index) => {
    if (!indexes.has(index)) return;
    const events = (eventsByChapter && eventsByChapter[index]) || [];
    chapter.events = events.map((item) => ({
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      event: String(item.event || '').trim(),
      characters: Array.isArray(item.characters) ? item.characters.map(String) : []
    }));
  });
  if (typeof prose === 'string' && prose.trim()) book.storySummary = prose.trim();
}

// 仅取“本次变更章节”的现有事件作为差分参照，输入与章节总数无关（O(变更数)）。
export function changedEventsContext(book, changes) {
  const lines = [];
  for (const change of changes) {
    const index = Number(change.chapterIndex);
    const chapter = book.chapters[index];
    if (!chapter || !Array.isArray(chapter.events)) continue;
    const events = chapter.events.map((item) => item.event || '').filter(Boolean);
    if (events.length === 0) continue;
    lines.push(`第${index + 1}章现有事件：${events.join('；')}`);
  }
  return lines.length > 0 ? `变更章现有事件：\n${lines.join('\n')}` : '';
}

// 差分维护：输入只含“全书概况 + 变更章旧/新摘要 + 变更章自身旧事件”（O(变更数)），
// 输出只返回变更章事件与更新后散文；不携带全书事件列表，长篇小说安全。
export async function syncChapterOverview(book, changes = []) {
  const valid = changes.filter((change) => change && Number.isInteger(change.chapterIndex));
  if (valid.length === 0) return book;
  const desc = valid
    .map((change) => {
      const index = change.chapterIndex + 1;
      const action = !change.oldSummary ? '新增章节' : !change.newSummary ? '删除章节' : '改写章节';
      return `第${index}章（${action}）\n${change.oldSummary ? `旧摘要：${change.oldSummary}` : ''}\n${change.newSummary ? `新摘要：${change.newSummary}` : ''}`.trim();
    })
    .join('\n');
  const result = await callModel(
    () => ({
      system: '你是全书概况维护助手。根据章节变更返回该章结构化事件与更新后的精简全书概况。只返回 JSON，不要包含 Markdown。',
      user: `当前全书概况：\n${book.storySummary || '暂无'}\n\n章节变更：\n${desc}\n\n${changedEventsContext(book, valid)}\n返回 JSON：{"chapters":[{"chapterIndex":0,"events":[{"event":"事件","characters":["人物"]}]}],"prose":"更新后的精简全书概况"}。chapters 只包含本次变更的章节，删除章节时返回空 events；prose 为精简全书概况，一般 300-800 字，不要超过 800 字。`,
      temperature: 0.4,
      maxTokens: 4096
    }),
    (result) => Array.isArray(result?.chapters) && typeof result.prose === 'string'
  );
  const deletedIndexes = new Set(
    valid.filter((change) => change.oldSummary && !change.newSummary).map((change) => change.chapterIndex)
  );
  const byChapter = {};
  for (const item of result.chapters || []) {
    const index = Number(item.chapterIndex);
    byChapter[index] = deletedIndexes.has(index) ? [] : item.events || [];
  }
  applyChapterEvents(book, valid.map((change) => change.chapterIndex), byChapter, result.prose);
  return book;
}

// 删除末尾章后的概况结尾更新：输入 O(1)（旧概况 + 新末章摘要/结尾节选），
// 让 AI 按本书篇幅比例 + 保底字数重新裁定概况结尾，不涉及全量章节，长小说安全。
export async function updateOverviewTail(book) {
  const last = book.chapters[book.chapters.length - 1];
  if (!last) {
    book.storySummary = '';
    return book.storySummary;
  }
  if (!book.storySummary) return book.storySummary;
  const tailSource = last.summary
    ? `摘要：${last.summary}`
    : `正文结尾（节选）：${String(last.content || '').slice(-400) || '暂无'}`;
  const result = await callModel(
    () => ({
      system: '你是小说编辑。根据“当前全书概况”和“新的最后一章”修改概况结尾，使故事收束在新最后一章。只返回 JSON。',
      user: `【当前全书概况】\n${book.storySummary}\n\n【新的最后一章】第 ${book.chapters.length} 章《${last.title}》：${tailSource}\n\n【要求】\n- 概况里不能再出现已删除章节的内容；\n- 在概况末尾补上 2-3 句新结尾，与新最后一章衔接，不要改动概况前半段；\n- 新结尾约 100-200 字。\n\n【输出】{"prose":"完整的修改后概况"}`,
      temperature: 0.2,
      maxTokens: 4096
    }),
    (result) => result && typeof result.prose === 'string' && result.prose.trim()
  );
  book.storySummary = result.prose.trim();
  return book.storySummary;
}

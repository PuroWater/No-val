// 写正文公共提示词构造：createChapter / rewriteChapter 共用，
// 降低三处拼装漂移。原则：写正文只注入“当天+本条”聊天上下文（有界）+ 章节上下文，不注入全量历史。

// 章节收尾规则：未收尾章节禁止“总结升华式”假闭合收尾（0.8.40）。
// 只约束“章节收尾”行为（不堆正则），由 writingSystem 注入全部写正文调用。
export const CHAPTER_ENDING_RULE =
  '章节收尾：全书未到收尾阶段时，本章结尾必须是情节进行中的自然节点（停在悬念、转折或未决冲突上），' +
  '不要做章节总结、感慨或升华收尾；禁止“他知道明天会更好”“一切才刚刚开始”这类总结式结尾句；' +
  '只有全书达到目标字数且需要收束故事时才允许完结式收尾。';

// 脉络/纲要扩写规则：分条输入逐条扩展，覆盖所有要点、保持顺序、不增删主干（0.8.40）。
export const OUTLINE_EXPANSION_RULE =
  '当指令或原章节是分条纲要/脉络时，逐条扩展为连贯正文：覆盖所有要点、保持原有顺序、不增删主干情节；' +
  '细节可丰富，但不得遗漏条目或自创主线。';

export function writingSystem(role = '创作', stylePrompt = '') {
  const style = stylePrompt ? `${stylePrompt}` : '';
  return `你是小说${role}助手。${CHAPTER_ENDING_RULE}${OUTLINE_EXPANSION_RULE}${style}始终只返回 JSON，不要包含 Markdown。`;
}

export const PARAGRAPH_RULE = '正文按情节自然分段，段落之间用空行分隔。';

// “当天+本条”聊天上下文节选（写正文类专用，有界）
export function chatContextRef(chatContext, limit = 2000) {
  return chatContext
    ? `\n近期创作对话（当天+本条，供理解构思与写作方向，只做参考不要复述）：\n${String(chatContext).slice(-limit)}`
    : '';
}

// 全书进度提示（新章专属）：目标字数 + 当前已写 + 百分比 + 收束/推进指令（确定性计算，零 AI 成本）。
// 0.8.39 起随删除全书概况一并移入新章上下文，createChapter 不再单独拼装。
function progressRef(book) {
  const targetWords = Number(book.targetWords) || 0;
  const writtenWords = (book.chapters || []).reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
  if (targetWords > 0) {
    const percent = Math.round((writtenWords / targetWords) * 100);
    const ending = writtenWords >= targetWords
      ? '全书已达到目标字数：除非用户明确要求继续，本章应收束故事、作为完结收尾，不要再展开新主线。'
      : '请按剩余篇幅推进剧情：未接近全书尾声时不得提前大结局，也不要拖沓。';
    return `全书目标约 ${targetWords} 字，当前已写约 ${writtenWords} 字（约 ${percent}%）。${ending}`;
  }
  return '请稳步推进剧情，不要在单章内仓促完结大事件。';
}

// 创作新章节的章节上下文（有界）：前后章摘要 + 上下章首尾节选 + 全书进度。
// 行序统一：上章摘要 → 上章结尾节选 → 下章摘要 → 下章开头节选 → 进度（新章专属；追加末尾时无下章）。
export function creationContextRef(book, prev, next) {
  return [
    prev ? `上一章摘要：${prev.summary || `${prev.title}\n${prev.content.slice(0, 500)}`}` : '',
    prev ? `上一章结尾（节选）：${prev.content.slice(-400)}` : '',
    next ? `下一章摘要：${next.summary || `${next.title}\n${next.content.slice(0, 500)}`}` : '',
    next ? `下一章开头（节选）：${next.content.slice(0, 400)}` : '',
    progressRef(book)
  ].filter(Boolean).join('\n');
}

// 改写的附近章节语境（有界）：前后章摘要 + 结尾/开头节选（无进度，行序与创作上下文一致）。
export function rewriteContextRef(book, prev, next) {
  return [
    `上一章摘要：${prev?.summary || '无'}`,
    prev ? `上一章结尾（节选）：${prev.content.slice(-400)}` : '',
    `下一章摘要：${next?.summary || '无'}`,
    next ? `下一章开头（节选）：${next.content.slice(0, 400)}` : ''
  ].filter(Boolean).join('\n');
}

// 写正文注入：目标章上下文相关人物的近期动向（0.9.0 方案 A）。
// 只取 untilChapter（不含）之前每个人物最近的 3-5 条事件，局部有界。
import { buildCharacterIndex } from '../services/storyMetaService.js';

export function characterContextRef(book, { untilChapter = Number.MAX_SAFE_INTEGER, relatedNames = [] } = {}) {
  const names = [...new Set((relatedNames || []).map((n) => String(n).trim()).filter(Boolean))];
  if (names.length === 0) return '';
  const index = buildCharacterIndex(book);
  const lines = [];
  for (const name of names) {
    const record = index[name];
    if (!record) continue;
    const recent = [];
    for (const chapter of record.chapters) {
      if (chapter >= untilChapter) continue;
      (record.events[chapter] || []).forEach((ev) => recent.push({ chapter, ev }));
    }
    recent.sort((a, b) => b.chapter - a.chapter);
    const pick = recent.slice(0, 5).reverse();
    if (pick.length > 0) {
      lines.push(`- ${name}：${pick.map((item) => `第${item.chapter + 1}章 ${item.ev}`).join('；')}`);
    }
  }
  return lines.length > 0 ? `相关人物近期动向：\n${lines.join('\n')}` : '';
}

// 世界观快照（0.9.9）：取 untilChapter 之前最新一张世界观快照，局部有界；写正文只读、可扩展不封闭。
export function worldSnapshotRef(book, { untilChapter = Number.MAX_SAFE_INTEGER } = {}) {
  const history = (book.world?.history || []).filter((item) => Number(item.chapter) < untilChapter);
  const latest = history[history.length - 1];
  if (!latest?.snapshot) return '';
  const s = latest.snapshot;
  const fmt = (list) => list.map((item) => (item.status ? `${item.name}（${item.status}）` : item.name)).join('、');
  const parts = [];
  if (s.summary) parts.push(`总述/规则：${s.summary}`);
  if (s.factions.length) parts.push(`势力：${fmt(s.factions)}`);
  if (s.places.length) parts.push(`地点：${fmt(s.places)}`);
  if (s.systems.length) parts.push(`体系/规则：${fmt(s.systems)}`);
  return parts.length > 0 ? `世界设定（当前已知，剧情需要时可新增）：\n${parts.join('\n')}` : '';
}

// 人物设定快照（0.9.6）：相关人物截至 untilChapter（不含）的最新一张结构化快照卡
// （identity + bag + goal + recent），局部有界；注入只读相关卡，不遍历历史链。
function formatCharacterSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return '（无）';
  const parts = [];
  if (snapshot.identity) parts.push(`身份：${snapshot.identity}`);
  const real = (snapshot.bag || []).filter((b) => !b.junk);
  if (real.length > 0) parts.push(`背包：${real.map((b) => (b.status ? `${b.name}（${b.status}）` : b.name)).join('、')}`);
  const junk = (snapshot.bag || []).filter((b) => b.junk);
  if (junk.length > 0) parts.push(`杂物：${junk.map((b) => b.status || b.name).join('、')}`);
  if (snapshot.goal) parts.push(`目标：${snapshot.goal}`);
  if (snapshot.recent) parts.push(`近况：${snapshot.recent}`);
  return parts.join('；') || '（无）';
}

export function characterCardsRef(book, { untilChapter = Number.MAX_SAFE_INTEGER, relatedNames = [] } = {}) {
  const names = [...new Set((relatedNames || []).map((n) => String(n).trim()).filter(Boolean))];
  if (names.length === 0) return '';
  const lines = [];
  (book.characters || []).forEach((card) => {
    if (!names.includes(card.name)) return;
    const history = (card.history || []).filter((item) => Number(item.chapter) < untilChapter);
    const latest = history[history.length - 1];
    if (latest && latest.snapshot) {
      lines.push(`- ${card.name}（第${Number(latest.chapter) + 1}章）：${formatCharacterSnapshot(latest.snapshot)}`);
    }
  });
  return lines.length > 0 ? `人物设定（最新）：\n${lines.join('\n')}` : '';
}

// 写正文公共提示词构造：createChapter / rewriteChapter / ensureChapterLength 共用，
// 降低三处拼装漂移。原则：写正文只注入“当天+本条”聊天上下文（有界）+ 章节上下文，不注入全量历史。

export function writingSystem(role = '创作') {
  return `你是小说${role}助手。始终只返回 JSON，不要包含 Markdown。`;
}

export const PARAGRAPH_RULE = '正文按情节自然分段，段落之间用空行分隔。';

// “当天+本条”聊天上下文节选（写正文类专用，有界）
export function chatContextRef(chatContext, limit = 2000) {
  return chatContext
    ? `\n近期创作对话（当天+本条，供理解构思与写作方向，只做参考不要复述）：\n${String(chatContext).slice(-limit)}`
    : '';
}

export function storySummaryRef(storySummary) {
  return `全书概况：${storySummary || '暂无'}`;
}

// 创作新章节的章节上下文（有界）：概况 + 前后章摘要 + 上章末尾/下章开头节选 + 关系网
export function creationContextRef(book, prev, next) {
  return [
    storySummaryRef(book.storySummary),
    prev ? `上一章摘要：${prev.summary || `${prev.title}\n${prev.content.slice(0, 500)}`}` : '',
    prev ? `上一章结尾（节选）：${prev.content.slice(-400)}` : '',
    next ? `下一章摘要：${next.summary || `${next.title}\n${next.content.slice(0, 500)}`}` : '',
    next ? `下一章开头（节选）：${next.content.slice(0, 400)}` : '',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
  ].filter(Boolean).join('\n');
}

// 改写的附近章节语境（有界）：前后章摘要 + 结尾/开头节选 + 关系网
export function rewriteContextRef(book, prev, next) {
  return [
    `上一章摘要：${prev?.summary || '无'}`,
    prev ? `上一章结尾（节选）：${prev.content.slice(-400)}` : '',
    `下一章摘要：${next?.summary || '无'}`,
    next ? `下一章开头（节选）：${next.content.slice(0, 400)}` : '',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
  ].filter(Boolean).join('\n');
}

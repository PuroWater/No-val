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

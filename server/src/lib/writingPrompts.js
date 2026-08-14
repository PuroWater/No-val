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

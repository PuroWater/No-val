// 输出规模边界与归一化：纯参数校验层（不属于意图判断，属于安全边界）。
export const OUTPUT_LIMITS = { maxChapters: 5, minChapterWords: 1000, maxChapterWords: 10000 };
export const OVER_LIMIT_REPLY = '当前输出超过限定：单次最多 5 章、每章 1000-10000 字，请调整后重试。';

export function normalizeOutputScale(rawOutput) {
  const chapters = Number(rawOutput?.chapters);
  const chapterWords = Number(rawOutput?.chapterWords);
  const over = (Number.isInteger(chapters) && (chapters < 1 || chapters > OUTPUT_LIMITS.maxChapters))
    || (Number.isFinite(chapterWords) && (chapterWords < OUTPUT_LIMITS.minChapterWords || chapterWords > OUTPUT_LIMITS.maxChapterWords));
  if (over) return { output: null, over: true };
  const output = {};
  if (Number.isInteger(chapters)) output.chapters = Math.min(OUTPUT_LIMITS.maxChapters, Math.max(1, chapters));
  if (Number.isFinite(chapterWords)) output.chapterWords = Math.min(
    OUTPUT_LIMITS.maxChapterWords,
    Math.max(OUTPUT_LIMITS.minChapterWords, Math.round(chapterWords))
  );
  return { output: Object.keys(output).length > 0 ? output : null, over: false };
}

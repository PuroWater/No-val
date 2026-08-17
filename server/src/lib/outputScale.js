// 输出规模边界与归一化：纯参数校验层（不属于意图判断，属于安全边界）。
export const OUTPUT_LIMITS = { maxChapters: 5, minChapterWords: 1000, maxChapterWords: 10000 };
export const OVER_LIMIT_REPLY = '当前输出超过限定：单次最多 5 章、每章 1000-10000 字，请调整后重试。';

function normalizeScaleValue(value, { min, max, integer = false } = {}) {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'default') return 'default';
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (integer && !Number.isInteger(number)) return undefined;
  if (!Number.isFinite(number)) return undefined;
  if (number < min || number > max) return { over: true };
  return integer ? Math.round(number) : Math.round(number);
}

export function normalizeOutputScale(rawOutput, { fillDefaults = false } = {}) {
  if (!rawOutput || typeof rawOutput !== 'object' || Array.isArray(rawOutput)) {
    return { output: fillDefaults ? { chapters: 'default', chapterWords: 'default' } : null, over: false };
  }
  const rawChapters = normalizeScaleValue(rawOutput.chapters, {
    min: 1,
    max: OUTPUT_LIMITS.maxChapters,
    integer: true
  });
  const rawChapterWords = normalizeScaleValue(rawOutput.chapterWords, {
    min: OUTPUT_LIMITS.minChapterWords,
    max: OUTPUT_LIMITS.maxChapterWords
  });
  if (rawChapters?.over || rawChapterWords?.over) return { output: null, over: true };
  const output = {};
  if (rawChapters !== undefined) output.chapters = rawChapters;
  if (rawChapterWords !== undefined) output.chapterWords = rawChapterWords;
  if (fillDefaults) {
    if (output.chapters === undefined) output.chapters = 'default';
    if (output.chapterWords === undefined) output.chapterWords = 'default';
  }
  return { output: Object.keys(output).length > 0 ? output : null, over: false };
}

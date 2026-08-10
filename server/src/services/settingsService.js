import { readJson, SETTINGS_FILE } from '../lib/store.js';

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function getUserSettings(userId) {
  const settings = readJson(SETTINGS_FILE, []);
  const current = settings.find((item) => item.userId === userId) || {};
  return {
    theme: current.theme || 'light',
    fontSize: current.fontSize || 'medium',
    chaptersPerOutput: clampInt(current.chaptersPerOutput, 1, 5, 3),
    chapterWords: clampInt(current.chapterWords, 1000, 10000, 2000)
  };
}

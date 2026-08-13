import { readJson, SETTINGS_FILE } from '../lib/store.js';
import { defaultSettings } from '../lib/settingsDefaults.js';

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function getUserSettings(userId) {
  const settings = readJson(SETTINGS_FILE, []);
  const current = settings.find((item) => item.userId === userId) || {};
  const base = defaultSettings(userId);
  return {
    theme: current.theme || base.theme,
    fontSize: current.fontSize || base.fontSize,
    chaptersPerOutput: clampInt(current.chaptersPerOutput, 1, 5, base.chaptersPerOutput),
    chapterWords: clampInt(current.chapterWords, 1000, 10000, base.chapterWords),
    enterToSend: current.enterToSend !== false,
    thinkingForWriting: current.thinkingForWriting === true,
    // 0.8.6 起字段改名 developmentLineOrientation，旧名 timelineOrientation 兼容
    developmentLineOrientation: (current.developmentLineOrientation ?? current.timelineOrientation) === 'horizontal' ? 'horizontal' : 'vertical',
    reviewAfterWrite: current.reviewAfterWrite === true,
    confirmBeforeWrite: current.confirmBeforeWrite === true
  };
}

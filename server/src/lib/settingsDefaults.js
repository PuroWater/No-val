// 用户设置默认值（单一来源）：routes/settings 与 settingsService 共用，避免两处维护漂移。
export function defaultSettings(userId) {
  return {
    userId,
    theme: 'paper',
    fontSize: 'medium',
    chaptersPerOutput: 3,
    chapterWords: 2000,
    enterToSend: true,
    thinkingMode: 'off',
    thinkingStages: { routing: false, execution: false, writing: false, review: false, maintenance: false },
    developmentLineOrientation: 'vertical',
    reviewAfterWrite: false,
    confirmBeforeWrite: false
  };
}

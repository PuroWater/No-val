// 思考开关统一解析（0.9.3）：全局三态 thinkingMode（off/on/custom）+ 五档细分 thinkingStages（仅 custom 生效）。
// 调用点：路由/构思、执行、正文、审校、维护；JSON 修复兜底强制关思考，不经过本模块。
export const THINKING_STAGES = ['routing', 'execution', 'writing', 'review', 'maintenance'];

export function normalizeThinkingMode(value) {
  return value === 'on' || value === 'custom' ? value : 'off';
}

export function normalizeThinkingStages(raw) {
  const stages = {};
  for (const stage of THINKING_STAGES) stages[stage] = raw?.[stage] === true;
  return stages;
}

// 旧字段兼容（0.9.3 迁移）：thinkingEnabled/thinkingForWriting true → on / false → off。
export function legacyThinkingMode(current) {
  return current?.thinkingEnabled === true || current?.thinkingForWriting === true ? 'on' : 'off';
}

// 单档判定：custom 按该档布尔值；否则按全局三态。
export function resolveThinking(settings, stage) {
  if (!settings || typeof settings !== 'object') return false;
  if (settings.thinkingMode === 'custom') return settings.thinkingStages?.[stage] === true;
  return settings.thinkingMode === 'on';
}

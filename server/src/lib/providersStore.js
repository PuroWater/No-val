// provider 配置数据层（0.9.6）：全局存 data/providers.json，设置页可增删改；
// 无文件/空时用环境变量推导默认 deepseek（兼容现有 .env 部署，不自动落盘）。
// 能力与思考风格由“预设 + 所选模型”自动推导，前端只需配置供应商与模型。
import { readJson, writeJson, PROVIDERS_FILE } from './store.js';

export const PROVIDER_TYPES = ['openai-compatible'];
export const THINKING_STYLES = ['deepseek', 'openai', 'none'];

const THINKING_DEEPSEEK = {
  supportsThinking: true,
  supportsReasoningEffort: true,
  supportsTools: true,
  supportsJsonMode: true,
  maxOutputTokens: 65536,
  thinkingMandatory: false
};
const THINKING_OPENAI = {
  supportsThinking: true,
  supportsReasoningEffort: true,
  supportsTools: true,
  supportsJsonMode: true,
  maxOutputTokens: 16384,
  thinkingMandatory: false
};
const NO_THINKING = {
  supportsThinking: false,
  supportsReasoningEffort: false,
  supportsTools: true,
  supportsJsonMode: true,
  maxOutputTokens: 16384,
  thinkingMandatory: false
};

// openai-compatible 协议下的常见厂商预设：models 为常见模型列表（含各自能力/思考风格）。
export const PROVIDER_PRESETS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    thinkingStyle: 'deepseek',
    capabilities: THINKING_DEEPSEEK,
    models: [
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash（默认，支持思考）', capabilities: THINKING_DEEPSEEK },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner（强制思考）', capabilities: { ...THINKING_DEEPSEEK, thinkingMandatory: true } },
      { id: 'deepseek-chat', label: 'deepseek-chat（不支持思考）', capabilities: { ...NO_THINKING } }
    ]
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    thinkingStyle: 'openai',
    capabilities: THINKING_OPENAI,
    models: [
      { id: 'gpt-4o', label: 'gpt-4o（不支持思考）', capabilities: { ...NO_THINKING } },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini（不支持思考）', capabilities: { ...NO_THINKING } },
      { id: 'o1', label: 'o1（强制思考，不可关闭）', capabilities: { ...THINKING_OPENAI, maxOutputTokens: 32768, thinkingMandatory: true } },
      { id: 'o3-mini', label: 'o3-mini（强制思考，不可关闭）', capabilities: { ...THINKING_OPENAI, maxOutputTokens: 32768, thinkingMandatory: true } }
    ]
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: '',
    thinkingStyle: 'none',
    capabilities: NO_THINKING,
    models: []
  },
  custom: {
    name: '自定义',
    baseUrl: '',
    defaultModel: '',
    thinkingStyle: 'none',
    capabilities: NO_THINKING,
    models: []
  }
};

// 环境变量推导默认 deepseek（兼容现有 .env / 环境变量部署）。
export function envDefaultProvider() {
  const preset = PROVIDER_PRESETS.deepseek;
  return {
    id: 'deepseek',
    name: preset.name,
    type: 'openai-compatible',
    baseUrl: process.env.DEEPSEEK_BASE_URL || process.env.MODEL_BASE_URL || preset.baseUrl,
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.MODEL_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || process.env.MODEL_NAME || preset.defaultModel,
    thinkingStyle: preset.thinkingStyle,
    capabilities: { ...preset.capabilities }
  };
}

export function normalizeCapabilities(raw, preset) {
  const base = { ...((preset && preset.capabilities) || PROVIDER_PRESETS.custom.capabilities) };
  if (!raw || typeof raw !== 'object') return base;
  const maxTokens = Number(raw.maxOutputTokens);
  return {
    supportsThinking: typeof raw.supportsThinking === 'boolean' ? raw.supportsThinking : base.supportsThinking,
    supportsReasoningEffort: typeof raw.supportsReasoningEffort === 'boolean' ? raw.supportsReasoningEffort : base.supportsReasoningEffort,
    supportsTools: typeof raw.supportsTools === 'boolean' ? raw.supportsTools : base.supportsTools,
    supportsJsonMode: typeof raw.supportsJsonMode === 'boolean' ? raw.supportsJsonMode : base.supportsJsonMode,
    maxOutputTokens: Number.isInteger(maxTokens) && maxTokens > 0 ? maxTokens : base.maxOutputTokens,
    thinkingMandatory: typeof raw.thinkingMandatory === 'boolean' ? raw.thinkingMandatory : (base.thinkingMandatory || false)
  };
}

export function readProviders() {
  const data = readJson(PROVIDERS_FILE, null);
  if (!data || !Array.isArray(data.providers) || data.providers.length === 0) {
    return { providers: [envDefaultProvider()], active: 'deepseek', fromEnv: true };
  }
  return { providers: data.providers, active: data.active || data.providers[0].id, fromEnv: false };
}

export function writeProviders(providers, active) {
  writeJson(PROVIDERS_FILE, { providers, active });
}

export function getActiveProvider() {
  const { providers, active } = readProviders();
  return providers.find((item) => item.id === active) || providers[0];
}

export function newProviderId() {
  return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// 输入归一化：body + 预设 + （可选）已有记录 → provider 记录。
// 能力/思考风格自动推导：已有记录 > 预设内匹配模型 > 预设默认；前端只需传 供应商(preset) + 模型(model) + baseUrl/apiKey。
export function normalizeProviderInput(body = {}, presetKey = 'custom', existing = null) {
  const preset = PROVIDER_PRESETS[presetKey] || PROVIDER_PRESETS.custom;
  const name = String(body.name || preset.name || '自定义模型').trim();
  const baseUrl = String(body.baseUrl || '').trim();
  const model = String(body.model || '').trim();
  if (!baseUrl) throw new Error('接口地址（baseUrl）不能为空');
  if (!model) throw new Error('模型名称（model）不能为空');
  const presetModel = (preset.models || []).find((item) => item.id === model) || null;
  const thinkingStyle = THINKING_STYLES.includes(body.thinkingStyle)
    ? body.thinkingStyle
    : (existing && existing.thinkingStyle) || (presetModel && presetModel.thinkingStyle) || preset.thinkingStyle || 'none';
  const apiKey = body.apiKey !== undefined ? String(body.apiKey || '').trim() : (existing && existing.apiKey) || '';
  const baseCapabilities = (existing && existing.capabilities) || (presetModel && presetModel.capabilities) || preset.capabilities || PROVIDER_PRESETS.custom.capabilities;
  const capabilities = body.capabilities
    ? normalizeCapabilities(body.capabilities, { capabilities: baseCapabilities })
    : { ...baseCapabilities };
  return {
    id: (existing && existing.id) || newProviderId(),
    name: name || '自定义模型',
    type: 'openai-compatible',
    baseUrl,
    apiKey,
    model,
    thinkingStyle,
    capabilities
  };
}

// API 输出脱敏：不回传 apiKey 明文。
export function maskProvider(provider) {
  const { apiKey, ...rest } = provider;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

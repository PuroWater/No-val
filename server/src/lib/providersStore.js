// 模型服务数据层（0.9.6 v2）：data/providers.json 存"模型条目"（每条 = 供应商 + Key + 具体模型）。
// 每家供应商在后端有完整预设（协议/默认URL/思考参数/常见模型/能力），前端只负责：选厂家 → 填 Key → 拉模型列表 → 选模型。
// 无文件时用环境变量推导默认 deepseek（兼容现有 .env 部署，不自动落盘）。
import { readJson, writeJson, PROVIDERS_FILE } from './store.js';

export const VENDOR_PROTOCOLS = ['openai', 'anthropic'];
export const THINKING_STYLES = ['deepseek', 'openai', 'anthropic', 'none'];

// 每家供应商的预设：protocol（openai 兼容 / anthropic Messages）、默认 URL、思考参数风格、常见模型列表（2026-08 现状）。
// models 为空表示不内置列表（OpenRouter/Ollama/自定义），一律支持"获取模型列表"。
export const VENDOR_PRESETS = {
  deepseek: {
    name: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    thinkingStyle: 'deepseek',
    thinkingDefault: 'on',
    maxOutputTokens: 65536,
    models: [
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash（默认，支持思考）' },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro（推理更强）' }
    ]
  },
  openai: {
    name: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4-mini',
    thinkingStyle: 'openai',
    thinkingDefault: 'on',
    maxOutputTokens: 32768,
    models: [
      { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol（旗舰）', thinkingMandatory: true },
      { id: 'gpt-5.6-terra', label: 'gpt-5.6-terra', thinkingMandatory: true },
      { id: 'gpt-5.6-luna', label: 'gpt-5.6-luna', thinkingMandatory: true },
      { id: 'gpt-5.4', label: 'gpt-5.4', thinkingMandatory: true },
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', thinkingMandatory: true },
      { id: 'gpt-5.4-nano', label: 'gpt-5.4-nano（最快）', thinkingMandatory: true }
    ]
  },
  anthropic: {
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    thinkingStyle: 'anthropic',
    thinkingDefault: 'on',
    maxOutputTokens: 32768,
    models: [
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7（旗舰）', thinkingMandatory: true },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', thinkingMandatory: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（最快）', thinkingDefault: 'off' }
    ]
  },
  openrouter: {
    name: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    thinkingStyle: 'openai',
    thinkingDefault: 'off',
    maxOutputTokens: 65536,
    models: []
  },
  grok: {
    name: 'xAI Grok',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-fast-reasoning',
    thinkingStyle: 'openai',
    thinkingDefault: 'on',
    maxOutputTokens: 32768,
    models: [
      { id: 'grok-4', label: 'grok-4' },
      { id: 'grok-4-fast-reasoning', label: 'grok-4-fast-reasoning（思考）', thinkingMandatory: true },
      { id: 'grok-4-fast-non-reasoning', label: 'grok-4-fast-non-reasoning（不思考）', thinkingDefault: 'off' },
      { id: 'grok-4.5', label: 'grok-4.5' }
    ]
  },
  kimi: {
    name: 'Moonshot Kimi',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k3',
    thinkingStyle: 'openai',
    thinkingDefault: 'on',
    maxOutputTokens: 32768,
    models: [
      { id: 'kimi-k3', label: 'kimi-k3（旗舰，强制思考）', thinkingMandatory: true },
      { id: 'kimi-k3-256k', label: 'kimi-k3-256k（256K 上下文）', thinkingMandatory: true },
      { id: 'kimi-k2.7-code', label: 'kimi-k2.7-code（编程，原生思考）', thinkingMandatory: true },
      { id: 'kimi-k2.6', label: 'kimi-k2.6' }
    ]
  },
  glm: {
    name: '智谱 GLM',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.2',
    thinkingStyle: 'openai',
    thinkingDefault: 'off',
    maxOutputTokens: 16384,
    models: [
      { id: 'glm-5.2', label: 'glm-5.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
      { id: 'glm-5', label: 'glm-5' },
      { id: 'glm-4.7', label: 'glm-4.7' },
      { id: 'glm-4-plus', label: 'glm-4-plus' },
      { id: 'glm-4-flash', label: 'glm-4-flash（轻量）' }
    ]
  },
  minimax: {
    name: 'MiniMax',
    protocol: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M3',
    thinkingStyle: 'openai',
    thinkingDefault: 'on',
    maxOutputTokens: 32768,
    models: [
      { id: 'MiniMax-M3', label: 'MiniMax-M3（旗舰）', thinkingMandatory: true },
      { id: 'MiniMax-M2.7', label: 'MiniMax-M2.7', thinkingMandatory: true },
      { id: 'MiniMax-M2.5', label: 'MiniMax-M2.5', thinkingMandatory: true },
      { id: 'MiniMax-M2.1', label: 'MiniMax-M2.1', thinkingMandatory: true },
      { id: 'MiniMax-M2', label: 'MiniMax-M2', thinkingMandatory: true }
    ]
  },
  ollama: {
    name: 'Ollama（本地）',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: '',
    thinkingStyle: 'none',
    thinkingDefault: 'off',
    maxOutputTokens: 8192,
    models: []
  },
  custom: {
    name: '自定义',
    protocol: 'openai',
    baseUrl: '',
    defaultModel: '',
    thinkingStyle: 'openai',
    thinkingDefault: 'off',
    maxOutputTokens: 16384,
    models: []
  }
};

// 环境变量推导默认 deepseek（兼容现有 .env / 环境变量部署）。
export function envDefaultModelEntry() {
  const preset = VENDOR_PRESETS.deepseek;
  const model = process.env.DEEPSEEK_MODEL || process.env.MODEL_NAME || preset.defaultModel;
  return {
    id: 'deepseek',
    vendor: 'deepseek',
    name: preset.name,
    protocol: preset.protocol,
    baseUrl: process.env.DEEPSEEK_BASE_URL || process.env.MODEL_BASE_URL || preset.baseUrl,
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.MODEL_API_KEY || '',
    model,
    thinkingStyle: preset.thinkingStyle,
    thinkingDefault: preset.thinkingDefault,
    thinkingMandatory: false,
    capabilities: buildCapabilities(preset, model)
  };
}

// 由预设 + 模型推导能力。
export function buildCapabilities(preset, model, overrides = {}) {
  const presetModel = (preset.models || []).find((item) => item.id === model) || null;
  const thinkingMandatory = presetModel?.thinkingMandatory === true || overrides.thinkingMandatory === true;
  const thinkingDefault = presetModel?.thinkingDefault || overrides.thinkingDefault || preset.thinkingDefault || 'off';
  return {
    supportsThinking: thinkingMandatory || thinkingDefault === 'on',
    supportsReasoningEffort: preset.thinkingStyle === 'openai' || preset.thinkingStyle === 'deepseek',
    supportsTools: true,
    supportsJsonMode: preset.protocol === 'openai',
    maxOutputTokens: Number(overrides.maxOutputTokens) > 0 ? Number(overrides.maxOutputTokens) : (preset.maxOutputTokens || 16384),
    thinkingMandatory,
    thinkingDefault
  };
}

export function readModelEntries() {
  const data = readJson(PROVIDERS_FILE, null);
  if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
    return { entries: [envDefaultModelEntry()], active: 'deepseek', fromEnv: true };
  }
  return { entries: data.entries, active: data.active || data.entries[0].id, fromEnv: false };
}

export function writeModelEntries(entries, active) {
  writeJson(PROVIDERS_FILE, { entries, active });
}

export function getActiveModelEntry() {
  const { entries, active } = readModelEntries();
  return entries.find((item) => item.id === active) || entries[0];
}

export function newEntryId() {
  return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// 输入归一化：body + 供应商预设 + （可选）已有条目 → 模型条目。
// 思考/能力由后端按 供应商 + 模型 自动推导；已有条目编辑时保留原能力。
export function normalizeModelInput(body = {}, vendorKey = 'custom', existing = null) {
  const preset = VENDOR_PRESETS[vendorKey] || VENDOR_PRESETS.custom;
  const name = String(body.name || '').trim() || preset.name || '自定义模型';
  const baseUrl = String(body.baseUrl || '').trim();
  const model = String(body.model || '').trim();
  if (!baseUrl) throw new Error('接口地址（baseUrl）不能为空');
  if (!model) throw new Error('模型名称（model）不能为空');
  const presetModel = (preset.models || []).find((item) => item.id === model) || null;
  const apiKey = body.apiKey !== undefined ? String(body.apiKey || '').trim() : (existing && existing.apiKey) || '';
  if (existing && existing.vendor === vendorKey && existing.model === model) {
    // 同供应商同模型编辑：保留已有思考/能力配置
    return {
      id: existing.id,
      vendor: vendorKey,
      name,
      protocol: existing.protocol || preset.protocol,
      baseUrl,
      apiKey,
      model,
      thinkingStyle: existing.thinkingStyle || preset.thinkingStyle || 'none',
      thinkingDefault: existing.thinkingDefault || presetModel?.thinkingDefault || preset.thinkingDefault || 'off',
      thinkingMandatory: existing.thinkingMandatory || presetModel?.thinkingMandatory === true,
      capabilities: { ...existing.capabilities }
    };
  }
  return {
    id: (existing && existing.id) || newEntryId(),
    vendor: vendorKey,
    name,
    protocol: preset.protocol,
    baseUrl,
    apiKey,
    model,
    thinkingStyle: preset.thinkingStyle || 'none',
    thinkingDefault: presetModel?.thinkingDefault || preset.thinkingDefault || 'off',
    thinkingMandatory: presetModel?.thinkingMandatory === true,
    capabilities: buildCapabilities(preset, model)
  };
}

// API 输出脱敏：不回传 apiKey 明文。
export function maskEntry(entry) {
  const { apiKey, ...rest } = entry;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

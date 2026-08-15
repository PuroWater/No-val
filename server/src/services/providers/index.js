// 模型协议适配器注册表（0.9.6 v2）：按 entry.protocol 分发——
// openai：OpenAI 兼容 /chat/completions（DeepSeek/OpenAI/OpenRouter/xAI/Kimi/GLM/MiniMax/Ollama/中转/本地）；
// anthropic：Anthropic Messages /v1/messages（Claude 原生协议）。
import { provider as openaiCompatible } from './openaiCompatible.js';
import { provider as anthropic } from './anthropic.js';

export const PROVIDERS = { openai: openaiCompatible, anthropic };

export function getProvider(protocol) {
  const provider = PROVIDERS[protocol] || PROVIDERS.openai;
  if (!provider) throw new Error('未注册的模型协议类型：' + protocol);
  return provider;
}

// 模型提供方注册表（0.9.6）：按协议类型注册适配器，业务代码统一走 modelClient。
// 当前唯一适配器为 openai-compatible（覆盖 DeepSeek/OpenAI/Ollama/各类中转与本地模型）。
import { provider as openaiCompatible } from './openaiCompatible.js';

export const PROVIDERS = { 'openai-compatible': openaiCompatible };

export function getProvider(type) {
  const provider = PROVIDERS[type] || PROVIDERS['openai-compatible'];
  if (!provider) throw new Error('未注册的模型提供方类型：' + type);
  return provider;
}

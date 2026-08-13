// 模型提供方注册表：新增 provider 时在此登记，modelClient 按 modelConfig.modelProviderName() 选择。
import { provider as deepseek } from './deepseek.js';

export const PROVIDERS = { deepseek };

export function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`未注册的模型提供方：${name}`);
  return provider;
}

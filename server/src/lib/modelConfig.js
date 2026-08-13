// 模型提供方统一配置：业务代码不直接读模型相关环境变量。
// 当前首个 provider 为 DeepSeek（保留 DEEPSEEK_* 环境变量作为第一个实现），
// 新增 provider 时在此注册并复用统一命名（MODEL_PROVIDER / MODEL_API_KEY / MODEL_BASE_URL / MODEL_NAME）。
export const DEFAULT_PROVIDER = 'deepseek';

export function modelProviderName() {
  return process.env.MODEL_PROVIDER || DEFAULT_PROVIDER;
}

export function providerConfig(name = modelProviderName()) {
  if (name === 'deepseek') {
    return {
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY || process.env.MODEL_API_KEY || '',
      baseUrl: process.env.DEEPSEEK_BASE_URL || process.env.MODEL_BASE_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || process.env.MODEL_NAME || 'deepseek-v4-flash'
    };
  }
  throw new Error(`未注册的模型提供方：${name}`);
}

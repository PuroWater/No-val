import { chatCompletion } from '../services/deepseek.js';

// 通用模型调用：带重试与结果校验（中断/超时立即抛出，其余错误重试后抛出）。
export async function callModel(makeOptions, validate, retries = 1, signal) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await chatCompletion({ ...makeOptions(attempt), signal });
      if (!validate || validate(result)) return result;
      lastError = new Error('模型返回内容不符合要求');
    } catch (err) {
      lastError = err;
      if (/中断|超时/.test(err.message)) throw err;
    }
  }
  throw lastError;
}

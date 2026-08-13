import { chatCompletion } from '../services/modelClient.js';

// 写正文调用的输出预算：字数 × 2.2，上限 32768（deepseek-v4-flash 实测能力，覆盖 10000 字章节 + 推理余量）。
export function maxTokensForWords(chapterWords) {
  return Math.min(32768, Math.max(3000, Math.round(Number(chapterWords) * 2.2)));
}

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

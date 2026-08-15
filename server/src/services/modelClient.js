// 统一模型调用门面：业务代码只 import 本文件。
// chatCompletion：JSON 模式（路由/聊天/正文生成），带 JSON 修复兜底；
// chatTools：原生 function calling（工具循环），返回 { content, toolCalls }。
import { getProvider } from './providers/index.js';
import { getActiveProvider } from '../lib/providersStore.js';

// 每次调用取 active provider 记录（providers.json 或环境变量默认），配置随请求传入适配器
function activeCall(options) {
  const record = getActiveProvider();
  const provider = getProvider(record.type);
  return provider.chat({ ...options, config: record });
}

export function parseJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型返回内容不是有效 JSON');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function chatCompletion(options) {
  const { content } = await activeCall({ ...options, jsonMode: true });
  if (!content) throw new Error('模型未返回内容');
  try {
    return parseJson(content);
  } catch (err) {
    if (/超时|中断/.test(err.message)) throw err;
    const repaired = await activeCall({
      system: '你是 JSON 修复助手。只返回修复后的合法 JSON，不要包含 Markdown，不要改变数据含义。',
      user: `以下是损坏的 JSON，请修复为合法 JSON：\n${content}\n\n解析错误：${err.message}`,
      temperature: 0,
      maxTokens: Math.max(options.maxTokens || 2400, 4000),
      timeoutMs: Math.min(options.timeoutMs || 120000, 60000),
      thinkingType: 'disabled',
      jsonMode: true
    });
    return parseJson(repaired.content);
  }
}

export async function chatTools(options) {
  const result = await activeCall({ ...options, jsonMode: false, tools: options.tools });
  if (!result.content && result.toolCalls.length === 0) {
    throw new Error('模型未返回内容或工具调用');
  }
  return result;
}

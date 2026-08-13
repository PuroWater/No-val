// DeepSeek 模型适配器：实现统一的 provider.chat 接口（第一个 provider）。
// 业务代码不直接 import 本文件，统一走 services/modelClient.js。
import { providerConfig } from '../../lib/modelConfig.js';

function parseToolArguments(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function chat({
  system,
  user,
  messages,
  tools,
  temperature = 0.8,
  maxTokens = 16384,
  thinkingType = 'enabled',
  reasoningEffort,
  signal,
  timeoutMs = 120000,
  jsonMode = false
}) {
  const cfg = providerConfig('deepseek');
  if (!cfg.apiKey) throw new Error('未配置模型 API Key，请在环境变量中设置 DEEPSEEK_API_KEY');
  const body = {
    model: cfg.model,
    messages: messages || [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {})
  };
  if (thinkingType === 'disabled') {
    body.thinking = { type: 'disabled' };
  } else {
    body.thinking = { type: 'enabled' };
    if (reasoningEffort && ['low', 'high', 'max'].includes(reasoningEffort)) {
      body.reasoning_effort = reasoningEffort;
    }
  }
  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('模型请求超时')), timeoutMs);
  const onExternalAbort = () => controller.abort(signal?.reason || new Error('请求已中断'));
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason || new Error('请求已中断'));
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(controller.signal.reason?.message || '模型请求已中断');
    }
    throw new Error(`模型网络请求失败：${err.message}`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`模型调用失败 (${response.status}) ${detail}`.trim());
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message || {};
  return {
    content: typeof message.content === 'string' ? message.content : '',
    toolCalls: Array.isArray(message.tool_calls)
      ? message.tool_calls.map((call) => ({
          id: call.id,
          name: call.function?.name || '',
          arguments: parseToolArguments(call.function?.arguments)
        }))
      : []
  };
}

export const provider = { chat };

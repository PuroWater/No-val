// OpenAI 兼容协议适配器（0.9.6 v2）：覆盖 DeepSeek / OpenAI / OpenRouter / xAI / Kimi / GLM / MiniMax / Ollama / 各类中转与本地模型（/chat/completions）。
// 业务代码不直接 import 本文件，统一走 services/modelClient.js。
// entry 来自 providers.json 的 active 模型条目：{ baseUrl, apiKey, model, thinkingStyle, capabilities }。
// thinkingStyle：deepseek（thinking 字段 + reasoning_content）/ openai（reasoning_effort）/ none（不支持思考）。

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
  jsonMode = false,
  entry = {}
}) {
  const baseUrl = String(entry.baseUrl || '').trim() || 'https://api.deepseek.com';
  const apiKey = String(entry.apiKey || '').trim();
  const model = String(entry.model || '').trim() || 'deepseek-v4-flash';
  const style = entry.thinkingStyle || 'deepseek';
  if (!apiKey && style !== 'none') {
    throw new Error('未配置模型 API Key，请在设置页“模型服务”中填写。');
  }
  const body = {
    model,
    messages: messages || [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {})
  };
  // 思考参数按厂商风格适配；强制思考模型（thinkingMandatory）忽略关思考设置；
  // style=none（如 Ollama）不支持思考则不传任何思考字段
  const thinkingOn = thinkingType !== 'disabled' || entry.capabilities?.thinkingMandatory === true;
  if (style === 'deepseek') {
    body.thinking = { type: thinkingOn ? 'enabled' : 'disabled' };
    if (thinkingOn && reasoningEffort && ['low', 'high', 'max'].includes(reasoningEffort)) {
      body.reasoning_effort = reasoningEffort;
    }
  } else if (style === 'openai' && thinkingOn) {
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
    response = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(controller.signal.reason?.message || '模型请求已中断');
    }
    throw new Error('模型网络请求失败：' + err.message);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const raw = String(detail).toLowerCase();
    const capabilityIssue = (response.status === 400 || response.status === 422) && /thinking|reasoning/.test(raw);
    const hint = capabilityIssue ? '。当前模型可能不支持思考或关思考，请到设置页“模型服务”调整' : '';
    throw new Error('模型调用失败 (' + response.status + ') ' + detail + hint);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message || {};
  return {
    content: typeof message.content === 'string' ? message.content : '',
    reasoningContent: typeof message.reasoning_content === 'string' ? message.reasoning_content : '',
    toolCalls: Array.isArray(message.tool_calls)
      ? message.tool_calls.map((call) => ({
          id: call.id,
          name: call.function?.name || '',
          arguments: parseToolArguments(call.function?.arguments)
        }))
      : [],
    usage: data.usage || null,
    finishReason: String(data.choices?.[0]?.finish_reason || '')
  };
}

export const provider = { chat };

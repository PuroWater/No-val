// Anthropic Messages 协议适配器（0.9.6 v2）：POST {baseUrl}/v1/messages，x-api-key + anthropic-version 头。
// 业务代码不直接 import 本文件，统一走 services/modelClient.js。
// entry 来自 providers.json 的 active 模型条目：{ baseUrl, apiKey, model, thinkingStyle, capabilities }。
// 入参 messages 沿用 OpenAI 兼容格式（system/user/assistant+tool_calls/tool），本适配器负责转换为
// Anthropic 格式：system 提为顶层字段、assistant 拆 text/tool_use/thinking 内容块、tool 转 tool_result。
// 思考：thinking.type=enabled + budget_tokens；强制思考模型（thinkingMandatory）忽略关思考设置。

// 思考预算：约 75% 的 max_tokens 且必须严格小于 max_tokens（Anthropic 要求留出输出余量）
function thinkingBudget(maxTokens) {
  const raw = Math.floor(Number(maxTokens) * 0.75);
  const budget = Math.min(32000, Math.max(1024, raw));
  return budget < maxTokens ? budget : Math.max(1024, Number(maxTokens) - 1024);
}

function toAnthropicTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((tool) => {
    const fn = tool?.function || tool || {};
    return {
      name: fn.name || tool.name || '',
      description: fn.description || tool.description || '',
      input_schema: fn.parameters || tool.input_schema || { type: 'object', properties: {} }
    };
  }).filter((tool) => tool.name);
}

// OpenAI 兼容 messages → Anthropic messages（顶层 system 单独抽取）
function toAnthropicMessages(messages, fallbackSystem, fallbackUser) {
  const list = Array.isArray(messages) ? messages : [];
  const systemParts = [];
  const converted = [];
  for (const item of list) {
    const role = item?.role;
    if (role === 'system') {
      if (typeof item.content === 'string' && item.content) systemParts.push(item.content);
      continue;
    }
    if (role === 'tool') {
      converted.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: String(item.tool_call_id || ''), content: String(item.content || '') }]
      });
      continue;
    }
    if (role === 'assistant') {
      const blocks = [];
      if (typeof item.reasoning_content === 'string' && item.reasoning_content) {
        blocks.push({ type: 'thinking', thinking: item.reasoning_content });
      }
      if (typeof item.content === 'string' && item.content) {
        blocks.push({ type: 'text', text: item.content });
      }
      const toolCalls = Array.isArray(item.tool_calls) ? item.tool_calls : [];
      for (const call of toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: String(call.id || ''),
          name: String(call.function?.name || ''),
          input: (() => {
            try {
              return JSON.parse(call.function?.arguments || '{}');
            } catch {
              return {};
            }
          })()
        });
      }
      if (blocks.length > 0) converted.push({ role: 'assistant', content: blocks });
      continue;
    }
    // user
    const text = String(item?.content || '');
    if (text) converted.push({ role: 'user', content: text });
  }
  if (systemParts.length === 0 && fallbackSystem) systemParts.push(String(fallbackSystem));
  if (converted.length === 0 && fallbackUser) converted.push({ role: 'user', content: String(fallbackUser) });
  // 连续同角色 user 合并，避免 API 拒绝
  const merged = [];
  for (const message of converted) {
    const last = merged[merged.length - 1];
    if (last && last.role === 'user' && message.role === 'user' && typeof last.content === 'string' && typeof message.content === 'string') {
      last.content = last.content + '\n' + message.content;
    } else {
      merged.push({ ...message });
    }
  }
  return { system: systemParts.join('\n'), messages: merged };
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
  const baseUrl = String(entry.baseUrl || '').trim() || 'https://api.anthropic.com';
  const apiKey = String(entry.apiKey || '').trim();
  const model = String(entry.model || '').trim();
  if (!apiKey) {
    throw new Error('未配置模型 API Key，请在设置页“模型配置”中填写。');
  }
  if (!model) {
    throw new Error('未配置模型名称，请在设置页“模型配置”中填写。');
  }
  const thinkingOn = thinkingType !== 'disabled' || entry.capabilities?.thinkingMandatory === true;
  const { system: anthropicSystem, messages: anthropicMessages } = toAnthropicMessages(messages, system, user);
  const anthropicTools = toAnthropicTools(tools);
  const effectiveSystem = jsonMode
    ? (anthropicSystem ? anthropicSystem + '\n' : '') + '请只输出合法 JSON，不要包含 Markdown 代码块或额外说明。'
    : anthropicSystem;
  const body = {
    model,
    max_tokens: maxTokens,
    ...(effectiveSystem ? { system: effectiveSystem } : {}),
    messages: anthropicMessages,
    ...(Array.isArray(anthropicTools) && anthropicTools.length > 0 ? { tools: anthropicTools } : {})
  };
  // Anthropic 思考模式：temperature 必须为 1；不思考时用传入温度
  if (thinkingOn) {
    body.thinking = { type: 'enabled', budget_tokens: thinkingBudget(maxTokens) };
    body.temperature = 1;
  } else {
    body.temperature = temperature;
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
    response = await fetch(baseUrl.replace(/\/+$/, '') + '/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
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
    const hint = capabilityIssue ? '。当前模型可能不支持思考或关思考，请到设置页“模型配置”调整' : '';
    throw new Error('模型调用失败 (' + response.status + ') ' + detail + hint);
  }
  const data = await response.json();
  const blocks = Array.isArray(data.content) ? data.content : [];
  const texts = [];
  const reasonings = [];
  const toolCalls = [];
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text);
    else if (block.type === 'thinking' && typeof block.thinking === 'string') reasonings.push(block.thinking);
    else if (block.type === 'tool_use') {
      toolCalls.push({ id: String(block.id || ''), name: String(block.name || ''), arguments: block.input || {} });
    }
  }
  return {
    content: texts.join(''),
    reasoningContent: reasonings.join('\n'),
    toolCalls,
    usage: data.usage || null,
    finishReason: String(data.stop_reason || '')
  };
}

export const provider = { chat };

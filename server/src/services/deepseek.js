export function parseDeepSeekJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型返回内容不是有效 JSON');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function requestCompletion({
  system,
  user,
  temperature = 0.8,
  maxTokens = 2400,
  signal,
  timeoutMs = 120000
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('未配置 DEEPSEEK_API_KEY，请在根目录 .env 中设置');
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('DeepSeek 请求超时')), timeoutMs);
  const onExternalAbort = () => controller.abort(signal?.reason || new Error('请求已中断'));
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason || new Error('请求已中断'));
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(controller.signal.reason?.message || 'DeepSeek 请求已中断');
    }
    throw new Error(`DeepSeek 网络请求失败：${err.message}`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`DeepSeek 调用失败 (${response.status}) ${detail}`.trim());
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 未返回内容');
  return content;
}

export async function chatCompletion(options) {
  const content = await requestCompletion(options);
  try {
    return parseDeepSeekJson(content);
  } catch (err) {
    if (/超时|中断/.test(err.message)) throw err;
    const repaired = await requestCompletion({
      system: '你是 JSON 修复助手。只返回修复后的合法 JSON，不要包含 Markdown，不要改变数据含义。',
      user: `以下是损坏的 JSON，请修复为合法 JSON：\n${content}\n\n解析错误：${err.message}`,
      temperature: 0,
      maxTokens: Math.max(options.maxTokens || 2400, 4000),
      timeoutMs: Math.min(options.timeoutMs || 120000, 60000)
    });
    return parseDeepSeekJson(repaired);
  }
}

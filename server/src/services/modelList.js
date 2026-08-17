// 远端模型列表拉取（0.9.6 v2）：openai 兼容协议一律走 GET {baseUrl}/models。
// 覆盖 DeepSeek / OpenAI / OpenRouter / xAI / Kimi / GLM / MiniMax / Ollama / 各类中转与本地模型；
// Anthropic 无公开模型列表接口，由后端预设提供（前端对 anthropic 厂商隐藏"获取模型列表"按钮）。
// 返回统一数组：{ id, label, fromRemote: true }。

async function fetchModels({ baseUrl, apiKey, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('拉取模型列表超时')), timeoutMs);
  try {
    const response = await fetch(String(baseUrl).replace(/\/+$/, '') + '/models', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`模型列表接口返回 ${response.status} ${detail}`);
    }
    return await response.json();
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(controller.signal.reason?.message || '拉取模型列表已中断');
    }
    throw new Error('拉取模型列表失败：' + err.message);
  } finally {
    clearTimeout(timer);
  }
}

// 归一化各家 /models 响应为 { id, label } 数组：
// OpenAI 兼容：{ data: [{ id, name? }] }；Ollama 原生：{ models: [{ name }] }
function normalizeModels(raw) {
  const list = [];
  const data = Array.isArray(raw?.data) ? raw.data : [];
  for (const item of data) {
    const id = String(item?.id || '').trim();
    if (id) list.push({ id, label: String(item?.name || item?.label || id).trim() || id });
  }
  if (list.length === 0 && Array.isArray(raw?.models)) {
    for (const item of raw.models) {
      const id = String(item?.name || item?.id || '').trim();
      if (id) list.push({ id, label: String(item?.name || id).trim() || id });
    }
  }
  return list;
}

// 拉取远端列表并合并预设列表：预设优先，远端补缺（标注 fromRemote）
export async function listRemoteModels({ baseUrl, apiKey, presetModels = [] }) {
  if (!String(baseUrl || '').trim()) {
    throw new Error('接口地址（baseUrl）不能为空');
  }
  const remote = await fetchModels({ baseUrl, apiKey });
  const normalized = normalizeModels(remote);
  const seen = new Set();
  const merged = [];
  for (const item of presetModels) {
    const id = String(item.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push({ id, label: item.label || id, thinkingMandatory: item.thinkingMandatory === true, thinkingDefault: item.thinkingDefault });
  }
  for (const item of normalized) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push({ id: item.id, label: item.label || item.id, fromRemote: true });
  }
  if (merged.length === 0) {
    throw new Error('未获取到模型列表：接口地址或 API Key 可能不正确，也可手动填写模型名称。');
  }
  return merged;
}

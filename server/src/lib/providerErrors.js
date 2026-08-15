// 模型调用错误 → 用户友好文案（测试连接 / 获取模型列表等用户可见场景）。
// 匹配顺序：已有完整文案优先 → 思考能力提示 → 超时/网络 → HTTP 状态码 → 兜底原样。
export function friendlyProviderError(err) {
  const message = String(err?.message || '');
  // 已有完整友好文案
  if (/未配置模型 API Key/.test(message)) return message;
  if (/模型可能不支持思考或关思考/.test(message)) {
    return '当前模型可能不支持思考或关思考，请到设置页“模型配置”调整开关后重试。';
  }
  if (/模型未返回内容|未返回内容或工具调用/.test(message)) {
    return '模型未返回任何内容，请稍后重试或检查模型状态。';
  }
  // 超时
  if (/超时/.test(message)) return '连接超时，请检查网络或接口地址，稍后重试。';
  // 网络层
  if (/网络请求失败|fetch failed|ECONNREFUSED|ENOTFOUND|getaddrinfo|EAI_AGAIN|EHOSTUNREACH|socket hang up/.test(message)) {
    return '无法连接到该接口地址，请检查 baseUrl 是否正确、网络是否可用。';
  }
  // HTTP 状态码（适配器形如“模型调用失败 (401) …”；列表接口形如“模型列表接口返回 401 …”）
  const statusMatch = message.match(/\((\d{3})\)/) || message.match(/返回 (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  if (status === 400) {
    return /model|模型|not_found/i.test(message)
      ? '模型名称不存在或不可用，请检查所选模型是否正确。'
      : '请求参数不被接受（400），请检查接口地址、模型与厂家是否匹配。';
  }
  if (status === 401) return 'API Key 不合法（401），请检查 Key 是否正确、是否已过期。';
  if (status === 403) return 'API Key 无权限或账户欠费（403），请检查账户状态。';
  if (status === 404) return '接口地址不正确（404），请检查 baseUrl 是否填写正确。';
  if (status === 429) return '请求过于频繁或额度用尽（429），请稍后重试或检查余额。';
  if (status >= 500) return `模型服务端暂时不可用（${status}），请稍后重试。`;
  if (status) return `模型调用失败（${status}），请检查配置后重试。`;
  return message || '连接失败，请检查配置后重试。';
}

import { chatCompletion } from './deepseek.js';

export function validateArgs(parameters = {}, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, errors: ['arguments 必须是对象'] };
  }
  const errors = [];
  const properties = parameters.properties || {};
  const required = Array.isArray(parameters.required) ? parameters.required : [];
  for (const key of required) {
    const value = args[key];
    if (value === undefined || value === null || value === '') {
      errors.push(`缺少必填参数 ${key}`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    const schema = properties[key];
    if (!schema) continue;
    const type = schema.type;
    if (type === 'string' && typeof value !== 'string') {
      errors.push(`${key} 必须是字符串`);
    } else if (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      errors.push(`${key} 必须是数字`);
    } else if (type === 'integer' && !Number.isInteger(value)) {
      errors.push(`${key} 必须是整数`);
    } else if (type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${key} 必须是布尔值`);
    } else if (type === 'array' && !Array.isArray(value)) {
      errors.push(`${key} 必须是数组`);
    } else if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      errors.push(`${key} 必须是对象`);
    }
    if (typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) errors.push(`${key} 过短`);
      if (schema.maxLength && value.length > schema.maxLength) errors.push(`${key} 过长`);
    }
  }
  return { ok: errors.length === 0, errors };
}

const tools = new Map();

export function registerTool(tool) {
  if (!tool || typeof tool.name !== 'string' || !tool.name) {
    throw new Error('工具缺少 name');
  }
  tools.set(tool.name, tool);
}

export function getTool(name) {
  return tools.get(name);
}

export function listTools() {
  return [...tools.values()];
}

export async function callTool(name, args, context = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`未知工具：${name}`);
  const validation = validateArgs(tool.parameters, args);
  if (!validation.ok) {
    throw new Error(`参数不合法：${validation.errors.join('；')}`);
  }
  return tool.handler(args, context);
}

export async function runToolDecision({
  system = '',
  tools: toolList = [],
  user,
  signal,
  ask = chatCompletion,
  maxAttempts = 3,
  maxTokens = 1200
}) {
  const toolText = toolList
    .map((tool) => `- ${tool.name}：${tool.description}\n  参数：${JSON.stringify(tool.parameters)}`)
    .join('\n');
  const basePrompt = [
    '你是协作 Agent，根据用户消息选择并调用一个工具。只能使用下面列出的工具：',
    toolText,
    '必须返回 JSON：{"tool":"工具名","arguments":{...}}；如果不需要调用工具，返回 {"tool":"","arguments":{}}。不要包含 Markdown。'
  ].join('\n');
  let lastError = '';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const prompt = attempt === 0
      ? `${basePrompt}\n用户消息：${user}`
      : `${basePrompt}\n上次调用失败：${lastError}\n请重新选择工具或修正参数。\n用户消息：${user}`;
    let result;
    try {
      result = await ask({ system, user: prompt, maxTokens, signal });
    } catch (err) {
      if (/中断|超时/.test(err.message)) throw err;
      lastError = `模型调用失败：${err.message}`;
      continue;
    }
    const toolName = String(result?.tool || '');
    if (!toolName) {
      return { tool: '', outcome: null };
    }
    const tool = toolList.find((item) => item.name === toolName);
    if (!tool) {
      lastError = `未知工具：${toolName}`;
      continue;
    }
    const validation = validateArgs(tool.parameters, result.arguments);
    if (!validation.ok) {
      lastError = `参数不合法：${validation.errors.join('；')}`;
      continue;
    }
    try {
      const outcome = await tool.handler(result.arguments, { user, signal });
      return { tool: toolName, outcome };
    } catch (err) {
      if (/中断|超时/.test(err.message)) throw err;
      lastError = `工具执行失败：${err.message}`;
    }
  }
  throw new Error('工具调用多次失败，请换个说法再试');
}

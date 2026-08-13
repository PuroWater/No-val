// 工具注册表：工具定义注册/查询/直接调用；API 工具格式转换。
import { validateArgs, normalizeToolArguments } from '../lib/toolArgs.js';
import { validateOutcome } from '../lib/toolOutcome.js';

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
  const normalized = normalizeToolArguments(tool.parameters, args);
  const validation = validateArgs(tool.parameters, normalized);
  if (!validation.ok) {
    throw new Error(`参数不合法：${validation.errors.join('；')}`);
  }
  const outcome = await tool.handler(normalized, context);
  const checked = validateOutcome(outcome);
  if (!checked.ok) throw new Error(`工具结果不合规：${checked.errors.join('；')}`);
  return outcome;
}

export function toApiTools(toolList) {
  return toolList.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {} }
    }
  }));
}

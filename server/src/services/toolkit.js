import { chatCompletion } from './deepseek.js';

export const OUTPUT_LIMITS = { maxChapters: 5, minChapterWords: 1000, maxChapterWords: 10000 };
export const OVER_LIMIT_REPLY = '当前输出超过限定：单次最多 5 章、每章 1000-10000 字，请调整后重试。';

// 输出规模校验：越界返回 { over: true }，范围内返回归一化后的 output。
export function normalizeOutputScale(rawOutput) {
  const chapters = Number(rawOutput?.chapters);
  const chapterWords = Number(rawOutput?.chapterWords);
  const over = (Number.isInteger(chapters) && (chapters < 1 || chapters > OUTPUT_LIMITS.maxChapters))
    || (Number.isFinite(chapterWords) && (chapterWords < OUTPUT_LIMITS.minChapterWords || chapterWords > OUTPUT_LIMITS.maxChapterWords));
  if (over) return { output: null, over: true };
  const output = {};
  if (Number.isInteger(chapters)) output.chapters = Math.min(OUTPUT_LIMITS.maxChapters, Math.max(1, chapters));
  if (Number.isFinite(chapterWords)) output.chapterWords = Math.min(
    OUTPUT_LIMITS.maxChapterWords,
    Math.max(OUTPUT_LIMITS.minChapterWords, Math.round(chapterWords))
  );
  return { output: Object.keys(output).length > 0 ? output : null, over: false };
}

// 构思/初筛共用的输出规模提取：从对话中识别“单次生成几章、每章多少字”。
export async function extractOutputScale({ user, history = '', signal, ask = chatCompletion, maxTokens = 4096 }) {
  const prompt = [
    '你是输出规模识别 Agent。判断用户是否明确指定“单次输出规模”：一次生成几章、每章约多少字。',
    '全书目标字数（如“10万字”“百万字”）不算输出规模。',
    `近期对话：\n${history || '（无）'}`,
    '明确指定时返回 {"present":true,"chapters":N,"chapterWords":N}（只填用户提到的字段）；未指定返回 {"present":false}。',
    '必须返回 JSON，不要包含 Markdown。',
    `用户消息：${user}`
  ].join('\n');
  try {
    const result = await ask({ system: '你是输出规模识别 Agent。', user: prompt, maxTokens, signal });
    return normalizeOutputScale(result?.present ? result : {});
  } catch (err) {
    if (/中断|超时/.test(err.message)) throw err;
    return { over: false, output: null };
  }
}

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
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      errors.push(`${key} 只能是 ${schema.enum.join(' / ')}`);
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
  context = '',
  signal,
  ask = chatCompletion,
  maxAttempts = 3,
  maxTokens = 4096,
  maxSteps = 30
}) {
  const toolText = toolList
    .map((tool) => `- ${tool.name}：${tool.description}\n  参数：${JSON.stringify(tool.parameters)}`)
    .join('\n');
  const basePrompt = [
    '你是协作 Agent，根据用户消息调用工具或直接回答。只能使用下面列出的工具：',
    toolText,
    context ? `近期对话：\n${context}\n` : '',
    '返回 JSON：需要调用工具时返回 {"tool":"工具名","arguments":{...}}；已经可以回答用户时返回 {"reply":"回答文本"}。不要包含 Markdown。'
  ].join('\n');
  const history = [`用户消息：${user}`];
  for (let step = 0; step < maxSteps; step += 1) {
    let lastError = '';
    let settled = false;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const prompt = [
        basePrompt,
        ...history,
        lastError ? `上次调用失败：${lastError}\n请重新选择工具、修正参数或直接回复。` : ''
      ].filter(Boolean).join('\n');
      let result;
      try {
        result = await ask({ system, user: prompt, maxTokens, signal });
      } catch (err) {
        if (/中断|超时/.test(err.message)) throw err;
        lastError = `模型调用失败：${err.message}`;
        continue;
      }
      const toolName = String(result?.tool || '');
      const reply = String(result?.reply || '').trim();
      if (!toolName && reply) {
        return { tool: '', outcome: { content: reply, kind: 'text' } };
      }
      if (!toolName && !reply) {
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
        if (outcome && outcome.followUp) {
          history.push(`工具 ${toolName} 返回：\n${String(outcome.data || '')}`);
          settled = true;
          break;
        }
        return { tool: toolName, outcome };
      } catch (err) {
        if (/中断|超时/.test(err.message)) throw err;
        lastError = `工具执行失败：${err.message}`;
      }
    }
    if (settled) continue;
    throw new Error(`工具调用多次失败：${lastError || '请换个说法再试'}`);
  }
  throw new Error('工具调用步数已达上限，请换个说法再试');
}

export async function prefilterIntent({
  groups = [],
  user,
  history = '',
  signal,
  ask = chatCompletion,
  system = '你是工具筛选 Agent。',
  maxAttempts = 2,
  maxTokens = 4096
}) {
  const names = groups.map((group) => group.name);
  const groupText = groups.map((group) => `- ${group.name}：${group.summary}`).join('\n');
  const prompt = [
    '你是工具筛选 Agent。根据用户消息判断是普通聊天还是需要调用工具。',
    `近期对话：\n${history || '（无）'}`,
    '可用能力组：',
    groupText,
    '普通聊天时返回 {"mode":"chat","reply":"回答文本"}；需要调用工具时返回 {"mode":"tool","groups":["组名", ...]}，最多 2 个组；用户明确指定输出规模（如“续写一章”“每章 5000 字”）时在 tool 模式下附带 {"output":{"chapters":1,"chapterWords":5000}}。',
    '必须返回 JSON，groups 只能使用上面的组名。不要包含 Markdown。',
    `用户消息：${user}`
  ].join('\n');
  let lastError = '';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await ask({ system, user: prompt, maxTokens, signal });
      const rawMode = String(result?.mode || 'tool');
      if (rawMode === 'chat') {
        const reply = String(result?.reply || '').trim();
        if (reply) return { mode: 'chat', reply, groups: [], output: null };
        lastError = 'chat 模式缺少 reply';
        continue;
      }
      const picked = (Array.isArray(result?.groups) ? result.groups : [])
        .map((name) => String(name))
        .filter((name) => names.includes(name));
      const unique = [...new Set(picked)];
      if (unique.length > 0) {
        const { output, over } = normalizeOutputScale(result?.output);
        if (over) return { mode: 'chat', reply: OVER_LIMIT_REPLY, groups: [], output: null };
        return { mode: 'tool', groups: unique, output };
      }
      lastError = '未返回有效能力组';
    } catch (err) {
      if (/中断|超时/.test(err.message)) throw err;
      lastError = err.message;
    }
  }
  return { mode: 'tool', groups: [], output: null };
}

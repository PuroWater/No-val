// 任务执行器：原生 function calling 循环 + 确定性状态机（计数/单步/信号/完成拦截/失败回传/幂等去重）。
import { chatTools } from './modelClient.js';
import { toApiTools } from './toolRegistry.js';
import { validateArgs, normalizeToolArguments } from '../lib/toolArgs.js';
import { validateOutcome } from '../lib/toolOutcome.js';

function stateFromPlan(plan) {
  return { done: 0, completed: false, card: null, lastTool: '', lastData: '', failures: 0 };
}

// 状态转移：工具执行结果 → 进度/完成（纯函数，便于单测）。
// counted：chapters 增量类成功 +1，达到 target 完成；single：写类 effect 成功即完成；
// signal：卡片信号即完成；none：永不因工具完成（由模型回复收尾）。
export function applyTransition(state, toolName, outcome, plan) {
  if (outcome.card) state.card = outcome.card;
  state.lastTool = toolName;
  state.lastData = String(outcome.data || '');
  if (!outcome.ok) {
    state.failures += 1;
    return state;
  }
  const effect = outcome.effect || null;
  const term = plan?.termination || { kind: 'none' };
  if (term.kind === 'counted') {
    if (effect?.type === 'chapters' && Number(effect.delta) > 0) {
      state.done += 1;
      if (state.done >= term.target) state.completed = true;
    }
  } else if (term.kind === 'single') {
    if (effect && effect.type !== 'none') state.completed = true;
  } else if (term.kind === 'signal') {
    if (outcome.card) state.completed = true;
  }
  return state;
}

function finalizeReply(state, content) {
  const text = content || state.lastData || '好的，我记下了。';
  return {
    tool: state.lastTool || '',
    outcome: {
      content: text,
      kind: state.card ? 'book' : 'text',
      ...(state.card ? { extra: state.card } : {}),
      ...(state.lastTool ? { data: state.lastData } : {})
    }
  };
}

// 任务已完成但模型仍发工具调用（空转）→ 状态机拦截收尾，不再执行。
function finalizeIntercept(state) {
  const chapter = Number.isInteger(state.card?.chapter) ? state.card.chapter : null;
  const content = chapter
    ? `已为你打开书籍卡片，定位到第 ${chapter} 章。`
    : (state.lastData || '任务已完成。');
  return {
    tool: state.lastTool || '',
    outcome: {
      content,
      kind: state.card ? 'book' : 'text',
      ...(state.card ? { extra: state.card } : {}),
      ...(state.lastTool ? { data: state.lastData } : {})
    }
  };
}

// 执行器：原生 function calling 循环。
// ask 契约：ask({ messages, tools, maxTokens, signal, thinkingType }) → { content, toolCalls }。
// 循环：模型发 tool_calls → 校验/执行 → 结果写回 role=tool → 继续；模型输出 content → 最终回复。
export async function runTask({
  system = '',
  tools: toolList = [],
  user,
  context = '',
  signal,
  onStep,
  ask = chatTools,
  plan = { termination: { kind: 'none' } },
  maxAttempts = 3,
  maxTokens = 16384,
  maxSteps = 30,
  thinkingEnabled = false
}) {
  const state = stateFromPlan(plan);
  const apiTools = toApiTools(toolList);
  // 幂等：同一响应重放（同 call.id）不重复执行 handler，直接回放首次结果。
  const executed = new Map();
  // 防绕圈：连续多次工具调用仍无内容回复时，用最后一次工具结果收尾，不裸靠 maxSteps。
  // none 终止（read 类）更严，其余意图给足工具调用空间。
  const silentCap = plan?.termination?.kind === 'none' ? 6 : 12;
  let silent = 0;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: context ? `近期对话：\n${context}\n\n用户消息：${user}` : `用户消息：${user}` }
  ];
  const logArgs = (args) => {
    const text = JSON.stringify(args || {});
    return text.length > 200 ? `${text.slice(0, 200)}…(${text.length})` : text;
  };
  const recordFailure = (call, reason) => {
    state.failures += 1;
    const id = call?.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    console.log(`[tool-fail] ${call?.name || 'unknown'} ${logArgs(call?.arguments)} -> ${reason}`);
    messages.push({ role: 'assistant', tool_calls: [{ id, type: 'function', function: { name: call?.name || 'unknown', arguments: '{}' } }] });
    messages.push({ role: 'tool', tool_call_id: id, content: reason });
  };

  for (let step = 0; step < maxSteps; step += 1) {
    let result;
    try {
      result = await ask({ messages, tools: apiTools, maxTokens, signal, thinkingType: thinkingEnabled ? 'enabled' : 'disabled' });
    } catch (err) {
      if (/中断|超时/.test(err.message)) throw err;
      state.failures += 1;
      if (state.failures >= maxAttempts) throw new Error(`模型调用失败：${err.message}`);
      continue;
    }
    const toolCalls = Array.isArray(result?.toolCalls) ? result.toolCalls : [];
    const content = String(result?.content || '').trim();
    if (toolCalls.length === 0) {
      return finalizeReply(state, content);
    }
    silent += 1;
    if (silent >= silentCap) return finalizeIntercept(state);
    const call = toolCalls[0] || {};
    const name = String(call.name || '');
    const tool = toolList.find((item) => item.name === name);
    // 任务完成后：写类工具与重复展示信号直接拦截收尾；
    // 首次展示信号（open_book_widget）仍允许执行，把卡片带给最终回复。
    if (state.completed) {
      const isWrite = !tool || tool.group === 'edit' || tool.group === undefined;
      const isRepeatSignal = tool?.group === 'navigate' && Boolean(state.card);
      if (isWrite || isRepeatSignal) return finalizeIntercept(state);
    }
    if (!tool) {
      recordFailure(call, `未知工具：${name}`);
      if (state.failures >= maxAttempts) throw new Error(`工具调用多次失败：未知工具 ${name}`);
      continue;
    }
    const normalizedArgs = normalizeToolArguments(tool.parameters, call.arguments);
    const validation = validateArgs(tool.parameters, normalizedArgs);
    if (!validation.ok) {
      recordFailure(call, `参数不合法：${validation.errors.join('；')}`);
      if (state.failures >= maxAttempts) throw new Error(`工具调用多次失败：${validation.errors.join('；')}`);
      continue;
    }
    const callId = call.id || `call_${step}_${name}`;
    if (executed.has(callId)) {
      const cached = executed.get(callId);
      console.log(`[tool] ${name} replay（同 call.id 缓存）args=${logArgs(normalizedArgs)}`);
      messages.push({
        role: 'assistant',
        tool_calls: [{ id: callId, type: 'function', function: { name, arguments: JSON.stringify(normalizedArgs || {}) } }]
      });
      messages.push({ role: 'tool', tool_call_id: callId, content: String(cached.data || '') });
      continue;
    }
    let outcome;
    try {
      outcome = await tool.handler(normalizedArgs, { user, signal, history: context, plan });
    } catch (err) {
      if (/中断|超时/.test(err.message)) throw err;
      recordFailure(call, `工具执行失败：${err.message}`);
      if (state.failures >= maxAttempts) throw new Error(`工具调用多次失败：${err.message}`);
      continue;
    }
    const checked = validateOutcome(outcome);
    if (!checked.ok) {
      recordFailure(call, `工具结果不合规：${checked.errors.join('；')}`);
      if (state.failures >= maxAttempts) throw new Error(`工具调用多次失败：${checked.errors.join('；')}`);
      continue;
    }
    console.log(`[tool] ${name} args=${logArgs(normalizedArgs)} -> ok=${outcome.ok} len=${String(outcome.data || '').length}`);
    onStep?.(name, outcome, call.arguments, state);
    applyTransition(state, name, outcome, plan);
    if (outcome.ok) executed.set(callId, outcome);
    messages.push({
      role: 'assistant',
      tool_calls: [{ id: callId, type: 'function', function: { name, arguments: JSON.stringify(normalizedArgs || {}) } }]
    });
    messages.push({ role: 'tool', tool_call_id: callId, content: String(outcome.data || '') });
  }
  throw new Error('工具调用步数已达上限，请换个说法再试');
}

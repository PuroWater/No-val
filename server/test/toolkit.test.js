import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OVER_LIMIT_REPLY,
  normalizeOutputScale,
  prefilterDraftIntent,
  validateArgs,
  validateOutcome,
  registerTool,
  callTool,
  runRouter,
  runTask,
  applyTransition
} from '../src/services/toolkit.js';

function askSequence(steps) {
  let index = 0;
  return async () => {
    const step = steps[Math.min(index, steps.length - 1)];
    index += 1;
    return typeof step === 'function' ? step() : step;
  };
}

test('normalizeOutputScale rejects over-limit and normalizes in-range scale', () => {
  assert.deepEqual(normalizeOutputScale({ chapters: 3, chapterWords: 1000 }), {
    output: { chapters: 3, chapterWords: 1000 },
    over: false
  });
  assert.deepEqual(normalizeOutputScale({ chapters: 10 }), { output: null, over: true });
  assert.deepEqual(normalizeOutputScale({ chapterWords: 500 }), { output: null, over: true });
  assert.deepEqual(normalizeOutputScale({ chapterWords: 1234 }), {
    output: { chapterWords: 1234 },
    over: false
  });
  assert.deepEqual(normalizeOutputScale({}), { output: null, over: false });
});

test('validateArgs enforces required and types', () => {
  const params = {
    type: 'object',
    properties: {
      text: { type: 'string', minLength: 1 },
      count: { type: 'integer' },
      kind: { type: 'string', enum: ['a', 'b'] }
    },
    required: ['text']
  };
  assert.equal(validateArgs(params, { text: 'hi' }).ok, true);
  assert.equal(validateArgs(params, {}).ok, false);
  assert.equal(validateArgs(params, { text: 123 }).ok, false);
  assert.equal(validateArgs(params, { text: 'hi', count: 2.5 }).ok, false);
  assert.equal(validateArgs(params, { text: 'hi', kind: 'c' }).ok, false);
  assert.equal(validateArgs(params, 'not-an-object').ok, false);
});

test('validateOutcome accepts standard ToolResult and rejects malformed ones', () => {
  assert.equal(validateOutcome({ ok: true, data: '完成', effect: { type: 'chapters', delta: 1 }, card: { bookId: 'b1', chapter: 1 } }).ok, true);
  assert.equal(validateOutcome({ ok: false, retryable: true, data: '失败' }).ok, true);
  assert.equal(validateOutcome({ data: '缺 ok' }).ok, false);
  assert.equal(validateOutcome({ ok: true, data: 123 }).ok, false);
  assert.equal(validateOutcome({ ok: true, data: 'x', card: { chapter: 1 } }).ok, false);
  assert.equal(validateOutcome(null).ok, false);
});

test('callTool validates input and standard output', async () => {
  registerTool({
    name: 'echo',
    description: '回显',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', minLength: 1 } },
      required: ['text']
    },
    handler: async ({ text }) => ({ ok: true, data: `echo:${text}`, effect: null })
  });
  const result = await callTool('echo', { text: 'hi' });
  assert.equal(result.data, 'echo:hi');
  await assert.rejects(() => callTool('echo', { text: '' }), /参数不合法/);
  await assert.rejects(() => callTool('missing', {}), /未知工具/);
  registerTool({
    name: 'bad',
    description: '坏结果',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ data: '缺 ok' })
  });
  await assert.rejects(() => callTool('bad', {}), /工具结果不合规/);
});

test('runRouter routes tool intent with schema output', async () => {
  const route = await runRouter({
    user: '再写两章',
    ask: async () => ({ mode: 'tool', intent: 'create_append', output: { chapters: 2 }, target: null })
  });
  assert.equal(route.mode, 'tool');
  assert.equal(route.intent, 'create_append');
  assert.deepEqual(route.output, { chapters: 2 });

  const navigate = await runRouter({
    user: '发一个卡片',
    ask: async () => ({ mode: 'tool', intent: 'navigate', output: null, target: null })
  });
  assert.equal(navigate.intent, 'navigate');
});

test('runRouter falls back to chat on invalid or over-limit output', async () => {
  const chat = await runRouter({
    user: '你好',
    ask: async () => ({ mode: 'chat', reply: '你好！' })
  });
  assert.equal(chat.mode, 'chat');

  const over = await runRouter({
    user: '续写10章',
    ask: async () => ({ mode: 'tool', intent: 'create_append', output: { chapters: 10 } })
  });
  assert.equal(over.mode, 'chat');
  assert.equal(over.reply, OVER_LIMIT_REPLY);

  const invalid = await runRouter({
    user: 'x',
    ask: async () => ({ mode: 'tool', intent: 'not_an_intent' }),
    maxAttempts: 1
  });
  assert.equal(invalid.mode, 'chat');
  assert.ok(String(invalid.reply).length > 0);
});

test('runTask ends with model reply when no tool calls', async () => {
  const decision = await runTask({
    system: 's',
    tools: [],
    user: 'hi',
    ask: async () => ({ content: '你好。', toolCalls: [] })
  });
  assert.equal(decision.tool, '');
  assert.equal(decision.outcome.content, '你好。');
  assert.equal(decision.outcome.kind, 'text');
});

test('runTask executes tools and merges card into final reply', async () => {
  const cardTool = {
    name: 'open_book_widget',
    description: '展示卡片',
    parameters: { type: 'object', properties: { chapter: { type: 'integer' } }, required: [] },
    handler: async ({ chapter }) => ({
      ok: true,
      data: '卡片已展示。',
      effect: { type: 'none' },
      card: { bookId: 'b1', chapter: Number(chapter) || 1 }
    })
  };
  const decision = await runTask({
    system: 's',
    tools: [cardTool],
    user: '发卡片',
    plan: { termination: { kind: 'signal' } },
    ask: askSequence([
      { content: '', toolCalls: [{ name: 'open_book_widget', arguments: { chapter: 3 } }] },
      { content: '已为你打开。', toolCalls: [] }
    ])
  });
  assert.equal(decision.outcome.kind, 'book');
  assert.equal(decision.outcome.content, '已为你打开。');
  assert.deepEqual(decision.outcome.extra, { bookId: 'b1', chapter: 3 });
});

test('runTask counted termination enforces target and intercepts extra calls', async () => {
  const createTool = {
    name: 'edit_book',
    description: '新建章节',
    parameters: { type: 'object', properties: { mode: { type: 'string' } }, required: [] },
    handler: async ({ mode }) => ({
      ok: true,
      data: `已新建第 ${mode} 章。`,
      effect: { type: 'chapters', delta: 1, ids: ['c1'] }
    })
  };
  // 模型写了 1 章后仍想再写 → 状态机拦截收尾
  const intercepted = await runTask({
    system: 's',
    tools: [createTool],
    user: '再写一章',
    plan: { termination: { kind: 'counted', target: 1 } },
    ask: askSequence([
      { content: '', toolCalls: [{ name: 'edit_book', arguments: { mode: 'new' } }] },
      { content: '', toolCalls: [{ name: 'edit_book', arguments: { mode: 'new' } }] }
    ])
  });
  assert.equal(intercepted.outcome.content, '已新建第 new 章。');

  // 正常计数：写满 target 后模型总结
  const normal = await runTask({
    system: 's',
    tools: [createTool],
    user: '再写两章',
    plan: { termination: { kind: 'counted', target: 2 } },
    ask: askSequence([
      { content: '', toolCalls: [{ name: 'edit_book', arguments: { mode: 'new' } }] },
      { content: '', toolCalls: [{ name: 'edit_book', arguments: { mode: 'new' } }] },
      { content: '已新建 2 章。', toolCalls: [] }
    ])
  });
  assert.equal(normal.outcome.content, '已新建 2 章。');
});

test('runTask single termination completes only on write effect', async () => {
  const readTool = {
    name: 'read_book',
    description: '读取',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, data: '第一章内容', effect: null })
  };
  const rewriteTool = {
    name: 'edit_book',
    description: '改写',
    parameters: { type: 'object', properties: { mode: { type: 'string' } }, required: [] },
    handler: async () => ({ ok: true, data: '已改写。', effect: { type: 'chapters', delta: 0, ids: ['c1'] } })
  };
  const decision = await runTask({
    system: 's',
    tools: [readTool, rewriteTool],
    user: '改写第一章',
    plan: { termination: { kind: 'single' } },
    ask: askSequence([
      { content: '', toolCalls: [{ name: 'read_book', arguments: {} }] },
      { content: '', toolCalls: [{ name: 'edit_book', arguments: { mode: 'modify' } }] },
      { content: '', toolCalls: [{ name: 'edit_book', arguments: { mode: 'modify' } }] }
    ])
  });
  // read 不触发完成；edit 触发完成；再调用被拦截，最终文案为最后一次工具结果
  assert.equal(decision.outcome.content, '已改写。');
});

test('runTask feeds failures back to model and retries', async () => {
  const echoTool = {
    name: 'echo',
    description: '回显',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    handler: async ({ text }) => ({ ok: true, data: `echo:${text}`, effect: null })
  };
  const decision = await runTask({
    system: 's',
    tools: [echoTool],
    user: 'hi',
    ask: askSequence([
      { content: '', toolCalls: [{ name: 'nope', arguments: {} }] },
      { content: '', toolCalls: [{ name: 'echo', arguments: { text: 'ok' } }] },
      { content: '完成。', toolCalls: [] }
    ])
  });
  assert.equal(decision.outcome.content, '完成。');
});

test('runTask throws after repeated failures or max steps', async () => {
  const echoTool = {
    name: 'echo',
    description: '回显',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, data: 'ok', effect: null })
  };
  await assert.rejects(
    () => runTask({
      system: 's',
      tools: [echoTool],
      user: 'hi',
      ask: async () => ({ content: '', toolCalls: [{ name: 'nope', arguments: {} }] }),
      maxAttempts: 2
    }),
    /多次失败/
  );
  await assert.rejects(
    () => runTask({
      system: 's',
      tools: [echoTool],
      user: 'hi',
      ask: async () => ({ content: '', toolCalls: [{ name: 'echo', arguments: {} }] }),
      maxSteps: 2,
      maxAttempts: 1
    }),
    /步数已达上限/
  );
});

test('runTask rejects malformed tool results via validateOutcome', async () => {
  const badTool = {
    name: 'bad',
    description: '坏结果',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ data: '缺 ok' })
  };
  const decision = await runTask({
    system: 's',
    tools: [badTool],
    user: 'hi',
    ask: askSequence([
      { content: '', toolCalls: [{ name: 'bad', arguments: {} }] },
      { content: '好的。', toolCalls: [] }
    ])
  });
  assert.equal(decision.outcome.content, '好的。');
});

test('applyTransition is a pure state machine', () => {
  const state = { done: 0, completed: false, card: null, lastTool: '', lastData: '', failures: 0 };
  applyTransition(state, 'edit_book', { ok: true, data: 'x', effect: { type: 'chapters', delta: 1 } }, { termination: { kind: 'counted', target: 2 } });
  assert.equal(state.done, 1);
  assert.equal(state.completed, false);
  applyTransition(state, 'edit_book', { ok: true, data: 'y', effect: { type: 'chapters', delta: 1 } }, { termination: { kind: 'counted', target: 2 } });
  assert.equal(state.done, 2);
  assert.equal(state.completed, true);
  const failed = { done: 0, completed: false, card: null, lastTool: '', lastData: '', failures: 0 };
  applyTransition(failed, 'edit_book', { ok: false, data: '错了' }, { termination: { kind: 'counted', target: 1 } });
  assert.equal(failed.failures, 1);
  assert.equal(failed.completed, false);
});

test('prefilterDraftIntent classifies chat, confirm and chat-mode over-limit', async () => {
  const chat = await prefilterDraftIntent({
    user: '我失恋了',
    ask: async () => ({ mode: 'chat', reply: '先专心创作吧，这本书的主角还缺故事背景。' })
  });
  assert.equal(chat.mode, 'chat');
  assert.equal(chat.reply.includes('创作'), true);

  const confirm = await prefilterDraftIntent({
    user: '主角林默，背景现代都市，一共10万字，你来定',
    ask: async () => ({ mode: 'confirm', output: { chapterWords: 1000 } })
  });
  assert.equal(confirm.mode, 'confirm');

  const over = await prefilterDraftIntent({
    user: '生成10章，每章500字',
    ask: async () => ({ mode: 'confirm', output: { chapters: 10, chapterWords: 500 } })
  });
  assert.equal(over.mode, 'chat');
  assert.equal(over.reply, OVER_LIMIT_REPLY);
});

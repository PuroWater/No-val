import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArgs, registerTool, callTool, runToolDecision } from '../src/services/toolkit.js';

const echoTool = {
  name: 'echo',
  description: '回显参数',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', minLength: 1 },
      count: { type: 'integer' }
    },
    required: ['text']
  },
  handler: async ({ text, count }) => ({ text, count: count ?? 1 })
};

test('validateArgs enforces required and types', () => {
  assert.equal(validateArgs(echoTool.parameters, { text: 'hi' }).ok, true);
  assert.equal(validateArgs(echoTool.parameters, {}).ok, false);
  assert.equal(validateArgs(echoTool.parameters, { text: 123 }).ok, false);
  assert.equal(validateArgs(echoTool.parameters, { text: 'hi', count: 2.5 }).ok, false);
  assert.equal(validateArgs(echoTool.parameters, 'not-an-object').ok, false);
});

test('callTool executes registered tool after validation', async () => {
  registerTool(echoTool);
  const result = await callTool('echo', { text: 'hello', count: 2 });
  assert.deepEqual(result, { text: 'hello', count: 2 });
  await assert.rejects(() => callTool('echo', { text: '' }), /参数不合法/);
  await assert.rejects(() => callTool('missing_tool', {}), /未知工具/);
});

test('runToolDecision retries on unknown tool and invalid args', async () => {
  const asks = [];
  const fakeAsk = async ({ user }) => {
    asks.push(user);
    if (asks.length === 1) return { tool: 'not_exist', arguments: {} };
    if (asks.length === 2) return { tool: 'echo', arguments: { text: 42 } };
    return { tool: 'echo', arguments: { text: 'ok' } };
  };
  const decision = await runToolDecision({
    system: 'test',
    tools: [echoTool],
    user: 'hello',
    ask: fakeAsk,
    maxAttempts: 3
  });
  assert.equal(decision.tool, 'echo');
  assert.deepEqual(decision.outcome, { text: 'ok', count: 1 });
  assert.ok(asks.length >= 3);
});

test('runToolDecision returns empty when model chooses no tool', async () => {
  const decision = await runToolDecision({
    system: 'test',
    tools: [echoTool],
    user: 'hi',
    ask: async () => ({ tool: '', arguments: {} }),
    maxAttempts: 3
  });
  assert.equal(decision.tool, '');
  assert.equal(decision.outcome, null);
});

test('runToolDecision throws after repeated failures', async () => {
  await assert.rejects(
    () => runToolDecision({
      system: 'test',
      tools: [echoTool],
      user: 'hi',
      ask: async () => ({ tool: 'nope', arguments: {} }),
      maxAttempts: 2
    }),
    /多次失败/
  );
});

test('runToolDecision supports follow-up answer after tool returns data', async () => {
  const readTool = {
    name: 'read_chapter',
    description: '查询章节',
    parameters: {
      type: 'object',
      properties: { target: { type: 'string' } },
      required: ['target']
    },
    handler: async () => ({ followUp: true, data: '第 2 章 摘要：传承功法' })
  };
  const asks = [];
  const fakeAsk = async ({ user }) => {
    asks.push(user);
    if (asks.length === 1) return { tool: 'read_chapter', arguments: { target: '第二章' } };
    return { reply: '第二章记载了修炼功法。' };
  };
  const decision = await runToolDecision({
    system: 's',
    tools: [readTool],
    user: '第二章讲了什么？',
    ask: fakeAsk,
    maxAttempts: 2
  });
  assert.equal(decision.tool, '');
  assert.equal(decision.outcome.content, '第二章记载了修炼功法。');
  assert.equal(decision.outcome.kind, 'text');
  assert.equal(asks.length, 2);
});

test('runToolDecision supports chained tool calls (ReAct loop)', async () => {
  const readTool = {
    name: 'read_chapter',
    description: '读取章节',
    parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
    handler: async () => ({ followUp: true, data: '第一章内容' })
  };
  const saveTool = {
    name: 'generate_summary',
    description: '生成摘要',
    parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
    handler: async () => ({ content: '已生成摘要', kind: 'text' })
  };
  const asks = [];
  const fakeAsk = async () => {
    asks.push(1);
    if (asks.length === 1) return { tool: 'read_chapter', arguments: { target: '第一章' } };
    return { tool: 'generate_summary', arguments: { target: 'chapter' } };
  };
  const decision = await runToolDecision({
    system: 's',
    tools: [readTool, saveTool],
    user: '总结第一章并保存',
    ask: fakeAsk,
    maxAttempts: 2,
    maxSteps: 4
  });
  assert.equal(decision.tool, 'generate_summary');
  assert.equal(decision.outcome.content, '已生成摘要');
  assert.equal(asks.length, 2);
});

test('runToolDecision stops after maxSteps', async () => {
  const readTool = {
    name: 'read_chapter',
    description: '读取章节',
    parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
    handler: async () => ({ followUp: true, data: 'x' })
  };
  await assert.rejects(
    () => runToolDecision({
      system: 's',
      tools: [readTool],
      user: 'hi',
      ask: async () => ({ tool: 'read_chapter', arguments: { target: '第一章' } }),
      maxAttempts: 1,
      maxSteps: 2
    }),
    /步数已达上限/
  );
});

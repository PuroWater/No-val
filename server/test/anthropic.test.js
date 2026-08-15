import test from 'node:test';
import assert from 'node:assert/strict';
import { chat } from '../src/services/providers/anthropic.js';

function withFetch(capture, response) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    capture.body = JSON.parse(opts.body);
    capture.url = _url;
    capture.headers = opts.headers;
    return response;
  };
  return () => { globalThis.fetch = original; };
}

function anthropicResponse(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: '你好' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 4 },
      ...overrides
    })
  };
}

const entry = { baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6', thinkingStyle: 'anthropic' };

test('posts to /v1/messages with anthropic headers and thinking budget', async () => {
  const capture = {};
  const restore = withFetch(capture, anthropicResponse());
  try {
    await chat({ user: 'hi', thinkingType: 'enabled', entry });
    assert.ok(capture.url.endsWith('/v1/messages'));
    assert.equal(capture.headers['x-api-key'], 'sk-ant-test');
    assert.equal(capture.headers['anthropic-version'], '2023-06-01');
    assert.equal(capture.body.model, 'claude-sonnet-4-6');
    assert.equal(capture.body.thinking.type, 'enabled');
    assert.ok(capture.body.thinking.budget_tokens > 0);
    assert.ok(capture.body.thinking.budget_tokens < capture.body.max_tokens);
    assert.equal(capture.body.temperature, 1);
  } finally { restore(); }
});

test('disabled thinking omits thinking field and keeps temperature', async () => {
  const capture = {};
  const restore = withFetch(capture, anthropicResponse());
  try {
    await chat({ user: 'hi', thinkingType: 'disabled', entry });
    assert.equal(capture.body.thinking, undefined);
    assert.equal(capture.body.temperature, 0.8);
  } finally { restore(); }
});

test('converts openai-style messages to anthropic format (tool loop)', async () => {
  const capture = {};
  const restore = withFetch(capture, anthropicResponse());
  const messages = [
    { role: 'system', content: '你是助手' },
    { role: 'user', content: '改写第 1 章' },
    { role: 'assistant', reasoning_content: '我要调用工具', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'edit_book', arguments: '{"mode":"modify","chapter":1}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: '已改写' }
  ];
  try {
    await chat({ messages, thinkingType: 'disabled', entry });
    assert.equal(capture.body.system, '你是助手');
    assert.deepEqual(capture.body.messages[0], { role: 'user', content: '改写第 1 章' });
    const assistant = capture.body.messages[1];
    assert.equal(assistant.role, 'assistant');
    assert.deepEqual(assistant.content[0], { type: 'thinking', thinking: '我要调用工具' });
    assert.deepEqual(assistant.content[1], { type: 'tool_use', id: 'c1', name: 'edit_book', input: { mode: 'modify', chapter: 1 } });
    assert.deepEqual(capture.body.messages[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '已改写' }] });
  } finally { restore(); }
});

test('converts tools to anthropic input_schema', async () => {
  const capture = {};
  const restore = withFetch(capture, anthropicResponse());
  const tools = [{ type: 'function', function: { name: 'edit_book', description: '改写', parameters: { type: 'object', properties: { mode: { type: 'string' } } } } }];
  try {
    await chat({ user: 'hi', tools, thinkingType: 'disabled', entry });
    assert.deepEqual(capture.body.tools, [{ name: 'edit_book', description: '改写', input_schema: { type: 'object', properties: { mode: { type: 'string' } } } }]);
  } finally { restore(); }
});

test('response normalizes text/thinking/tool_use blocks', async () => {
  const capture = {};
  const restore = withFetch(capture, anthropicResponse({
    content: [
      { type: 'thinking', thinking: '思考过程' },
      { type: 'text', text: '回答' },
      { type: 'tool_use', id: 'c9', name: 'open_book_widget', input: { chapter: 2 } }
    ],
    stop_reason: 'tool_use'
  }));
  try {
    const result = await chat({ user: 'hi', entry });
    assert.equal(result.content, '回答');
    assert.equal(result.reasoningContent, '思考过程');
    assert.deepEqual(result.toolCalls, [{ id: 'c9', name: 'open_book_widget', arguments: { chapter: 2 } }]);
    assert.equal(result.finishReason, 'tool_use');
    assert.equal(result.usage.output_tokens, 4);
  } finally { restore(); }
});

test('missing apiKey throws friendly error', async () => {
  const restore = withFetch({}, anthropicResponse());
  try {
    await assert.rejects(() => chat({ user: 'hi', entry: { ...entry, apiKey: '' } }), /模型 API Key/);
  } finally { restore(); }
});

test('mandatory thinking model ignores disabled thinkingType', async () => {
  const capture = {};
  const restore = withFetch(capture, anthropicResponse());
  try {
    await chat({ user: 'hi', thinkingType: 'disabled', entry: { ...entry, capabilities: { thinkingMandatory: true } } });
    assert.equal(capture.body.thinking.type, 'enabled');
  } finally { restore(); }
});

test('capability error appends hint', async () => {
  const restore = withFetch({}, { ok: false, status: 400, text: async () => '{"error":"thinking is not supported"}' });
  try {
    await assert.rejects(() => chat({ user: 'hi', entry }), /模型可能不支持思考或关思考/);
  } finally { restore(); }
});

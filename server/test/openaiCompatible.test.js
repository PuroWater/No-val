import test from 'node:test';
import assert from 'node:assert/strict';
import { chat } from '../src/services/providers/openaiCompatible.js';

function withFetch(capture, response) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    capture.body = JSON.parse(opts.body);
    capture.url = _url;
    return response;
  };
  return () => { globalThis.fetch = original; };
}

function jsonResponse(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'hi', ...overrides.message }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    })
  };
}

const config = (style) => ({
  baseUrl: 'https://example.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  thinkingStyle: style
});

test('deepseek style sends thinking param and reasoning_effort', async () => {
  const capture = {};
  const restore = withFetch(capture, jsonResponse());
  try {
    await chat({ user: 'hi', thinkingType: 'enabled', reasoningEffort: 'high', config: config('deepseek') });
    assert.deepEqual(capture.body.thinking, { type: 'enabled' });
    assert.equal(capture.body.reasoning_effort, 'high');
    assert.ok(capture.url.endsWith('/chat/completions'));
  } finally { restore(); }
});

test('deepseek style disabled thinking', async () => {
  const capture = {};
  const restore = withFetch(capture, jsonResponse());
  try {
    await chat({ user: 'hi', thinkingType: 'disabled', config: config('deepseek') });
    assert.deepEqual(capture.body.thinking, { type: 'disabled' });
    assert.equal(capture.body.reasoning_effort, undefined);
  } finally { restore(); }
});

test('openai style uses reasoning_effort without thinking field', async () => {
  const capture = {};
  const restore = withFetch(capture, jsonResponse());
  try {
    await chat({ user: 'hi', thinkingType: 'enabled', reasoningEffort: 'low', config: config('openai') });
    assert.equal(capture.body.thinking, undefined);
    assert.equal(capture.body.reasoning_effort, 'low');
  } finally { restore(); }
});

test('none style sends no thinking params and allows empty apiKey', async () => {
  const capture = {};
  const restore = withFetch(capture, jsonResponse());
  try {
    await chat({ user: 'hi', thinkingType: 'enabled', reasoningEffort: 'high', config: { ...config('none'), apiKey: '' } });
    assert.equal(capture.body.thinking, undefined);
    assert.equal(capture.body.reasoning_effort, undefined);
  } finally { restore(); }
});

test('non-none style without apiKey throws friendly error', async () => {
  const restore = withFetch({}, jsonResponse());
  try {
    await assert.rejects(() => chat({ user: 'hi', config: { ...config('deepseek'), apiKey: '' } }), /模型 API Key/);
  } finally { restore(); }
});

test('response normalizes content/reasoningContent/toolCalls/usage/finishReason', async () => {
  const capture = {};
  const restore = withFetch(capture, jsonResponse({
    message: {
      content: '回答',
      reasoning_content: '思考中',
      tool_calls: [{ id: 'c1', function: { name: 'edit_book', arguments: '{"mode":"new"}' } }]
    }
  }));
  try {
    const result = await chat({ user: 'hi', config: config('deepseek') });
    assert.equal(result.content, '回答');
    assert.equal(result.reasoningContent, '思考中');
    assert.deepEqual(result.toolCalls, [{ id: 'c1', name: 'edit_book', arguments: { mode: 'new' } }]);
    assert.equal(result.usage.total_tokens, 15);
    assert.equal(result.finishReason, 'stop');
  } finally { restore(); }
});

test('capability error appends hint', async () => {
  const capture = {};
  const restore = withFetch(capture, {
    ok: false,
    status: 400,
    text: async () => '{"error":"thinking is not supported"}'
  });
  try {
    await assert.rejects(() => chat({ user: 'hi', config: config('deepseek') }), /模型可能不支持思考或关思考/);
  } finally { restore(); }
});

test('mandatory thinking model ignores disabled thinkingType', async () => {
  const capture = {};
  const restore = withFetch(capture, jsonResponse());
  try {
    await chat({
      user: 'hi',
      thinkingType: 'disabled',
      config: { ...config('deepseek'), capabilities: { thinkingMandatory: true } }
    });
    assert.deepEqual(capture.body.thinking, { type: 'enabled' });
  } finally { restore(); }
});

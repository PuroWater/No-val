import test from 'node:test';
import assert from 'node:assert/strict';
import { listRemoteModels } from '../src/services/modelList.js';

function withFetch(capture, response) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    capture.url = _url;
    capture.headers = opts.headers;
    return response;
  };
  return () => { globalThis.fetch = original; };
}

test('openai-compatible /models response merges preset + remote', async () => {
  const capture = {};
  const restore = withFetch(capture, {
    ok: true,
    json: async () => ({ data: [{ id: 'deepseek-v4-flash' }, { id: 'custom-model', name: '自定义模型' }] })
  });
  try {
    const models = await listRemoteModels({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      presetModels: [{ id: 'deepseek-v4-flash', label: '内置' }, { id: 'deepseek-v4-pro', label: '内置 Pro' }]
    });
    assert.equal(models[0].id, 'deepseek-v4-flash');
    assert.equal(models[0].label, '内置');
    assert.equal(models[0].fromRemote, undefined);
    assert.equal(models[1].id, 'deepseek-v4-pro');
    const remote = models.find((m) => m.id === 'custom-model');
    assert.equal(remote.fromRemote, true);
    assert.ok(capture.url.endsWith('/models'));
    assert.equal(capture.headers.Authorization, 'Bearer sk-test');
  } finally { restore(); }
});

test('ollama-style {models:[{name}]} response normalized', async () => {
  const restore = withFetch({}, {
    ok: true,
    json: async () => ({ models: [{ name: 'qwen2.5:latest' }] })
  });
  try {
    const models = await listRemoteModels({ baseUrl: 'http://localhost:11434/v1', apiKey: '', presetModels: [] });
    assert.deepEqual(models, [{ id: 'qwen2.5:latest', label: 'qwen2.5:latest', fromRemote: true }]);
  } finally { restore(); }
});

test('empty baseUrl throws', async () => {
  await assert.rejects(() => listRemoteModels({ baseUrl: '', apiKey: '' }), /baseUrl/);
});

test('http error propagates with status', async () => {
  const restore = withFetch({}, { ok: false, status: 401, text: async () => 'unauthorized' });
  try {
    await assert.rejects(() => listRemoteModels({ baseUrl: 'https://x/v1', apiKey: 'bad' }), /401/);
  } finally { restore(); }
});

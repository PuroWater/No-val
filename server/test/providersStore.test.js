import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDER_PRESETS,
  THINKING_STYLES,
  envDefaultProvider,
  normalizeCapabilities,
  normalizeProviderInput,
  maskProvider,
  newProviderId
} from '../src/lib/providersStore.js';

test('envDefaultProvider builds deepseek record from env with defaults', () => {
  const record = envDefaultProvider();
  assert.equal(record.id, 'deepseek');
  assert.equal(record.type, 'openai-compatible');
  assert.equal(record.thinkingStyle, 'deepseek');
  assert.equal(record.capabilities.supportsThinking, true);
  assert.ok(record.baseUrl.includes('deepseek'));
});

test('normalizeProviderInput validates baseUrl/model and applies preset', () => {
  assert.throws(() => normalizeProviderInput({ baseUrl: '', model: 'x' }), /baseUrl/);
  assert.throws(() => normalizeProviderInput({ baseUrl: 'http://x', model: '' }), /model/);
  const record = normalizeProviderInput(
    { name: '我的模型', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', apiKey: '  sk-1  ' },
    'ollama'
  );
  assert.equal(record.type, 'openai-compatible');
  assert.equal(record.apiKey, 'sk-1');
  assert.equal(record.thinkingStyle, 'none');
  assert.equal(record.capabilities.supportsThinking, false);
  assert.ok(record.id.startsWith('p_'));
});

test('normalizeProviderInput keeps apiKey when omitted, clears when empty', () => {
  const existing = { id: 'p1', apiKey: 'old-key' };
  const kept = normalizeProviderInput({ baseUrl: 'http://a', model: 'm' }, 'custom', existing);
  assert.equal(kept.id, 'p1');
  assert.equal(kept.apiKey, 'old-key');
  const cleared = normalizeProviderInput({ baseUrl: 'http://a', model: 'm', apiKey: '' }, 'custom', existing);
  assert.equal(cleared.apiKey, '');
});

test('normalizeCapabilities falls back to preset and accepts overrides', () => {
  const base = normalizeCapabilities(undefined, PROVIDER_PRESETS.deepseek);
  assert.equal(base.supportsThinking, true);
  const over = normalizeCapabilities({ supportsThinking: false, maxOutputTokens: 4096 }, PROVIDER_PRESETS.deepseek);
  assert.equal(over.supportsThinking, false);
  assert.equal(over.maxOutputTokens, 4096);
  assert.equal(over.supportsTools, true);
});

test('maskProvider strips apiKey and exposes hasApiKey', () => {
  const masked = maskProvider({ id: 'p1', apiKey: 'secret', model: 'm' });
  assert.equal('apiKey' in masked, false);
  assert.equal(masked.hasApiKey, true);
  assert.equal(maskProvider({ id: 'p1', apiKey: '' }).hasApiKey, false);
});

test('THINKING_STYLES and presets are consistent', () => {
  assert.deepEqual(THINKING_STYLES, ['deepseek', 'openai', 'none']);
  assert.ok(PROVIDER_PRESETS.deepseek && PROVIDER_PRESETS.openai && PROVIDER_PRESETS.ollama && PROVIDER_PRESETS.custom);
  assert.ok(newProviderId() !== newProviderId());
});

test('normalizeProviderInput derives capabilities from preset model', () => {
  const o1 = normalizeProviderInput({ baseUrl: 'https://api.openai.com/v1', model: 'o1' }, 'openai');
  assert.equal(o1.capabilities.thinkingMandatory, true);
  assert.equal(o1.capabilities.supportsThinking, true);
  assert.equal(o1.thinkingStyle, 'openai');
  const gpt = normalizeProviderInput({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' }, 'openai');
  assert.equal(gpt.capabilities.supportsThinking, false);
  const reasoner = normalizeProviderInput({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-reasoner' }, 'deepseek');
  assert.equal(reasoner.capabilities.thinkingMandatory, true);
  assert.equal(reasoner.thinkingStyle, 'deepseek');
});

test('normalizeProviderInput preserves capabilities/thinkingStyle when editing', () => {
  const existing = {
    id: 'p1', capabilities: { supportsThinking: true, thinkingMandatory: true },
    thinkingStyle: 'openai', apiKey: 'k'
  };
  const edited = normalizeProviderInput({ baseUrl: 'http://x', model: 'o1' }, 'custom', existing);
  assert.equal(edited.capabilities.thinkingMandatory, true);
  assert.equal(edited.thinkingStyle, 'openai');
});

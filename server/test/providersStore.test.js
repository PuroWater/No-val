import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VENDOR_PRESETS,
  THINKING_STYLES,
  VENDOR_PROTOCOLS,
  defaultModelEntry,
  buildCapabilities,
  normalizeModelInput,
  maskEntry,
  newEntryId
} from '../src/lib/providersStore.js';

test('defaultModelEntry builds deepseek entry from preset with empty key', () => {
  const record = defaultModelEntry();
  assert.equal(record.id, 'deepseek');
  assert.equal(record.vendor, 'deepseek');
  assert.equal(record.protocol, 'openai');
  assert.equal(record.thinkingStyle, 'deepseek');
  assert.equal(record.capabilities.supportsThinking, true);
  assert.equal(record.apiKey, '');
  assert.ok(record.baseUrl.includes('deepseek'));
});

test('normalizeModelInput validates baseUrl/model and applies vendor preset', () => {
  assert.throws(() => normalizeModelInput({ baseUrl: '', model: 'x' }, 'custom'), /baseUrl/);
  assert.throws(() => normalizeModelInput({ baseUrl: 'http://x', model: '' }, 'custom'), /model/);
  const record = normalizeModelInput(
    { name: '本地模型', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', apiKey: '  ' },
    'ollama'
  );
  assert.equal(record.vendor, 'ollama');
  assert.equal(record.protocol, 'openai');
  assert.equal(record.thinkingStyle, 'none');
  assert.equal(record.capabilities.supportsThinking, false);
  assert.ok(record.id.startsWith('m_'));
});

test('normalizeModelInput keeps apiKey when omitted, clears when empty', () => {
  const existing = { id: 'm1', vendor: 'custom', apiKey: 'old-key' };
  const kept = normalizeModelInput({ baseUrl: 'http://a', model: 'm' }, 'custom', existing);
  assert.equal(kept.id, 'm1');
  assert.equal(kept.apiKey, 'old-key');
  const cleared = normalizeModelInput({ baseUrl: 'http://a', model: 'm', apiKey: '' }, 'custom', existing);
  assert.equal(cleared.apiKey, '');
});

test('buildCapabilities falls back to preset and accepts overrides', () => {
  const base = buildCapabilities(VENDOR_PRESETS.deepseek, 'deepseek-v4-flash');
  assert.equal(base.supportsThinking, true);
  const over = buildCapabilities(VENDOR_PRESETS.deepseek, 'deepseek-v4-flash', { supportsThinking: false, maxOutputTokens: 4096 });
  assert.equal(over.maxOutputTokens, 4096);
  assert.equal(over.supportsTools, true);
});

test('maskEntry strips apiKey and exposes hasApiKey', () => {
  const masked = maskEntry({ id: 'm1', apiKey: 'secret', model: 'm' });
  assert.equal('apiKey' in masked, false);
  assert.equal(masked.hasApiKey, true);
  assert.equal(maskEntry({ id: 'm1', apiKey: '' }).hasApiKey, false);
});

test('THINKING_STYLES / VENDOR_PROTOCOLS / presets are consistent', () => {
  assert.deepEqual(THINKING_STYLES, ['deepseek', 'openai', 'anthropic', 'none']);
  assert.deepEqual(VENDOR_PROTOCOLS, ['openai', 'anthropic']);
  const keys = ['deepseek', 'openai', 'anthropic', 'openrouter', 'grok', 'kimi', 'glm', 'minimax', 'ollama', 'custom'];
  for (const key of keys) {
    assert.ok(VENDOR_PRESETS[key], `missing preset ${key}`);
  }
  assert.ok(newEntryId() !== newEntryId());
});

test('normalizeModelInput derives capabilities from preset model', () => {
  const flagship = normalizeModelInput({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-sol' }, 'openai');
  assert.equal(flagship.capabilities.thinkingMandatory, true);
  assert.equal(flagship.capabilities.supportsThinking, true);
  assert.equal(flagship.thinkingStyle, 'openai');
  const kimi = normalizeModelInput({ baseUrl: 'https://api.moonshot.ai/v1', model: 'kimi-k3' }, 'kimi');
  assert.equal(kimi.capabilities.thinkingMandatory, true);
  assert.equal(kimi.thinkingStyle, 'openai');
  const claude = normalizeModelInput({ baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' }, 'anthropic');
  assert.equal(claude.protocol, 'anthropic');
  assert.equal(claude.thinkingStyle, 'anthropic');
  assert.equal(claude.capabilities.thinkingMandatory, true);
});

test('normalizeModelInput preserves capabilities/thinkingStyle when editing same vendor+model', () => {
  const existing = {
    id: 'm1',
    vendor: 'custom',
    model: 'same-model',
    protocol: 'openai',
    capabilities: { supportsThinking: true, thinkingMandatory: true },
    thinkingStyle: 'openai',
    apiKey: 'k'
  };
  const edited = normalizeModelInput({ baseUrl: 'http://x', model: 'same-model' }, 'custom', existing);
  assert.equal(edited.capabilities.thinkingMandatory, true);
  assert.equal(edited.thinkingStyle, 'openai');
});

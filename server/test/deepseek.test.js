import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepSeekJson } from '../src/services/deepseek.js';

test('parseDeepSeekJson strips markdown fences', () => {
  const text = '```json\n{"title":"测试"}\n```';
  assert.deepEqual(parseDeepSeekJson(text), { title: '测试' });
});

test('parseDeepSeekJson throws on invalid json', () => {
  assert.throws(() => parseDeepSeekJson('not json'));
});

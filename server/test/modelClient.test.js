import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson } from '../src/services/modelClient.js';

test('parseJson strips markdown fences', () => {
  const text = '```json\n{"title":"测试"}\n```';
  assert.deepEqual(parseJson(text), { title: '测试' });
});

test('parseJson throws on invalid json', () => {
  assert.throws(() => parseJson('not json'));
});

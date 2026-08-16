import test from 'node:test';
import assert from 'node:assert/strict';
import { WRITING_STYLES, resolveWritingStyle } from '../src/lib/stylePresets.js';

test('WRITING_STYLES has unique ids and default first', () => {
  assert.equal(WRITING_STYLES[0].id, 'default');
  const ids = WRITING_STYLES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('resolveWritingStyle returns matching preset or falls back to default', () => {
  assert.equal(resolveWritingStyle('ornate').id, 'ornate');
  assert.equal(resolveWritingStyle('unknown').id, 'default');
  assert.equal(resolveWritingStyle(undefined).id, 'default');
});

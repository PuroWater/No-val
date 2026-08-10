import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTargetWords, normalizeBook } from '../src/lib/bookUtils.js';

test('parseTargetWords handles Chinese units', () => {
  assert.equal(parseTargetWords('100万字'), 1000000);
  assert.equal(parseTargetWords('50万'), 500000);
  assert.equal(parseTargetWords('二十万字'), 200000);
  assert.equal(parseTargetWords('10万'), 100000);
  assert.equal(parseTargetWords('3千字'), 3000);
  assert.equal(parseTargetWords('5万字'), 50000);
  assert.equal(parseTargetWords(120000), 120000);
  assert.equal(parseTargetWords('未知'), 0);
  assert.equal(parseTargetWords(''), 0);
});

test('normalizeBook fills targetWords defaults', () => {
  const book = normalizeBook({ chapters: [] });
  assert.equal(book.targetWords, 0);
  assert.equal(book.draft.targetWords, 0);
  const legacy = normalizeBook({ chapters: [], targetWords: 300000 });
  assert.equal(legacy.targetWords, 300000);
});

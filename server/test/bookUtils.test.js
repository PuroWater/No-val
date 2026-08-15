import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBook } from '../src/lib/bookUtils.js';

test('normalizeBook fills targetWords defaults', () => {
  const book = normalizeBook({ chapters: [] });
  assert.equal(book.targetWords, 0);
  assert.equal(book.draft.targetWords, 0);
  assert.equal(book.pendingAction, null);
  assert.equal(book.version, 0);
  assert.equal('timeline' in book, false);
  assert.deepEqual(book.chapters, []);
  const legacy = normalizeBook({ chapters: [], targetWords: 300000 });
  assert.equal(legacy.targetWords, 300000);
});


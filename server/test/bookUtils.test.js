import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBook, normalizeCharacters } from '../src/lib/bookUtils.js';

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

test('normalizeBook fills writingStyle and cover defaults', () => {
  const book = normalizeBook({ chapters: [] });
  assert.equal(book.writingStyle, 'default');
  assert.equal(book.cover, null);
  const styled = normalizeBook({ chapters: [], writingStyle: 'ornate', cover: '/covers/x.jpg' });
  assert.equal(styled.writingStyle, 'ornate');
  assert.equal(styled.cover, '/covers/x.jpg');
});

test('normalizeCharacters preserves avatar and defaults null', () => {
  const cards = normalizeCharacters([
    { name: '主角', avatar: '/covers/avatar_x.jpg', history: [{ chapter: 0, snapshot: { recent: '近况' } }] },
    { name: '配角', history: [] }
  ]);
  assert.equal(cards[0].avatar, '/covers/avatar_x.jpg');
  assert.equal(cards[1].avatar, null);
});


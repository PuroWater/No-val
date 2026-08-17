import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBook, normalizeCharacters, normalizeWorld } from '../src/lib/bookUtils.js';

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

test('normalizeBook assigns main/support roles with fallback main', () => {
  const book = normalizeBook({ chapters: [], characters: [{ name: '甲', history: [] }, { name: '乙', history: [] }] });
  assert.equal(book.characters[0].role, 'main');
  assert.equal(book.characters[1].role, 'support');
  const explicit = normalizeBook({ chapters: [], characters: [{ name: '乙', role: 'main', history: [] }, { name: '甲', history: [] }] });
  assert.equal(explicit.characters[0].role, 'main');
  assert.equal(explicit.characters[1].role, 'support');
});

test('normalizeBook fills world default', () => {
  const book = normalizeBook({ chapters: [] });
  assert.deepEqual(book.world, { history: [] });
});

test('normalizeWorld dedupes by chapter and filters empty snapshots', () => {
  const world = normalizeWorld({ history: [
    { chapter: 0, snapshot: { summary: 'a', factions: [], places: [], systems: [] } },
    { chapter: 0, snapshot: { summary: 'b', factions: [], places: [], systems: [] } },
    { chapter: 1, snapshot: { summary: '', factions: [], places: [], systems: [] } }
  ] });
  assert.equal(world.history.length, 1);
  assert.equal(world.history[0].snapshot.summary, 'b');
});



test('normalizeCharacters removes consumed legacy bag entries and keeps audit trail separate', () => {
  const cards = normalizeCharacters([{
    name: '主角',
    history: [{ chapter: 0, snapshot: {
      bag: [
        { name: '长剑', status: '仍在手中' },
        { name: '回春丹', status: '已使用' },
        { name: '旧令牌', state: 'removed', reason: '本章收回' }
      ]
    } }]
  }]);
  assert.deepEqual(cards[0].history[0].snapshot.bag.map((item) => item.name), ['长剑']);
  assert.deepEqual(cards[0].history[0].snapshot.removedBag.map((item) => item.name), ['回春丹', '旧令牌']);
});

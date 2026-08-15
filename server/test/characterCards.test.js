import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCharacterUpdates } from '../src/services/maintenanceService.js';
import { characterCardsRef, characterContextRef } from '../src/lib/writingPrompts.js';

test('normalizeCharacterUpdates keeps named entries with snapshot', () => {
  const updates = normalizeCharacterUpdates([
    { name: '张三', snapshot: '突破金丹期' },
    { name: '', snapshot: 'x' },
    { name: '李四', snapshot: '  ' },
    null
  ]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].name, '张三');
  assert.equal(updates[0].snapshot, '突破金丹期');
});

test('characterContextRef returns recent movements for related names', () => {
  const book = {
    chapters: [
      { events: [{ event: '张三进山', characters: ['张三'] }] },
      { events: [{ event: '张三遇险', characters: ['张三'] }] },
      { events: [] }
    ]
  };
  const out = characterContextRef(book, { untilChapter: 2, relatedNames: ['张三'] });
  assert.ok(out.includes('张三'));
  assert.ok(out.includes('第1章 张三进山'));
  assert.ok(out.includes('第2章 张三遇险'));
});

test('characterCardsRef returns latest snapshot by position', () => {
  const book = {
    characters: [
      { name: '张三', history: [{ chapter: 0, snapshot: '第1章时' }, { chapter: 2, snapshot: '第3章时' }] }
    ]
  };
  const out = characterCardsRef(book, { untilChapter: 2, relatedNames: ['张三'] });
  assert.ok(out.includes('第1章时'));
  assert.ok(!out.includes('第3章时'));
});
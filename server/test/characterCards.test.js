import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCharacterUpdates } from '../src/services/maintenanceService.js';
import { characterCardsRef, characterContextRef } from '../src/lib/writingPrompts.js';
import { normalizeBag, normalizeCharacters } from '../src/lib/bookUtils.js';

test('normalizeCharacterUpdates keeps named entries with structured snapshot', () => {
  const updates = normalizeCharacterUpdates([
    { name: '张三', snapshot: { identity: '青云宗弟子', bag: [{ name: '寒髓噬灵诀', status: '第3层' }], goal: '解毒', recent: '发现龙血石' } },
    { name: '', snapshot: { recent: 'x' } },
    { name: '李四', snapshot: { identity: '', bag: [], goal: '', recent: '  ' } },
    null
  ]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].name, '张三');
  assert.equal(updates[0].snapshot.identity, '青云宗弟子');
  assert.equal(updates[0].snapshot.bag[0].name, '寒髓噬灵诀');
  assert.equal(updates[0].snapshot.recent, '发现龙血石');
});

test('normalizeCharacterUpdates migrates legacy string snapshot into recent', () => {
  const updates = normalizeCharacterUpdates([{ name: '张三', snapshot: '突破金丹期' }]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].snapshot.recent, '突破金丹期');
  assert.deepEqual(updates[0].snapshot.bag, []);
});

test('normalizeBag caps items and merges overflow as junk', () => {
  const bag = Array.from({ length: 40 }, (_, i) => ({ name: '物品' + i, status: 'x' }));
  const out = normalizeBag(bag, 30);
  assert.ok(out.length <= 30);
  assert.equal(out[out.length - 1].name, '杂物');
  assert.equal(out[out.length - 1].junk, true);
  assert.equal(out.filter((b) => !b.junk).length, 29);
  assert.ok(out.some((b) => b.name === '物品0'));
  assert.ok(!out.some((b) => b.name === '物品39'));
});

test('normalizeBag dedupes same name+status and keeps under cap', () => {
  const out = normalizeBag([{ name: '剑', status: '精铁' }, { name: '剑', status: '精铁' }, { name: '丹', status: '' }], 30);
  assert.equal(out.length, 2);
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

test('characterCardsRef returns structured latest snapshot by position', () => {
  const book = {
    characters: [
      {
        name: '张三',
        history: [
          { chapter: 0, snapshot: { identity: '旧身份', bag: [], goal: '', recent: '第1章时' } },
          { chapter: 2, snapshot: { identity: '新身份', bag: [{ name: '寒髓噬灵诀', status: '第3层' }], goal: '解毒', recent: '第3章时' } }
        ]
      }
    ]
  };
  const out = characterCardsRef(book, { untilChapter: 2, relatedNames: ['张三'] });
  assert.ok(out.includes('第1章时'));
  assert.ok(out.includes('旧身份'));
  assert.ok(!out.includes('第3章时'));
  assert.ok(!out.includes('新身份'));
});

test('characterCardsRef formats bag/identity/goal/recent', () => {
  const book = {
    characters: [
      {
        name: '张三',
        history: [
          { chapter: 0, snapshot: { identity: '青云宗弟子', bag: [{ name: '寒髓噬灵诀', status: '第3层' }, { name: '杂物', status: '旧物', junk: true }], goal: '寻找解药', recent: '深入矿洞' } }
        ]
      }
    ]
  };
  const out = characterCardsRef(book, { untilChapter: 1, relatedNames: ['张三'] });
  assert.ok(out.includes('身份：青云宗弟子'));
  assert.ok(out.includes('寒髓噬灵诀（第3层）'));
  assert.ok(out.includes('目标：寻找解药'));
  assert.ok(out.includes('近况：深入矿洞'));
});

test('normalizeCharacters dedupes history by chapter keeping last', () => {
  const chars = normalizeCharacters([
    {
      name: '张三',
      history: [
        { chapter: 0, snapshot: '旧第1章' },
        { chapter: 0, snapshot: { identity: '新身份', bag: [], goal: '', recent: '新第1章' } },
        { chapter: 2, snapshot: '第3章' }
      ]
    }
  ]);
  assert.equal(chars[0].history.length, 2);
  assert.equal(chars[0].history[0].chapter, 0);
  assert.equal(chars[0].history[0].snapshot.recent, '新第1章');
  assert.equal(chars[0].history[1].chapter, 2);
  assert.equal(chars[0].history[1].snapshot.recent, '第3章');
});

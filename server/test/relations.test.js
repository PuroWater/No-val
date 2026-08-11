import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureChapterTitle } from '../src/lib/chapterUtils.js';
import { sanitizeRelations } from '../src/services/storyMetaService.js';
import { applyChapterEvents, changedEventsContext } from '../src/services/overviewService.js';

test('sanitizeRelations keeps valid nodes and edges', () => {
  const result = sanitizeRelations({
    nodes: [
      { id: 'n_1', name: '林默', type: 'person' },
      { id: 'n_2', name: '恒泰置业', type: 'faction' },
      { id: 'n_2', name: '重复', type: 'person' }
    ],
    edges: [
      { from: 'n_1', to: 'n_2', label: '调查' },
      { from: 'n_1', to: 'n_99', label: '无效' }
    ]
  });
  assert.equal(result.nodes.length, 2);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].label, '调查');
  assert.equal(result.nodes[0].weight >= 1, true);
  assert.equal(typeof result.nodes[0].isMain, 'boolean');
});

test('ensureChapterTitle keeps existing prefix and adds missing one', () => {
  assert.equal(ensureChapterTitle(0, '第一章 少年'), '第一章 少年');
  assert.equal(ensureChapterTitle(1, '第二章：秘藏'), '第二章：秘藏');
  assert.equal(ensureChapterTitle(2, '古卷传承'), '第3章 古卷传承');
  assert.equal(ensureChapterTitle(3, ''), '第4章');
});

test('applyChapterEvents replaces chapter event items and updates prose', () => {
  const book = {
    chapters: [
      { id: 'c1', title: '第一章', events: [{ id: 't1', event: '旧事件1', characters: ['A'] }] },
      { id: 'c2', title: '第二章', events: [{ id: 't2', event: '事件2', characters: ['B'] }] }
    ],
    storySummary: '旧概况'
  };
  applyChapterEvents(book, [0], {
    0: [{ event: '新事件1', characters: ['A', 'C'] }]
  }, '新概况');
  assert.equal(book.chapters[0].events.length, 1);
  assert.equal(book.chapters[0].events[0].event, '新事件1');
  assert.deepEqual(book.chapters[0].events[0].characters, ['A', 'C']);
  assert.equal(book.chapters[1].events[0].event, '事件2');
  assert.equal(book.storySummary, '新概况');
});

test('changedEventsContext only includes changed chapters events', () => {
  const book = {
    chapters: [
      { id: 'c1', title: '第一章', events: [{ event: '事件A' }, { event: '事件B' }] },
      { id: 'c2', title: '第二章', events: [{ event: '事件C' }] },
      { id: 'c3', title: '第三章', events: [] }
    ]
  };
  const text = changedEventsContext(book, [
    { chapterIndex: 0, oldSummary: 'a', newSummary: 'b' },
    { chapterIndex: 2, oldSummary: 'x', newSummary: 'y' }
  ]);
  assert.equal(text.includes('第1章现有事件'), true);
  assert.equal(text.includes('事件A'), true);
  assert.equal(text.includes('事件B'), true);
  assert.equal(text.includes('事件C'), false);
  assert.equal(text.includes('第3章'), false);
  assert.equal(changedEventsContext(book, [{ chapterIndex: 1 }]).includes('事件C'), true);
  assert.equal(changedEventsContext(book, []), '');
});

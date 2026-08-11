import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureChapterTitle } from '../src/lib/chapterUtils.js';
import { sanitizeRelations, applyTimelineChanges } from '../src/services/bookService.js';

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

test('applyTimelineChanges replaces chapter items and updates prose', () => {
  const book = {
    timeline: [
      { id: 't1', chapterIndex: 0, event: '旧事件1', characters: ['A'] },
      { id: 't2', chapterIndex: 1, event: '事件2', characters: ['B'] }
    ],
    storySummary: '旧概况'
  };
  applyTimelineChanges(book, [0], [
    { chapterIndex: 0, event: '新事件1', characters: ['A', 'C'] }
  ], '新概况');
  assert.equal(book.timeline.length, 2);
  assert.equal(book.timeline[0].event, '新事件1');
  assert.equal(book.timeline[0].chapterIndex, 0);
  assert.equal(book.timeline[1].event, '事件2');
  assert.equal(book.storySummary, '新概况');
});

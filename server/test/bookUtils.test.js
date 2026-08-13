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

test('normalizeBook fills relations marker defaults', () => {
  const book = normalizeBook({ chapters: [] });
  assert.deepEqual(book.relations.nodes, []);
  assert.deepEqual(book.relations.edges, []);
  assert.equal(book.relations.generatedAt, null);
  assert.equal(book.relations.coveredUpTo, 0);
  assert.equal(book.relations.mode, '');
  const kept = normalizeBook({
    chapters: [],
    relations: {
      nodes: [{ id: 'n_1', name: '甲' }],
      edges: [],
      generatedAt: '2026-08-11T00:00:00.000Z',
      coveredUpTo: 6,
      mode: 'incremental'
    }
  });
  assert.equal(kept.relations.generatedAt, '2026-08-11T00:00:00.000Z');
  assert.equal(kept.relations.coveredUpTo, 6);
  assert.equal(kept.relations.mode, 'incremental');
});

test('normalizeBook migrates legacy timeline into chapter events', () => {
  const book = normalizeBook({
    title: '旧书',
    chapters: [
      { id: 'c1', title: '第一章', summary: '摘要一' },
      { id: 'c2', title: '第二章', summary: '摘要二' }
    ],
    timeline: [
      { id: 't1', chapterIndex: 0, event: '事件A', characters: ['甲'] },
      { id: 't2', chapterIndex: 1, event: '事件B', characters: ['乙'] }
    ]
  });
  assert.equal('timeline' in book, false);
  assert.equal(book.chapters[0].events.length, 1);
  assert.equal(book.chapters[0].events[0].event, '事件A');
  assert.deepEqual(book.chapters[0].events[0].characters, ['甲']);
  assert.equal(book.chapters[1].events[0].event, '事件B');
});

test('normalizeBook backfills legacy chapter creation dates from book messages', () => {
  const book = normalizeBook({
    createdAt: '2026-08-09T14:00:00.000Z',
    chapters: [
      { id: 'c1', title: '一', updatedAt: '2026-08-10T05:00:00.000Z' },
      { id: 'c2', title: '二', updatedAt: '2026-08-09T15:00:00.000Z' },
      { id: 'c3', title: '三', updatedAt: '2026-08-09T15:00:00.000Z' },
      { id: 'c4', title: '四', updatedAt: '2026-08-09T15:00:00.000Z' },
      { id: 'c5', title: '五', updatedAt: '2026-08-10T07:00:00.000Z' }
    ],
    chat: [
      { kind: 'book', content: '《乐子》已生成，共 4 章。', createdAt: '2026-08-09T15:36:24.946Z' },
      { kind: 'book', content: '已续写下一章《第五章 紫气东来》，可打开并列窗口查看。', createdAt: '2026-08-09T15:36:54.052Z' }
    ]
  });
  assert.equal(book.chapters[0].createdAt, '2026-08-09T15:36:24.946Z');
  assert.equal(book.chapters[3].createdAt, '2026-08-09T15:36:24.946Z');
  assert.equal(book.chapters[4].createdAt, '2026-08-09T15:36:54.052Z');
});

test('normalizeBook attributes all chapters to book creation when chat has no book messages', () => {
  const book = normalizeBook({
    createdAt: '2026-08-09T14:53:52.190Z',
    chapters: [
      { id: 'c1', title: '一', updatedAt: '2026-08-10T05:33:47.646Z' },
      { id: 'c2', title: '二', updatedAt: '2026-08-09T15:38:43.100Z' },
      { id: 'c3', title: '三', updatedAt: '2026-08-09T15:39:39.263Z' },
      { id: 'c4', title: '四', updatedAt: '2026-08-09T15:40:43.197Z' }
    ],
    chat: []
  });
  assert.equal(book.chapters[0].createdAt, '2026-08-09T14:53:52.190Z');
  assert.equal(book.chapters[3].createdAt, '2026-08-09T14:53:52.190Z');
});

test('normalizeBook backfills multi-chapter continuation messages', () => {
  const book = normalizeBook({
    createdAt: '2026-08-09T14:00:00.000Z',
    chapters: [
      { id: 'c1', title: '一', updatedAt: '2026-08-10T05:00:00.000Z' },
      { id: 'c2', title: '二', updatedAt: '2026-08-10T05:00:00.000Z' }
    ],
    chat: [
      { kind: 'book', content: '已续写 2 章：《第四章》《第五章》，可打开并列窗口查看。', createdAt: '2026-08-11T02:00:00.000Z' }
    ]
  });
  assert.equal(book.chapters[0].createdAt, '2026-08-11T02:00:00.000Z');
  assert.equal(book.chapters[1].createdAt, '2026-08-11T02:00:00.000Z');
});

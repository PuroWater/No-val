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

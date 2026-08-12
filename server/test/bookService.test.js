import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteChapters, validateBatchDelete } from '../src/services/bookService.js';
import { renumberChapterPrefixes, searchChapters } from '../src/lib/chapterUtils.js';

test('validateBatchDelete enforces count range and keeps at least one chapter', () => {
  assert.equal(validateBatchDelete(3, 10), '');
  assert.equal(validateBatchDelete(1, 1), '至少保留 1 章，删除数量需小于当前章节总数');
  assert.equal(validateBatchDelete(10, 10), '至少保留 1 章，删除数量需小于当前章节总数');
  assert.equal(validateBatchDelete(0, 10), '删除章节数需为 1-50 的整数');
  assert.equal(validateBatchDelete(51, 100), '删除章节数需为 1-50 的整数');
  assert.equal(validateBatchDelete(2.5, 10), '删除章节数需为 1-50 的整数');
});

test('deleteChapters removes trailing chapters and records pendingDeletes', async () => {
  const book = {
    id: 'b1',
    chapters: Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, title: `第${index + 1}章` })),
    updatedAt: 'old',
    storySummary: '旧概况'
  };
  const result = await deleteChapters(book, { count: 2 });
  assert.equal(result.book.chapters.length, 3);
  assert.deepEqual(result.book.chapters.map((chapter) => chapter.id), ['c0', 'c1', 'c2']);
  assert.equal(result.book.chapters[2].title, '第3章');
  assert.notEqual(result.book.updatedAt, 'old');
  assert.equal(result.book.pendingDeletes.length, 2);
  assert.equal(result.book.pendingDeletes[0].index, 3);
  assert.equal(result.book.pendingDeletes[0].title, '第4章');
  assert.equal(result.book.pendingDeletes[1].index, 4);
});

test('deleteChapters rejects invalid count without mutating book', async () => {
  const book = { chapters: [{ id: 'c0' }] };
  await assert.rejects(() => deleteChapters(book, { count: 1 }), /至少保留 1 章/);
  assert.equal(book.chapters.length, 1);
});

test('deleteChapters removes middle chapter and renumbers standard prefixes', async () => {
  const book = {
    id: 'b1',
    chapters: [
      { id: 'c0', title: '第1章 开端' },
      { id: 'c1', title: '第2章 冲突' },
      { id: 'c2', title: '第3章 转折' },
      { id: 'c3', title: '终章' }
    ]
  };
  const result = await deleteChapters(book, { index: 1 });
  assert.equal(result.book.chapters.length, 3);
  assert.deepEqual(result.book.chapters.map((chapter) => chapter.id), ['c0', 'c2', 'c3']);
  assert.equal(result.book.chapters[1].title, '第2章 转折');
  assert.equal(result.book.chapters[2].title, '终章');
  assert.equal(result.book.pendingDeletes.length, 1);
  assert.equal(result.book.pendingDeletes[0].title, '第2章 冲突');
  assert.deepEqual(result.affectedIds, ['c2']);
});

test('renumberChapterPrefixes only touches standard prefixed titles', () => {
  const book = {
    chapters: [
      { id: 'c0', title: '第1章 开端' },
      { id: 'c1', title: '第3章 转折' },
      { id: 'c2', title: '终章' },
      { id: 'c3', title: '第99章 后记' }
    ]
  };
  const count = renumberChapterPrefixes(book, { fromIndex: 1 });
  assert.equal(count, 2);
  assert.equal(book.chapters[1].title, '第2章 转折');
  assert.equal(book.chapters[2].title, '终章');
  assert.equal(book.chapters[3].title, '第4章 后记');
});

test('renumberChapterPrefixes collects changed chapter ids', () => {
  const book = {
    chapters: [
      { id: 'c0', title: '第1章 开端' },
      { id: 'c1', title: '第3章 转折' },
      { id: 'c2', title: '终章' },
      { id: 'c3', title: '第99章 后记' }
    ]
  };
  const collect = new Set();
  renumberChapterPrefixes(book, { fromIndex: 1, collect });
  assert.deepEqual([...collect].sort(), ['c1', 'c3']);
});

test('searchChapters returns empty for out-of-range chapter numbers', () => {
  const book = {
    chapters: [
      { title: '第1章 开端' },
      { title: '第2章 调查' }
    ]
  };
  assert.equal(searchChapters(book, '第 99 章').length, 0);
  assert.equal(searchChapters(book, '99').length, 0);
  assert.equal(searchChapters(book, '第二章')[0].index, 1);
});

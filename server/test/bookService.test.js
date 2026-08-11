import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteLastChapters, validateBatchDelete } from '../src/services/bookService.js';

test('validateBatchDelete enforces count range and keeps at least one chapter', () => {
  assert.equal(validateBatchDelete(3, 10), '');
  assert.equal(validateBatchDelete(1, 1), '至少保留 1 章，删除数量需小于当前章节总数');
  assert.equal(validateBatchDelete(10, 10), '至少保留 1 章，删除数量需小于当前章节总数');
  assert.equal(validateBatchDelete(0, 10), '删除章节数需为 1-50 的整数');
  assert.equal(validateBatchDelete(51, 100), '删除章节数需为 1-50 的整数');
  assert.equal(validateBatchDelete(2.5, 10), '删除章节数需为 1-50 的整数');
});

test('deleteLastChapters splices trailing chapters and maintains overview tail', async () => {
  const calls = [];
  const book = {
    id: 'b1',
    chapters: Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, title: `第${index + 1}章` })),
    updatedAt: 'old',
    storySummary: '旧概况'
  };
  const result = await deleteLastChapters(book, 2, {
    awaitTail: true,
    tailUpdater: async (target, options) => { calls.push({ target, options }); }
  });
  assert.equal(result.chapters.length, 3);
  assert.deepEqual(result.chapters.map((chapter) => chapter.id), ['c0', 'c1', 'c2']);
  assert.equal(result.chapters[2].title, '第3章');
  assert.notEqual(result.updatedAt, 'old');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, book);
  assert.equal(calls[0].options.lastIndex, 2);
});

test('deleteLastChapters rejects invalid count without mutating book', async () => {
  const book = { chapters: [{ id: 'c0' }] };
  await assert.rejects(() => deleteLastChapters(book, 1, { awaitTail: true }), /至少保留 1 章/);
  assert.equal(book.chapters.length, 1);
});

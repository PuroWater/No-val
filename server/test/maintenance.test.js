import test from 'node:test';
import assert from 'node:assert/strict';
import { maintainChapterMeta } from '../src/services/maintenanceService.js';

test('maintainChapterMeta skips AI and marks empty chapter as 暂无内容', async () => {
  const book = {
    chapters: [{ id: 'c1', title: '第1章', content: '   ', summary: '', events: [] }],
    pendingDeletes: [{ index: 0, title: '旧章', deletedAt: 'x' }],
    storySummary: '旧概况',
    updatedAt: 'old'
  };
  const result = await maintainChapterMeta(book, { chapterIndex: 0, mode: 'modify' });
  assert.equal(result.chapters[0].summary, '该章暂无内容');
  assert.deepEqual(result.chapters[0].events, []);
  assert.equal(result.pendingDeletes.length, 1);
  assert.notEqual(result.chapters[0].updatedAt, undefined);
});

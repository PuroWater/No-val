import test from 'node:test';
import assert from 'node:assert/strict';
import { maintainChapterMeta, normalizeChapterEvents } from '../src/services/maintenanceService.js';

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

test('normalizeChapterEvents caps at 3 and unifies dominant context[0]', () => {
  const raw = [
    { event: '北境遇敌', characters: ['甲'], context: ['北境矿脉之行', '矿洞深处'] },
    { event: '家族议事', characters: ['乙'], context: ['家族', '议事堂'] },
    { event: '北境夺宝', characters: ['甲'], context: ['北境矿脉之行', '地下宫殿'] },
    { event: '被删的第 4 个事件', characters: [], context: ['北境矿脉之行', '矿洞外'] }
  ];
  const events = normalizeChapterEvents(raw);
  assert.equal(events.length, 3);
  // 多数背景为“北境矿脉之行”，家族议事事件也统一归入，但保留其场景
  assert.ok(events.every((item) => item.context[0] === '北境矿脉之行'));
  const family = events.find((item) => item.event === '家族议事');
  assert.deepEqual(family.context, ['北境矿脉之行', '议事堂']);
  assert.equal(events.some((item) => item.event === '被删的第 4 个事件'), false);
});

test('normalizeChapterEvents keeps empty context untouched and handles empty input', () => {
  assert.deepEqual(normalizeChapterEvents([]), []);
  const events = normalizeChapterEvents([{ event: '无背景事件', characters: [] }]);
  assert.deepEqual(events[0].context, []);
});

test('normalizeChapterEvents trims context to two levels', () => {
  const events = normalizeChapterEvents([
    { event: '深入矿洞', characters: [], context: ['北境矿脉之行', '矿洞深处', '隐秘洞窟'] }
  ]);
  assert.deepEqual(events[0].context, ['北境矿脉之行', '矿洞深处']);
});

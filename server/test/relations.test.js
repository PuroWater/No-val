import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureChapterTitle } from '../src/lib/chapterUtils.js';
import {
  buildDevelopmentLine,
  changedChaptersSince,
  sanitizeRelations,
  splitIntoBlocks
} from '../src/services/storyMetaService.js';

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

test('splitIntoBlocks respects chapter and character caps', () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    index,
    summary: `摘要${'长'.repeat(10)}${index}`
  }));
  const byChapters = splitIntoBlocks(entries, { maxChapters: 2, maxChars: 100000 });
  assert.equal(byChapters.length, 3);
  assert.deepEqual(byChapters[0].map((item) => item.index), [0, 1]);
  assert.deepEqual(byChapters[2].map((item) => item.index), [4, 5]);
  const byChars = splitIntoBlocks(entries, { maxChapters: 100, maxChars: 40 });
  assert.equal(byChars.length > 1, true);
  assert.equal(splitIntoBlocks([]).length, 0);
});

test('changedChaptersSince returns edited chapters after generatedAt', () => {
  const book = {
    chapters: [
      { index: 0, updatedAt: '2026-08-10T00:00:00.000Z', summary: '旧' },
      { index: 1, updatedAt: '2026-08-11T12:00:00.000Z', summary: '新' },
      { index: 2, updatedAt: '2026-08-11T12:00:00.000Z', summary: '' },
      { index: 3, summary: '无更新时间' }
    ]
  };
  const changed = changedChaptersSince(book, '2026-08-11T00:00:00.000Z');
  assert.equal(changed.length, 1);
  assert.equal(changed[0].index, 1);
  assert.equal(changedChaptersSince(book, null).length, 0);
});

test('buildDevelopmentLine groups by context and keeps plain chapters in 其他', () => {
  const book = {
    chapters: [
      { id: 'c1', title: '第一章', events: [{ event: '进入秘境', context: ['秘境探险'] }] },
      { id: 'c2', title: '第二章', events: [{ event: '在藏宝室获得古宝', context: ['秘境探险', '藏宝室'] }] },
      { id: 'c3', title: '第三章', events: [{ event: '回到都市' }] }
    ]
  };
  const timeline = buildDevelopmentLine(book);
  assert.equal(timeline.groups.length, 2);
  const secret = timeline.groups.find((g) => g.label === '秘境探险');
  assert.equal(secret.id, '秘境探险#0-1');
  assert.equal(secret.chapterStart, 0);
  assert.equal(secret.chapterEnd, 1);
  // 第一章只有一层 context → 组级 chapters（未细分）；第二章进入命名场景
  assert.equal(secret.chapters.length, 1);
  assert.equal(secret.chapters[0].chapterIndex, 0);
  assert.equal(secret.scenes.length, 1);
  assert.equal(secret.scenes[0].label, '藏宝室');
  assert.equal(secret.scenes[0].chapters[0].chapterIndex, 1);
  const other = timeline.groups.find((g) => g.label === '其他');
  assert.equal(other.id, '其他#2-2');
  assert.equal(other.chapters.length, 1);
  assert.equal(other.chapters[0].chapterIndex, 2);
  assert.equal(buildDevelopmentLine({}).groups.length, 0);
});

test('buildDevelopmentLine splits same label into contiguous chapter ranges', () => {
  const book = {
    chapters: [
      { id: 'c1', title: '第一章', events: [{ event: '家族演武', context: ['家族', '演武场'] }] },
      { id: 'c2', title: '第二章', events: [{ event: '北境启程', context: ['北境矿脉之行'] }] },
      { id: 'c3', title: '第三章', events: [{ event: '北境遇敌', context: ['北境矿脉之行', '矿洞'] }] },
      { id: 'c4', title: '第四章', events: [{ event: '回到家族', context: ['家族', '议事堂'] }] }
    ]
  };
  const timeline = buildDevelopmentLine(book);
  const familyGroups = timeline.groups.filter((g) => g.label === '家族');
  assert.equal(familyGroups.length, 2);
  assert.equal(familyGroups[0].id, '家族#0-0');
  assert.equal(familyGroups[0].chapterStart, 0);
  assert.equal(familyGroups[0].chapterEnd, 0);
  assert.equal(familyGroups[1].id, '家族#3-3');
  assert.equal(familyGroups[1].chapterStart, 3);
  assert.equal(familyGroups[1].chapterEnd, 3);
  const north = timeline.groups.find((g) => g.label === '北境矿脉之行');
  assert.equal(north.chapterStart, 1);
  assert.equal(north.chapterEnd, 2);
  // 组按起始章排序：家族(1) → 北境(2-3) → 家族(4)
  assert.deepEqual(timeline.groups.map((g) => g.label), ['家族', '北境矿脉之行', '家族']);
  assert.deepEqual(timeline.groups.map((g) => g.chapterStart), [0, 1, 3]);
});

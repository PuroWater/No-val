import test from 'node:test';
import assert from 'node:assert/strict';
import { defineReadyTools } from '../src/services/tools.js';

function sampleBook() {
  return {
    id: 'b1',
    title: '测试书',
    outline: '简介',
    targetWords: 0,
    relations: { nodes: [], edges: [] },
    chapters: [
      {
        id: 'c1',
        title: '第1章 起始',
        content: '第一章正文开头。' + '正'.repeat(12000),
        summary: '第一章摘要',
        events: [
          {
            id: 'e1',
            event: '第一章事件',
            context: ['家族', '藏书阁'],
            foreshadow: 'setup'
          }
        ]
      },
      {
        id: 'c2',
        title: '第2章 发展',
        content: '第二章正文内容。',
        summary: '第二章摘要',
        events: [{ id: 'e2', event: '第二章事件' }]
      },
      {
        id: 'c3',
        title: '第3章 转折',
        content: '第三章正文内容。',
        summary: '第三章摘要',
        events: []
      }
    ]
  };
}

function readTool(book = sampleBook()) {
  const tools = defineReadyTools(book, {}, new AbortController().signal);
  return tools.find((tool) => tool.name === 'read_book');
}

test('read_book single chapter returns full content without truncation', async () => {
  const out = await readTool().handler({ field: 'chapter', target: 1 }, {});
  assert.equal(out.ok, true);
  assert.ok(out.data.includes('第 1 章《第1章 起始》'));
  assert.ok(out.data.includes('摘要：第一章摘要'));
  assert.ok(out.data.includes('事件：'));
  assert.ok(out.data.includes('1. 第一章事件（家族/藏书阁）[伏笔：铺设]'));
  assert.ok(out.data.includes('正文：'));
  assert.ok(out.data.includes('第一章正文开头。'));
  // 正文全量返回，不做节选截断（章节长度由 105% 上限兜底）
  assert.ok(out.data.includes('正'.repeat(12000)));
});

test('read_book single chapter without events still returns content', async () => {
  const out = await readTool().handler({ field: 'chapter', target: 3 }, {});
  assert.equal(out.ok, true);
  assert.ok(out.data.includes('正文：'));
  assert.ok(out.data.includes('第三章正文内容。'));
  assert.ok(!out.data.includes('事件：'));
});

test('read_book scope=summary returns title, summary and events without content', async () => {
  const out = await readTool().handler({ field: 'chapter', target: 1, scope: 'summary' }, {});
  assert.equal(out.ok, true);
  assert.ok(out.data.includes('摘要：第一章摘要'));
  assert.ok(out.data.includes('事件：'));
  assert.ok(!out.data.includes('正文：'));
  assert.ok(!out.data.includes('第一章正文开头。'));
});

test('read_book rejects range targets (single chapter only)', async () => {
  const out = await readTool().handler({ field: 'chapter', target: '1-2' }, {});
  assert.equal(out.ok, false);
  assert.equal(out.retryable, true);
  assert.ok(out.data.includes('只支持单章读取'));
});

test('read_book rejects nonexistent chapter', async () => {
  const missing = await readTool().handler({ field: 'chapter', target: 99 }, {});
  assert.equal(missing.ok, false);
  assert.ok(missing.data.includes('只支持单章读取'));
});

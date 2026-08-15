import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { maintainChapterMeta, normalizeChapterEvents } from '../src/services/maintenanceService.js';

test('maintainChapterMeta skips AI and marks empty chapter as 暂无内容', async () => {
  const book = {
    chapters: [{ id: 'c1', title: '第1章', content: '   ', summary: '', events: [] }],
    updatedAt: 'old'
  };
  const result = await maintainChapterMeta(book, { chapterIndex: 0, mode: 'modify' });
  assert.equal(result.chapters[0].summary, '该章暂无内容');
  assert.deepEqual(result.chapters[0].events, []);
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

test('maintainChapterMeta respects maintenance thinking stage and survives missing settings', async () => {
  // 0.9.3 回归：签名缺少 settings 导致 ReferenceError（0.9.1 遗留），且维护档开关应生效。
  // 用 stub fetch 走真实 callModel 链，避免真实网络；环境变量已移除（0.9.6 v2），临时写入 providers.json 提供测试 Key，用后恢复。
  const { writeModelEntries } = await import('../src/lib/providersStore.js');
  const { PROVIDERS_FILE } = await import('../src/lib/store.js');
  const hadFile = fs.existsSync(PROVIDERS_FILE);
  const backup = hadFile ? fs.readFileSync(PROVIDERS_FILE, 'utf8') : null;
  writeModelEntries([{
    id: 'test', vendor: 'deepseek', name: '测试', protocol: 'openai',
    baseUrl: 'https://api.deepseek.com', apiKey: 'test-key', model: 'deepseek-v4-flash',
    thinkingStyle: 'deepseek', thinkingDefault: 'on', thinkingMandatory: false,
    capabilities: { supportsThinking: true, supportsReasoningEffort: true, supportsTools: true, supportsJsonMode: true, maxOutputTokens: 65536, thinkingMandatory: false, thinkingDefault: 'on' }
  }], 'test');
  const originalFetch = globalThis.fetch;
  let capturedThinkingType = null;
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.thinking) capturedThinkingType = body.thinking.type;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ summary: '本章摘要测试', events: [], characters: [] }) } }]
      })
    };
  };
  try {
    const book = {
      chapters: [
        { id: 'c1', title: '第1章', content: '正文内容……正文内容……', summary: '', events: [], updatedAt: 'old' },
        { id: 'c2', title: '第2章', content: '正文内容……正文内容……', summary: '', events: [], updatedAt: 'old' }
      ],
      updatedAt: 'old'
    };
    // 自定义模式：维护档开思考
    await maintainChapterMeta(book, { chapterIndex: 0, mode: 'modify', settings: { thinkingMode: 'custom', thinkingStages: { maintenance: true } } });
    assert.equal(book.chapters[0].summary, '本章摘要测试');
    assert.equal(capturedThinkingType, 'enabled');
    // 缺省 settings：维护默认关思考，且不再抛 ReferenceError
    capturedThinkingType = null;
    await maintainChapterMeta(book, { chapterIndex: 1, mode: 'modify' });
    assert.equal(book.chapters[1].summary, '本章摘要测试');
    assert.equal(capturedThinkingType, 'disabled');
  } finally {
    globalThis.fetch = originalFetch;
    if (hadFile) fs.writeFileSync(PROVIDERS_FILE, backup, 'utf8'); else fs.rmSync(PROVIDERS_FILE, { force: true });
  }
});

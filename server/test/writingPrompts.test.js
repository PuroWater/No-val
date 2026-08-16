import test from 'node:test';
import assert from 'node:assert/strict';
import {
  writingSystem,
  CHAPTER_ENDING_RULE,
  OUTLINE_EXPANSION_RULE,
  creationContextRef,
  rewriteContextRef
} from '../src/lib/writingPrompts.js';

test('writingSystem injects chapter ending and outline expansion rules', () => {
  const system = writingSystem('创作');
  assert.ok(system.includes(CHAPTER_ENDING_RULE));
  assert.ok(system.includes(OUTLINE_EXPANSION_RULE));
  assert.ok(system.includes('只返回 JSON'));
});

test('writingSystem injects writing style prompt when provided', () => {
  const style = '文笔简洁明快：多用短句，少修饰。';
  const system = writingSystem('创作', style);
  assert.ok(system.includes(style));
  assert.ok(system.indexOf(style) < system.indexOf('始终只返回 JSON'));
});

test('creationContextRef keeps uniform order and appends progress for new chapter', () => {
  const book = { targetWords: 2000, chapters: [{ content: 'x'.repeat(1000) }] };
  const prev = { title: '第1章', summary: '上章摘要', content: '上章结尾内容' };
  const out = creationContextRef(book, prev, null);
  // 行序统一：上章摘要 → 上章结尾 → 进度（新章追加末尾时无下章，自动省略下一章行）
  assert.ok(out.indexOf('上一章摘要') < out.indexOf('上一章结尾'));
  assert.ok(out.indexOf('上一章结尾') < out.indexOf('全书目标约'));
  assert.ok(!out.includes('下一章'));
  // 进度为确定性计算：目标 2000 / 已写 1000 / 50%
  assert.ok(out.includes('全书目标约 2000 字'));
  assert.ok(out.includes('当前已写约 1000 字'));
  assert.ok(out.includes('50%'));
});

test('creationContextRef includes next chapter rows when inserting middle chapter', () => {
  const book = { targetWords: 0, chapters: [] };
  const prev = { title: '第1章', summary: '上章摘要', content: '上章结尾内容' };
  const next = { title: '第3章', summary: '下章摘要', content: '下章开头内容' };
  const out = creationContextRef(book, prev, next);
  assert.ok(out.includes('下一章摘要'));
  assert.ok(out.includes('下一章开头'));
  assert.ok(out.indexOf('下一章摘要') < out.indexOf('下一章开头'));
  // 未设置目标字数时进度走“稳步推进”分支
  assert.ok(out.includes('请稳步推进剧情'));
});

test('rewriteContextRef has no progress line and same prefix order', () => {
  const book = { targetWords: 2000, chapters: [] };
  const prev = { title: '第1章', summary: '上章摘要', content: '上章结尾内容' };
  const next = { title: '第3章', summary: '下章摘要', content: '下章开头内容' };
  const out = rewriteContextRef(book, prev, next);
  assert.ok(!out.includes('全书目标'));
  assert.ok(out.indexOf('上一章摘要') < out.indexOf('上一章结尾'));
  assert.ok(out.indexOf('上一章结尾') < out.indexOf('下一章摘要'));
  assert.ok(out.indexOf('下一章摘要') < out.indexOf('下一章开头'));
});

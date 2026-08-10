import test from 'node:test';
import assert from 'node:assert/strict';
import { isConfirmation, mergeBookState, extractInstruction, searchChapters } from '../src/services/chatService.js';

test('isConfirmation recognizes confirmation phrases', () => {
  assert.equal(isConfirmation('确认'), true);
  assert.equal(isConfirmation('不用修改，开始生成吧'), true);
  assert.equal(isConfirmation('主角叫林晚'), false);
});

test('searchChapters matches chapter number, exact title and fuzzy title', () => {
  const book = {
    chapters: [
      { title: '第一章 循环开始' },
      { title: '第二章 线索浮现' },
      { title: '第三章 真相逼近' },
      { title: '第四章 打破循环' },
      { title: '第五章 结局揭晓' }
    ]
  };
  assert.equal(searchChapters(book, '第4章')[0].index, 3);
  assert.equal(searchChapters(book, '修改第二章，扩写500字')[0].index, 1);
  assert.equal(searchChapters(book, '真相逼近')[0].index, 2);
  assert.equal(searchChapters(book, '循环').length, 2);
  assert.deepEqual(searchChapters(book, '不存在的章节'), []);
});

test('searchChapters returns multiple candidates for similar titles', () => {
  const book = {
    chapters: [
      { title: '风起' },
      { title: '风起云涌' },
      { title: '云涌之后' },
      { title: '山水之间' }
    ]
  };
  const matches = searchChapters(book, '风起');
  assert.ok(matches.length >= 2);
  assert.equal(matches[0].index, 0);
});

test('extractInstruction strips chapter and verbs from rewrite request', () => {
  const book = {
    chapters: [
      { title: '第一章 循环开始' },
      { title: '第二章 线索浮现' },
      { title: '第三章 真相逼近' }
    ]
  };
  assert.equal(extractInstruction(book, '修改第二章，扩写500字', 1), '扩写500字');
  assert.equal(extractInstruction(book, '改写第一章', 0), '');
});

test('mergeBookState preserves concurrent edits and applies AI changes', () => {
  const latest = {
    title: '书',
    status: 'ready',
    storySummary: '旧摘要',
    targetWords: 0,
    draft: {},
    rewrite: { step: 'none', chapterIndex: -1 },
    chapters: [
      { id: 'c1', title: '一', content: '用户并发修改后的内容', updatedAt: 'T2' },
      { id: 'c2', title: '二', content: '原样', updatedAt: 'T0' }
    ],
    chat: [
      { id: 'm_user', role: 'user', content: '继续写', kind: 'text' },
      { id: 'm_proc', role: 'agent', content: '正在处理，请稍候…', kind: 'processing' }
    ]
  };
  const mutated = {
    title: '书',
    status: 'ready',
    storySummary: '新摘要',
    targetWords: 100000,
    draft: {},
    rewrite: { step: 'none', chapterIndex: -1 },
    chapters: [
      { id: 'c1', title: '一', content: 'AI 拿到的旧版本', updatedAt: 'T1' },
      { id: 'c2', title: '二', content: '原样', updatedAt: 'T0' },
      { id: 'c3', title: '三', content: 'AI 新增章节', updatedAt: 'T3' }
    ],
    chat: [
      { id: 'm_user', role: 'user', content: '继续写', kind: 'text' },
      { id: 'm_proc', role: 'agent', content: '已续写下一章《三》', kind: 'book' }
    ]
  };
  mergeBookState(latest, mutated, new Set(['c3']));
  assert.equal(latest.chapters[0].content, '用户并发修改后的内容');
  assert.equal(latest.chapters.length, 3);
  assert.equal(latest.chapters[2].id, 'c3');
  assert.equal(latest.chat[1].kind, 'book');
  assert.equal(latest.targetWords, 100000);
  assert.equal(latest.storySummary, '新摘要');
});

test('mergeBookState applies rewritten chapters', () => {
  const latest = {
    chapters: [{ id: 'c1', title: '一', content: '并发编辑', updatedAt: 'T2' }],
    chat: []
  };
  const mutated = {
    chapters: [{ id: 'c1', title: '一', content: 'AI 改写结果', updatedAt: 'T3' }],
    chat: []
  };
  mergeBookState(latest, mutated, new Set(['c1']));
  assert.equal(latest.chapters[0].content, 'AI 改写结果');
});

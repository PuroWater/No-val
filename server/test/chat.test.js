import test from 'node:test';
import assert from 'node:assert/strict';
import { fixChapterPrefixes, replaceTextInBook, isLastChapter } from '../src/lib/chapterUtils.js';
import {
  isConfirmation,
  mergeBookState,
  buildTodayHistory
} from '../src/services/chatService.js';

test('isConfirmation recognizes confirmation phrases', () => {
  assert.equal(isConfirmation('确认'), true);
  assert.equal(isConfirmation('不用修改，开始生成吧'), true);
  assert.equal(isConfirmation('主角叫林晚'), false);
});

test('buildTodayHistory keeps today chat and excludes current user and processing', () => {
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const book = {
    chat: [
      { role: 'user', content: '昨天的讨论', kind: 'text', createdAt: yesterday },
      { role: 'user', content: '我们约定主角叫高远', kind: 'text', createdAt: today },
      { role: 'agent', content: '好的', kind: 'text', createdAt: today },
      { role: 'user', content: '主角叫什么？', kind: 'text', createdAt: today },
      { role: 'agent', content: '正在处理，请稍候…', kind: 'processing', createdAt: today }
    ]
  };
  const history = buildTodayHistory(book);
  assert.equal(history.includes('昨天的讨论'), false);
  assert.equal(history.includes('我们约定主角叫高远'), true);
  assert.equal(history.includes('主角叫什么？'), false);
  assert.equal(history.includes('正在处理'), false);
});

test('fixChapterPrefixes batches prefixes in arabic or chinese format', () => {
  const book = {
    chapters: [
      { id: 'p1', title: '第一章 雾起', updatedAt: 'T0' },
      { id: 'p2', title: '雾中寻踪', updatedAt: 'T0' },
      { id: 'p3', title: '第十二章 尾声', updatedAt: 'T0' }
    ]
  };
  const changeLog = new Set();
  const arabic = fixChapterPrefixes(book, 'arabic', changeLog);
  assert.equal(arabic, 3);
  assert.deepEqual(
    book.chapters.map((c) => c.title),
    ['第1章 雾起', '第2章 雾中寻踪', '第3章 尾声']
  );
  assert.equal(changeLog.size, 3);

  const chineseBook = {
    chapters: [
      { id: 'q1', title: '第1章 雾起', updatedAt: 'T0' },
      { id: 'q2', title: '试炼', updatedAt: 'T0' }
    ]
  };
  const chineseCount = fixChapterPrefixes(chineseBook, 'chinese');
  assert.equal(chineseCount, 2);
  assert.deepEqual(
    chineseBook.chapters.map((c) => c.title),
    ['第一章 雾起', '第二章 试炼']
  );

  const noop = fixChapterPrefixes(book, 'arabic');
  assert.equal(noop, 0);
});

test('isLastChapter only accepts the final chapter', () => {
  const book = { chapters: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] };
  assert.equal(isLastChapter(book, 'c3'), true);
  assert.equal(isLastChapter(book, 'c2'), false);
  assert.equal(isLastChapter(book, 'nope'), false);
  assert.equal(isLastChapter({ chapters: [] }, 'x'), false);
});

test('replaceTextInBook replaces text across chapter fields', () => {
  const book = {
    title: '陈默传奇',
    outline: '陈默的修真之路',
    storySummary: '陈默捡到古卷。',
    draft: { concept: '主角陈默', summary: '陈默得宝' },
    chapters: [
      { id: 'r1', title: '第一章 陈默', content: '陈默捡到玉佩，陈默开始修炼。', summary: '陈默得宝。', events: [{ id: 'e1', event: '陈默捡到古卷', characters: ['陈默'] }], updatedAt: 'T0' },
      { id: 'r2', title: '第二章 试炼', content: '陈默进入试炼场。', summary: '试炼。', updatedAt: 'T0' }
    ]
  };
  const changeLog = new Set();
  const count = replaceTextInBook(book, '陈默', '高远', changeLog);
  assert.equal(count, 12);
  assert.equal(book.chapters[0].content.includes('高远'), true);
  assert.equal(book.chapters[0].content.includes('陈默'), false);
  assert.equal(book.chapters[1].summary, '试炼。');
  assert.equal(book.title, '高远传奇');
  assert.equal(book.outline, '高远的修真之路');
  assert.equal(book.storySummary, '高远捡到古卷。');
  assert.equal(book.draft.concept, '主角高远');
  assert.equal(book.draft.summary, '高远得宝');
  assert.equal(book.chapters[0].events[0].event, '高远捡到古卷');
  assert.deepEqual(book.chapters[0].events[0].characters, ['高远']);
  assert.equal(changeLog.has('r1'), true);
  assert.equal(changeLog.has('r2'), true);
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

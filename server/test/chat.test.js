import test from 'node:test';
import assert from 'node:assert/strict';
import { fixChapterPrefixes, replaceTextInBook, isLastChapter } from '../src/lib/chapterUtils.js';
import {
  isConfirmation,
  mergeBookState,
  buildTodayHistory,
  syncChangeLogFromEffect
} from '../src/services/chatService.js';

test('isConfirmation recognizes confirmation phrases', () => {
  assert.equal(isConfirmation('确认'), true);
  assert.equal(isConfirmation('不用修改，开始生成吧'), true);
  assert.equal(isConfirmation('主角叫林晚'), false);
});

test('规模字段不再从用户文本正则推断，未指定字段由路由使用 default', () => {
  assert.equal('hasExplicitChapterWords' in {}, false);
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
    draft: { concept: '主角陈默', summary: '陈默得宝' },
    chapters: [
      { id: 'r1', title: '第一章 陈默', content: '陈默捡到玉佩，陈默开始修炼。', summary: '陈默得宝。', events: [{ id: 'e1', event: '陈默捡到古卷', characters: ['陈默'] }], updatedAt: 'T0' },
      { id: 'r2', title: '第二章 试炼', content: '陈默进入试炼场。', summary: '试炼。', updatedAt: 'T0' }
    ]
  };
  const changeLog = new Set();
  const count = replaceTextInBook(book, '陈默', '高远', changeLog);
  assert.equal(count, 11);
  assert.equal(book.chapters[0].content.includes('高远'), true);
  assert.equal(book.chapters[0].content.includes('陈默'), false);
  assert.equal(book.chapters[1].summary, '试炼。');
  assert.equal(book.title, '高远传奇');
  assert.equal(book.outline, '高远的修真之路');
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

test('mergeBookState syncs pendingAction (interrupt state)', () => {
  const latest = { chapters: [], chat: [], pendingAction: { intent: 'rewrite', output: null, target: null } };
  const mutated = { chapters: [], chat: [], pendingAction: null };
  mergeBookState(latest, mutated, new Set(), new Set());
  assert.equal(latest.pendingAction, null);
});

test('mergeBookState persists characters/writingStyle/cover/sortOrder', () => {
  const latest = { chapters: [], chat: [], characters: [{ name: '旧', history: [] }], writingStyle: 'default', cover: null, sortOrder: 1, world: { history: [] } };
  const mutated = { chapters: [], chat: [], characters: [{ name: '新', history: [] }], writingStyle: 'ornate', cover: '/covers/x.jpg', sortOrder: 2, world: { history: [{ chapter: 0, snapshot: { summary: 's', factions: [], places: [], systems: [] } }] } };
  mergeBookState(latest, mutated, new Set(), new Set());
  assert.equal(latest.characters[0].name, '新');
  assert.equal(latest.writingStyle, 'ornate');
  assert.equal(latest.cover, '/covers/x.jpg');
  assert.equal(latest.sortOrder, 2);
  assert.equal(latest.world.history[0].snapshot.summary, 's');
});

test('syncChangeLogFromEffect unifies bookkeeping from tool effect', () => {
  const changeLog = { chapterIds: new Set(), deletedChapterIds: new Set() };
  const book = { chapters: [{ id: 'c1', title: '第1章' }, { id: 'c2', title: '第2章' }] };
  // 新建：ids 进 chapterIds，定位到新章
  book.chapters.push({ id: 'c3', title: '第3章' });
  syncChangeLogFromEffect(changeLog, book, { ok: true, data: 'x', effect: { type: 'chapters', delta: 1, ids: ['c3'] } });
  assert.equal(changeLog.chapterIds.has('c3'), true);
  assert.equal(changeLog.lastEditedIndex, 2);
  // 删除：ids 进 deletedChapterIds，renamedIds 进 chapterIds，定位重排后的章
  book.chapters.splice(0, 1);
  syncChangeLogFromEffect(changeLog, book, { ok: true, data: 'x', effect: { type: 'chapters', delta: -1, ids: ['c1'], renamedIds: ['c2'] } });
  assert.equal(changeLog.deletedChapterIds.has('c1'), true);
  assert.equal(changeLog.chapterIds.has('c2'), true);
  assert.equal(changeLog.lastEditedIndex, 0);
});

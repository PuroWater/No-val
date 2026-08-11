import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { newId, normalizeBook } from '../lib/bookUtils.js';
import { ensureChapterTitle } from '../lib/chapterUtils.js';
import { chatCompletion } from './deepseek.js';
import { callModel } from '../lib/modelCall.js';
import { syncChapterOverview } from './overviewService.js';

export function updateBook(userId, bookId, apply) {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === bookId && item.userId === userId);
  if (!book) throw new Error('书籍不存在');
  apply(book);
  writeJson(BOOKS_FILE, books);
  return book;
}

function clampOutput(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function maxTokensForWords(chapterWords) {
  return Math.min(32768, Math.max(3000, Math.round(Number(chapterWords) * 2.2)));
}

function nextChapterId(book) {
  return `c_${book.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function buildStorySummary(chapters) {
  const summaries = chapters.map((chapter) => chapter.summary).filter(Boolean);
  return summaries.length > 0 ? summaries.join('\n') : '';
}

export async function generateBookContent(concept, options = {}) {
  const chaptersPerOutput = clampOutput(options.chaptersPerOutput, 1, 5, 3);
  const chapterWords = clampOutput(options.chapterWords, 1000, 10000, 2000);
  const targetWords = Number(options.targetWords) || 0;
  const chapters = [];
  let title = '';
  let outline = '';
  for (let index = 0; index < chaptersPerOutput; index += 1) {
    const written = (index + 1) * chapterWords;
    const ratioText = targetWords > 0
      ? `本次已输出约 ${written} 字，占全书目标 ${targetWords} 字的 ${Math.round((written / targetWords) * 100)}%。请按此比例安排剧情发展，不要一口气写完整个故事。`
      : '请按本次输出规模安排剧情发展。';
    const result = await callModel(
      () => ({
        system: '你是小说创作助手。始终只返回 JSON，不要包含 Markdown。',
        user: index === 0
          ? `根据构思创作小说的第 1 章，本章约 ${chapterWords} 字。${ratioText}\n章节标题统一为“第X章 + 标题”格式（如“第一章 少年”）。\n返回 JSON：{"title":"书名","outline":"简介","chapter":{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}}。构思：${concept}`
          : `继续创作第 ${index + 1} 章，本章约 ${chapterWords} 字。${ratioText}\n章节标题统一为“第X章 + 标题”格式（如“第${index + 1}章 标题”）。\n书名：${title}\n简介：${outline}\n上一章摘要：${chapters[index - 1]?.summary || '暂无'}\n返回 JSON：{"chapter":{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}}。`,
        maxTokens: maxTokensForWords(chapterWords)
      }),
      (result) => result.chapter && result.chapter.content,
      1,
      options.signal
    );
    if (index === 0) {
      title = String(result.title || '').trim();
      outline = String(result.outline || '').trim();
    }
    chapters.push({
      title: ensureChapterTitle(index, result.chapter.title),
      content: String(result.chapter.content).trim(),
      summary: String(result.chapter.summary || '').trim()
    });
  }
  if (chapters.length === 0) throw new Error('模型未返回完整小说结构');
  return {
    title: title || '未命名小说',
    outline,
    chapters
  };
}

export async function createBookFromConcept(userId, concept, settings = {}) {
  const content = await generateBookContent(concept, settings);
  const now = new Date().toISOString();
  const book = normalizeBook({
    id: newId('b'),
    userId,
    status: 'ready',
    title: content.title,
    outline: content.outline,
    chapters: content.chapters.map((chapter, index) => ({
      id: nextChapterId({ id: newId('b') }),
      title: ensureChapterTitle(index, chapter.title),
      content: String(chapter.content || '').trim(),
      summary: String(chapter.summary || '').trim(),
      createdAt: now,
      updatedAt: now
    })),
    relations: { nodes: [], edges: [] },
    chat: [],
    draft: { concept, summary: concept },
    targetWords: settings.targetWords || 0,
    createdAt: now,
    updatedAt: now
  });
  book.storySummary = buildStorySummary(book.chapters);
  // 首章事件与概况走统一差分内核（O(首章数)，小输入），不再使用全量迁移函数
  await syncChapterOverview(
    book,
    book.chapters.map((chapter, index) => ({ chapterIndex: index, oldSummary: '', newSummary: chapter.summary }))
  ).catch((err) => console.error('[storyOverview] 新书概况初始化失败:', err.message));
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  books.push(book);
  writeJson(BOOKS_FILE, books);
  return book;
}

export async function finalizeDraftBook(book, settings = {}) {
  const content = await generateBookContent(book.draft.summary || book.draft.concept, {
    ...settings,
    targetWords: book.draft.targetWords || book.targetWords || 0
  });
  const now = new Date().toISOString();
  book.title = content.title;
  book.outline = content.outline;
  book.chapters = content.chapters.map((chapter, index) => ({
    id: nextChapterId(book),
    title: ensureChapterTitle(index, chapter.title),
    content: String(chapter.content || '').trim(),
    summary: String(chapter.summary || '').trim(),
    createdAt: now,
    updatedAt: now
  }));
  book.storySummary = buildStorySummary(book.chapters);
  await syncChapterOverview(
    book,
    book.chapters.map((chapter, index) => ({ chapterIndex: index, oldSummary: '', newSummary: chapter.summary }))
  ).catch((err) => console.error('[storyOverview] 新书概况初始化失败:', err.message));
  book.status = 'ready';
  book.targetWords = book.draft.targetWords || book.targetWords || 0;
  book.updatedAt = now;
  return book;
}

export async function continueBook(book, instruction, settings = {}) {
  const chaptersPerOutput = clampOutput(settings.chaptersPerOutput, 1, 5, 1);
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const targetWords = Number(book.targetWords) || 0;
  const now = new Date().toISOString();
  const startCount = book.chapters.length;
  const added = [];
  let currentWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
  try {
    for (let index = 0; index < chaptersPerOutput; index += 1) {
      const last = book.chapters[book.chapters.length - 1];
      const batchWords = (index + 1) * chapterWords;
      const remaining = targetWords > 0 ? Math.max(0, targetWords - currentWords) : 0;
      const ratioText = targetWords > 0
        ? `本次续写约 ${batchWords} 字（含本次已生成章节），占全书目标 ${targetWords} 字的 ${Math.round((batchWords / targetWords) * 100)}%` +
          (remaining > 0 ? `，约占剩余篇幅 ${Math.round((batchWords / remaining) * 100)}%` : '') +
          '。请按此比例推进剧情，既不要仓促完结，也不要拖沓。'
        : '请按本次输出规模稳步推进剧情。';
      const context = [
        `全书摘要：${book.storySummary || '暂无'}`,
        last ? `最近章节摘要：${last.summary || `${last.title}\n${last.content.slice(0, 500)}`}` : '',
        `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`,
        targetWords > 0 ? `全书目标约 ${targetWords} 字，当前已写约 ${currentWords} 字。` : ''
      ].filter(Boolean).join('\n');
      const result = await callModel(
        () => ({
          system: '你是小说续写助手。始终只返回 JSON，不要包含 Markdown。',
          user: `根据全书摘要和关系网续写下一章（第 ${book.chapters.length + 1} 章），本章约 ${chapterWords} 字。${ratioText}\n章节标题统一为“第X章 + 标题”格式（如“第${book.chapters.length + 1}章 标题”）。\n返回 JSON：{"chapter":{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}}。用户指令：${instruction}\n${context}`,
          maxTokens: maxTokensForWords(chapterWords)
        }),
        (result) => result.chapter && result.chapter.content,
        1,
        settings.signal
      );
      const newChapter = {
        id: nextChapterId(book),
        title: ensureChapterTitle(book.chapters.length, result.chapter.title),
        content: String(result.chapter.content).trim(),
        summary: String(result.chapter.summary || '').trim(),
        createdAt: now,
        updatedAt: now
      };
      book.chapters.push(newChapter);
      added.push(newChapter);
      currentWords += newChapter.content.length;
    }
  } catch (err) {
    book.chapters = book.chapters.slice(0, startCount);
    throw err;
  }
  book.updatedAt = now;
  await syncChapterOverview(book, added.map((chapter, i) => ({ chapterIndex: startCount + i, newSummary: chapter.summary })))
    .catch((err) => console.error('[storyOverview] 续写概况更新失败:', err.message));
  return book;
}

export async function rewriteChapter(book, chapterIndex, instruction, settings = {}) {
  const target = book.chapters[chapterIndex];
  if (!target) throw new Error('章节不存在');
  const oldSummary = target.summary || '';
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const prev = chapterIndex > 0 ? book.chapters[chapterIndex - 1] : null;
  const next = chapterIndex < book.chapters.length - 1 ? book.chapters[chapterIndex + 1] : null;
  const context = [
    `上一章摘要：${prev?.summary || '无'}`,
    prev ? `上一章结尾（节选）：${prev.content.slice(-400)}` : '',
    `下一章摘要：${next?.summary || '无'}`,
    next ? `下一章开头（节选）：${next.content.slice(0, 400)}` : '',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
  ].filter(Boolean).join('\n');
  const result = await callModel(
    () => ({
      system: '你是小说改写助手。始终只返回 JSON，不要包含 Markdown。',
      user: `根据修改意见改写章节，本章约 ${chapterWords} 字。返回 JSON：{"title":"章节标题","content":"新内容","summary":"本章 80-150 字剧情摘要"}。原章节：\n${target.title}\n${target.content}\n修改意见：${instruction}\n全书摘要：${book.storySummary || '暂无'}\n附近章节语境：\n${context}`,
      maxTokens: maxTokensForWords(chapterWords)
    }),
    (result) => result.content,
    1,
    settings.signal
  );
  target.title = String(result.title || target.title).trim();
  target.content = String(result.content || target.content).trim();
  target.summary = String(result.summary || target.summary || '').trim();
  target.updatedAt = new Date().toISOString();
  book.updatedAt = target.updatedAt;
  await syncChapterOverview(book, [{ chapterIndex, oldSummary, newSummary: target.summary }])
    .catch((err) => console.error('[storyOverview] 改写概况更新失败:', err.message));
  return book;
}

export async function regenerateChapterSummary(book, chapterId) {
  const chapter = book.chapters.find((item) => item.id === chapterId);
  if (!chapter) throw new Error('章节不存在');
  const oldSummary = chapter.summary || '';
  const result = await chatCompletion({
    system: '你是小说章节摘要维护助手。只返回 JSON，不要包含 Markdown。',
    user: `章节标题：${chapter.title}\n章节内容：${chapter.content}\n原有摘要：${oldSummary || '无'}\n\n请生成新的 80-150 字章节摘要，并对比原摘要给出最小化差异说明，返回 JSON：{"summary":"新摘要","diff":"与原摘要的关键差异"}`,
    temperature: 0.4,
    maxTokens: 4096
  });
  chapter.summary = String(result.summary || oldSummary || '').trim();
  await syncChapterOverview(book, [{ chapterIndex: book.chapters.indexOf(chapter), oldSummary, newSummary: chapter.summary }])
    .catch((err) => console.error('[storyOverview] 章节摘要概况更新失败:', err.message));
  return book;
}

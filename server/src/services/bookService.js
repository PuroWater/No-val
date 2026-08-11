import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { newId, normalizeBook } from '../lib/bookUtils.js';
import { ensureChapterTitle } from '../lib/chapterUtils.js';
import { chatCompletion } from './deepseek.js';

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
  return Math.min(8192, Math.max(3000, Math.round(Number(chapterWords) * 2.2)));
}

async function callModel(makeOptions, validate, retries = 1, signal) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await chatCompletion({ ...makeOptions(attempt), signal });
      if (!validate || validate(result)) return result;
      lastError = new Error('模型返回内容不符合要求');
    } catch (err) {
      lastError = err;
      if (/中断|超时/.test(err.message)) throw err;
    }
  }
  throw lastError;
}

function nextChapterId(book) {
  return `c_${book.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function chapterContext(book) {
  const summaries = book.chapters.map((chapter) => chapter.summary).filter(Boolean);
  if (summaries.length > 0) {
    return summaries.map((summary, index) => `第 ${index + 1} 章摘要：${summary}`).join('\n');
  }
  if (book.storySummary) return book.storySummary;
  return book.chapters.slice(0, 3).map((chapter) => `${chapter.title}\n${chapter.content}`).join('\n\n');
}

function buildStorySummary(chapters) {
  const summaries = chapters.map((chapter) => chapter.summary).filter(Boolean);
  return summaries.length > 0 ? summaries.join('\n') : '';
}

export function applyChapterEvents(book, changedIndexes, eventsByChapter, prose) {
  const indexes = new Set(changedIndexes.map(Number));
  book.chapters.forEach((chapter, index) => {
    if (!indexes.has(index)) return;
    const events = (eventsByChapter && eventsByChapter[index]) || [];
    chapter.events = events.map((item) => ({
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      event: String(item.event || '').trim(),
      characters: Array.isArray(item.characters) ? item.characters.map(String) : []
    }));
  });
  if (typeof prose === 'string' && prose.trim()) book.storySummary = prose.trim();
}

function chapterEventsText(book) {
  const lines = [];
  book.chapters.forEach((chapter, index) => {
    for (const item of chapter.events || []) {
      lines.push(`第${index + 1}章：${item.event}`);
    }
  });
  return lines.length > 0 ? lines.join('\n') : '暂无';
}

export async function ensureChapterEvents(book) {
  const missing = book.chapters.some((chapter) => (chapter.events || []).length === 0 && chapter.summary);
  if (!missing) return book;
  const summaries = book.chapters
    .map((chapter, index) => (chapter.summary ? `第${index + 1}章：${chapter.summary}` : ''))
    .filter(Boolean);
  if (summaries.length === 0) return book;
  const result = await callModel(
    () => ({
      system: '你是全书概况维护助手。根据各章摘要为每章生成结构化剧情事件。只返回 JSON，不要包含 Markdown。',
      user: `各章摘要：\n${summaries.join('\n')}\n\n返回 JSON：{"chapters":[{"chapterIndex":0,"events":[{"event":"事件","characters":["人物"]}]}]}，每章 1-3 条。`,
      temperature: 0.4,
      maxTokens: 1500
    }),
    (result) => Array.isArray(result?.chapters)
  );
  const byChapter = {};
  for (const item of result.chapters || []) {
    byChapter[Number(item.chapterIndex)] = item.events || [];
  }
  applyChapterEvents(book, book.chapters.map((_, index) => index), byChapter, '');
  return book;
}

export async function syncChapterOverview(book, changes = []) {
  const valid = changes.filter((change) => change && Number.isInteger(change.chapterIndex));
  if (valid.length === 0) return book;
  const desc = valid
    .map((change) => {
      const index = change.chapterIndex + 1;
      const action = !change.oldSummary ? '新增章节' : !change.newSummary ? '删除章节' : '改写章节';
      return `第${index}章（${action}）\n${change.oldSummary ? `旧摘要：${change.oldSummary}` : ''}\n${change.newSummary ? `新摘要：${change.newSummary}` : ''}`.trim();
    })
    .join('\n');
  const result = await callModel(
    () => ({
      system: '你是全书概况维护助手。根据章节变更返回该章结构化事件与更新后的精简全书概况。只返回 JSON，不要包含 Markdown。',
      user: `当前全书概况：\n${book.storySummary || '暂无'}\n\n当前章节事件：\n${chapterEventsText(book)}\n\n章节变更：\n${desc}\n\n返回 JSON：{"chapters":[{"chapterIndex":0,"events":[{"event":"事件","characters":["人物"]}]}],"prose":"更新后的精简全书概况"}。chapters 只包含本次变更的章节，删除章节时返回空 events。`,
      temperature: 0.4,
      maxTokens: 1200
    }),
    (result) => Array.isArray(result?.chapters) && typeof result.prose === 'string'
  );
  const deletedIndexes = new Set(
    valid.filter((change) => change.oldSummary && !change.newSummary).map((change) => change.chapterIndex)
  );
  const byChapter = {};
  for (const item of result.chapters || []) {
    const index = Number(item.chapterIndex);
    byChapter[index] = deletedIndexes.has(index) ? [] : item.events || [];
  }
  applyChapterEvents(book, valid.map((change) => change.chapterIndex), byChapter, result.prose);
  return book;
}

export async function rebuildOverview(book, instruction = '') {
  const summaries = book.chapters
    .map((chapter, index) => (chapter.summary ? `第${index + 1}章：${chapter.summary}` : ''))
    .filter(Boolean);
  if (summaries.length === 0) return book.storySummary || '';
  const result = await callModel(
    () => ({
      system: '你是全书概况维护助手。根据全部章节摘要重新压缩生成精简全书概况。只返回 JSON，不要包含 Markdown。',
      user: `各章摘要：\n${summaries.join('\n')}\n\n${instruction ? `要求：${instruction}\n` : ''}返回 JSON：{"prose":"更新后的精简全书概况"}。`,
      temperature: 0.4,
      maxTokens: 1200
    }),
    (result) => result && typeof result.prose === 'string' && result.prose.trim()
  );
  book.storySummary = result.prose.trim();
  return book.storySummary;
}

export function sanitizeRelations(result) {
  const seen = new Set();
  const nodes = (Array.isArray(result?.nodes) ? result.nodes : [])
    .filter((node) => node && typeof node.id === 'string' && node.id && typeof node.name === 'string')
    .filter((node) => {
      const key = String(node.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((node) => ({
      id: String(node.id),
      name: String(node.name),
      type: node.type === 'faction' ? 'faction' : 'person',
      weight: Number.isFinite(Number(node.weight)) ? Number(node.weight) : 1,
      isMain: Boolean(node.isMain)
    }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(result?.edges) ? result.edges : [])
    .filter((edge) => edge && nodeIds.has(String(edge.from)) && nodeIds.has(String(edge.to)))
    .map((edge) => ({
      from: String(edge.from),
      to: String(edge.to),
      label: String(edge.label || '')
    }));
  return { nodes, edges };
}

export async function extractRelations(book) {
  const text = chapterContext(book);
  const existing = book.relations?.nodes?.length
    ? JSON.stringify(book.relations)
    : '暂无';
  const result = await callModel(
    () => ({
      system: '你是小说关系网维护助手。根据剧情摘要和现有关系网更新关系，只返回 JSON，不要包含 Markdown。',
      user: `现有关系网：\n${existing}\n\n剧情摘要：\n${text}\n\n返回更新后的完整关系网 JSON：{"nodes":[{"id":"n_1","name":"名称","type":"person|faction","weight":5,"isMain":true}],"edges":[{"from":"n_1","to":"n_2","label":"关系"}]}。节点 id 必须唯一，边必须引用已有节点；weight 表示重要度 1-10，主角节点 isMain 为 true。`,
      maxTokens: 1500
    }),
    (result) => Array.isArray(result?.nodes)
  );
  return sanitizeRelations(result);
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
  await ensureChapterEvents(book).catch((err) => console.error('[storyOverview] 新书概况初始化失败:', err.message));
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
  await ensureChapterEvents(book).catch((err) => console.error('[storyOverview] 新书概况初始化失败:', err.message));
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
    maxTokens: 900
  });
  chapter.summary = String(result.summary || oldSummary || '').trim();
  await syncChapterOverview(book, [{ chapterIndex: book.chapters.indexOf(chapter), oldSummary, newSummary: chapter.summary }])
    .catch((err) => console.error('[storyOverview] 章节摘要概况更新失败:', err.message));
  return book;
}

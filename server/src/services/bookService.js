import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { newId, normalizeBook } from '../lib/bookUtils.js';
import { chatCompletion } from './deepseek.js';

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

async function updateStorySummary(book, newChapterSummary) {
  if (!newChapterSummary) return book.storySummary;
  if (!book.storySummary) {
    book.storySummary = newChapterSummary;
    return book.storySummary;
  }
  const result = await chatCompletion({
    system: '你是小说摘要维护助手。只返回 JSON，不要包含 Markdown。',
    user: `现有全书摘要：\n${book.storySummary}\n\n新增章节摘要：\n${newChapterSummary}\n\n合并为更精简的更新版全书摘要，返回 JSON：{"summary":"..."}`,
    temperature: 0.4,
    maxTokens: 900
  });
  book.storySummary = String(result.summary || book.storySummary).trim();
  return book.storySummary;
}

async function rebuildStorySummary(book) {
  const summaries = book.chapters.map((chapter) => chapter.summary).filter(Boolean);
  if (summaries.length <= 1) {
    book.storySummary = summaries.join('');
    return;
  }
  const result = await chatCompletion({
    system: '你是小说摘要压缩助手。只返回 JSON，不要包含 Markdown。',
    user: `根据以下各章摘要压缩为全书剧情摘要，返回 JSON：{"summary":"..."}\n${summaries.join('\n')}`,
    temperature: 0.4,
    maxTokens: 1200
  });
  book.storySummary = String(result.summary || summaries.join('\n')).trim();
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
  const result = await chatCompletion({
    system: '你是小说关系网维护助手。根据剧情摘要和现有关系网更新关系，只返回 JSON，不要包含 Markdown。',
    user: `现有关系网：\n${existing}\n\n剧情摘要：\n${text}\n\n返回更新后的完整关系网 JSON：{"nodes":[{"id":"n_1","name":"名称","type":"person|faction","weight":5,"isMain":true}],"edges":[{"from":"n_1","to":"n_2","label":"关系"}]}。节点 id 必须唯一，边必须引用已有节点；weight 表示重要度 1-10，主角节点 isMain 为 true。`,
    maxTokens: 1500
  });
  return sanitizeRelations(result);
}

export async function generateBookContent(concept, options = {}) {
  const chaptersPerOutput = Math.min(5, Math.max(1, Number(options.chaptersPerOutput) || 3));
  const chapterWords = options.chapterWords || 2000;
  const targetWords = options.targetWords || 0;
  const batchWords = chaptersPerOutput * chapterWords;
  const ratioText = targetWords > 0
    ? `本次输出约 ${batchWords} 字，占全书目标 ${targetWords} 字的 ${Math.round((batchWords / targetWords) * 100)}%。请按此比例安排剧情发展，不要一口气写完整个故事。`
    : '请按本次输出规模安排剧情发展。';
  const result = await chatCompletion({
    system: '你是小说创作助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据构思创作一本小说，本次输出 ${chaptersPerOutput} 章，每章约 ${chapterWords} 字。${ratioText}\n返回 JSON：{"title":"书名","outline":"简介","chapters":[{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}]}。构思：${concept}`,
    maxTokens: Math.min(8192, chaptersPerOutput * 2800)
  });
  if (!result.title || !Array.isArray(result.chapters) || result.chapters.length === 0) {
    throw new Error('模型未返回完整小说结构');
  }
  return {
    title: String(result.title).trim(),
    outline: String(result.outline || '').trim(),
    chapters: result.chapters
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
      title: String(chapter.title || `第 ${index + 1} 章`).trim(),
      content: String(chapter.content || '').trim(),
      summary: String(chapter.summary || '').trim(),
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
    title: String(chapter.title || `第 ${index + 1} 章`).trim(),
    content: String(chapter.content || '').trim(),
    summary: String(chapter.summary || '').trim(),
    updatedAt: now
  }));
  book.storySummary = buildStorySummary(book.chapters);
  book.status = 'ready';
  book.targetWords = book.draft.targetWords || book.targetWords || 0;
  book.updatedAt = now;
  return book;
}

export async function continueBook(book, instruction, settings = {}) {
  const chaptersPerOutput = Math.min(5, Math.max(1, Number(settings.chaptersPerOutput) || 1));
  const last = book.chapters[book.chapters.length - 1];
  const chapterWords = settings.chapterWords || 2000;
  const targetWords = book.targetWords || 0;
  const currentWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
  const batchWords = chaptersPerOutput * chapterWords;
  const remaining = targetWords > 0 ? Math.max(0, targetWords - currentWords) : 0;
  const ratioText = targetWords > 0
    ? `本次续写 ${chaptersPerOutput} 章，约 ${batchWords} 字，占全书目标 ${targetWords} 字的 ${Math.round((batchWords / targetWords) * 100)}%` +
      (remaining > 0 ? `，约占剩余篇幅 ${Math.round((batchWords / remaining) * 100)}%` : '') +
      '。请按此比例推进剧情，既不要仓促完结，也不要拖沓。'
    : '请按本次输出规模稳步推进剧情。';
  const context = [
    `全书摘要：${book.storySummary || '暂无'}`,
    last ? `最近章节摘要：${last.summary || `${last.title}\n${last.content.slice(0, 500)}`}` : '',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`,
    targetWords > 0 ? `全书目标约 ${targetWords} 字，当前已写约 ${currentWords} 字。` : ''
  ].filter(Boolean).join('\n');
  const result = await chatCompletion({
    system: '你是小说续写助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据全书摘要和关系网续写下一批共 ${chaptersPerOutput} 章，每章约 ${chapterWords} 字。${ratioText}\n返回 JSON：{"chapters":[{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}]}。用户指令：${instruction}\n${context}`,
    maxTokens: Math.min(8192, chaptersPerOutput * 2800)
  });
  const candidates = Array.isArray(result.chapters)
    ? result.chapters
    : result.chapter ? [result.chapter] : [];
  const now = new Date().toISOString();
  const added = [];
  for (const chapter of candidates) {
    if (!chapter || !chapter.content) continue;
    const newChapter = {
      id: nextChapterId(book),
      title: String(chapter.title || `第 ${book.chapters.length + 1} 章`).trim(),
      content: String(chapter.content).trim(),
      summary: String(chapter.summary || '').trim(),
      updatedAt: now
    };
    book.chapters.push(newChapter);
    added.push(newChapter);
  }
  if (added.length === 0) throw new Error('模型未返回有效章节');
  book.updatedAt = now;
  await updateStorySummary(book, added.map((chapter) => chapter.summary).filter(Boolean).join('\n')).catch(() => {});
  return book;
}

export async function rewriteChapter(book, chapterIndex, instruction, settings = {}) {
  const target = book.chapters[chapterIndex];
  if (!target) throw new Error('章节不存在');
  const chapterWords = settings.chapterWords || 2000;
  const result = await chatCompletion({
    system: '你是小说改写助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据修改意见改写章节，本章约 ${chapterWords} 字。返回 JSON：{"title":"章节标题","content":"新内容","summary":"本章 80-150 字剧情摘要"}。原章节：\n${target.title}\n${target.content}\n修改意见：${instruction}\n全书摘要：${book.storySummary || '暂无'}`,
    maxTokens: 2600
  });
  target.title = String(result.title || target.title).trim();
  target.content = String(result.content || target.content).trim();
  target.summary = String(result.summary || target.summary || '').trim();
  target.updatedAt = new Date().toISOString();
  book.updatedAt = target.updatedAt;
  await rebuildStorySummary(book).catch(() => {});
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
  await updateStorySummary(book, chapter.summary).catch(() => {});
  return book;
}

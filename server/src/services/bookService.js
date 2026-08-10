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
      type: node.type === 'faction' ? 'faction' : 'person'
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
    user: `现有关系网：\n${existing}\n\n剧情摘要：\n${text}\n\n返回更新后的完整关系网 JSON：{"nodes":[{"id":"n_1","name":"名称","type":"person|faction"}],"edges":[{"from":"n_1","to":"n_2","label":"关系"}]}。节点 id 必须唯一，边必须引用已有节点。`,
    maxTokens: 1500
  });
  return sanitizeRelations(result);
}

export async function generateBookContent(concept) {
  const result = await chatCompletion({
    system: '你是小说创作助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据构思创作一本小说，返回 JSON：{"title":"书名","outline":"简介","chapters":[{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}]}。构思：${concept}`,
    maxTokens: 4500
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

export async function createBookFromConcept(userId, concept) {
  const content = await generateBookContent(concept);
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
    createdAt: now,
    updatedAt: now
  });
  book.storySummary = buildStorySummary(book.chapters);
  book.relations = await extractRelations(book).catch(() => ({ nodes: [], edges: [] }));
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  books.push(book);
  writeJson(BOOKS_FILE, books);
  return book;
}

export async function finalizeDraftBook(book) {
  const content = await generateBookContent(book.draft.summary || book.draft.concept);
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
  book.updatedAt = now;
  book.relations = await extractRelations(book).catch(() => ({ nodes: [], edges: [] }));
  return book;
}

export async function continueBook(book, instruction) {
  const last = book.chapters[book.chapters.length - 1];
  const context = [
    `全书摘要：${book.storySummary || '暂无'}`,
    last ? `最近章节摘要：${last.summary || `${last.title}\n${last.content.slice(0, 500)}`}` : '',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
  ].filter(Boolean).join('\n');
  const result = await chatCompletion({
    system: '你是小说续写助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据全书摘要和关系网续写下一章，返回 JSON：{"chapter":{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}}。用户指令：${instruction}\n${context}`,
    maxTokens: 2600
  });
  const chapter = result.chapter;
  if (!chapter || !chapter.content) throw new Error('模型未返回有效章节');
  const newChapter = {
    id: nextChapterId(book),
    title: String(chapter.title || `第 ${book.chapters.length + 1} 章`).trim(),
    content: String(chapter.content).trim(),
    summary: String(chapter.summary || '').trim(),
    updatedAt: new Date().toISOString()
  };
  book.chapters.push(newChapter);
  book.updatedAt = new Date().toISOString();
  await updateStorySummary(book, newChapter.summary).catch(() => {});
  book.relations = await extractRelations(book).catch(() => book.relations);
  return book;
}

export async function rewriteChapter(book, chapterIndex, instruction) {
  const target = book.chapters[chapterIndex];
  if (!target) throw new Error('章节不存在');
  const result = await chatCompletion({
    system: '你是小说改写助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据修改意见改写章节，返回 JSON：{"title":"章节标题","content":"新内容","summary":"本章 80-150 字剧情摘要"}。原章节：\n${target.title}\n${target.content}\n修改意见：${instruction}\n全书摘要：${book.storySummary || '暂无'}`,
    maxTokens: 2600
  });
  target.title = String(result.title || target.title).trim();
  target.content = String(result.content || target.content).trim();
  target.summary = String(result.summary || target.summary || '').trim();
  target.updatedAt = new Date().toISOString();
  book.updatedAt = target.updatedAt;
  await rebuildStorySummary(book).catch(() => {});
  book.relations = await extractRelations(book).catch(() => book.relations);
  return book;
}

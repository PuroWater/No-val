import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { chatCompletion } from './deepseek.js';

function nextChapterId(book) {
  return `c_${book.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function extractRelations(book) {
  const text = book.chapters.map((c) => `${c.title}\n${c.content}`).join('\n\n');
  const result = await chatCompletion({
    system: '你是小说关系网分析助手。始终只返回 JSON，不要包含 Markdown。',
    user: `分析以下小说内容中的人物与势力关系，返回 JSON：{"nodes":[{"id":"n_1","name":"名称","type":"person|faction"}],"edges":[{"from":"n_1","to":"n_2","label":"关系"}]}。要求节点 id 唯一，边引用已有节点 id。\n${text}`,
    maxTokens: 1200
  });
  return {
    nodes: Array.isArray(result.nodes) ? result.nodes : [],
    edges: Array.isArray(result.edges) ? result.edges : []
  };
}

export async function createBookFromConcept(userId, concept) {
  const result = await chatCompletion({
    system: '你是小说创作助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据构思创作一本小说，返回 JSON：{"title":"书名","outline":"简介","chapters":[{"title":"章节标题","content":"章节正文"}]}。构思：${concept}`,
    maxTokens: 4000
  });
  if (!result.title || !Array.isArray(result.chapters) || result.chapters.length === 0) {
    throw new Error('模型未返回完整小说结构');
  }
  const now = new Date().toISOString();
  const bookId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const book = {
    id: bookId,
    userId,
    title: String(result.title).trim(),
    outline: String(result.outline || '').trim(),
    chapters: result.chapters.map((chapter, index) => ({
      id: nextChapterId({ id: bookId }),
      title: String(chapter.title || `第 ${index + 1} 章`).trim(),
      content: String(chapter.content || '').trim(),
      updatedAt: now
    })),
    relations: { nodes: [], edges: [] },
    createdAt: now,
    updatedAt: now
  };
  book.relations = await extractRelations(book).catch(() => ({ nodes: [], edges: [] }));
  const books = readJson(BOOKS_FILE, []);
  books.push(book);
  writeJson(BOOKS_FILE, books);
  return book;
}

export async function continueBook(userId, bookId, instruction) {
  const books = readJson(BOOKS_FILE, []);
  const book = books.find((item) => item.id === bookId && item.userId === userId);
  if (!book) throw new Error('书籍不存在');
  const context = book.chapters.map((c) => `${c.title}\n${c.content}`).join('\n\n');
  const result = await chatCompletion({
    system: '你是小说续写助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据已有内容续写下一章，返回 JSON：{"chapter":{"title":"章节标题","content":"章节正文"}}。用户指令：${instruction}\n已有内容：\n${context}`,
    maxTokens: 2400
  });
  const chapter = result.chapter;
  if (!chapter || !chapter.content) throw new Error('模型未返回有效章节');
  book.chapters.push({
    id: nextChapterId(book),
    title: String(chapter.title || `第 ${book.chapters.length + 1} 章`).trim(),
    content: String(chapter.content).trim(),
    updatedAt: new Date().toISOString()
  });
  book.updatedAt = new Date().toISOString();
  book.relations = await extractRelations(book).catch(() => book.relations);
  writeJson(BOOKS_FILE, books);
  return book;
}

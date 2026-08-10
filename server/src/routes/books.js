import { Router } from 'express';
import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { normalizeBook } from '../lib/bookUtils.js';
import { requireAuth } from '../middleware/auth.js';
import { extractRelations, regenerateChapterSummary, updateBook } from '../services/bookService.js';

const router = Router();
router.use(requireAuth);

function summary(book) {
  return {
    id: book.id,
    title: book.title,
    status: book.status,
    chapterCount: book.chapters.length,
    deletedAt: book.deletedAt,
    updatedAt: book.updatedAt
  };
}

router.get('/', (req, res) => {
  const books = readJson(BOOKS_FILE, [])
    .map(normalizeBook)
    .filter((book) => book.userId === req.user.id && !book.deletedAt)
    .map(summary);
  res.json({ books });
});

router.get('/trash', (req, res) => {
  const books = readJson(BOOKS_FILE, [])
    .map(normalizeBook)
    .filter((book) => book.userId === req.user.id && book.deletedAt)
    .map(summary);
  res.json({ books });
});

router.get('/:id', (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id && !item.deletedAt);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  res.json({ book });
});

router.post('/:id/relations', async (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id && !item.deletedAt);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  if (book.chapters.length === 0) return res.status(400).json({ error: '构思尚未生成章节，暂无法提取关系网' });
  try {
    book.relations = await extractRelations(book);
    const saved = updateBook(req.user.id, book.id, (latest) => {
      latest.relations = book.relations;
      latest.updatedAt = new Date().toISOString();
    });
    return res.json({ book: saved });
  } catch (err) {
    return res.status(502).json({ error: `关系网生成失败：${err.message}` });
  }
});

router.post('/:id/chapters/:chapterId/summary', async (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id && !item.deletedAt);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  try {
    await regenerateChapterSummary(book, req.params.chapterId);
    const saved = updateBook(req.user.id, book.id, (latest) => {
      const chapter = latest.chapters.find((item) => item.id === req.params.chapterId);
      const stale = book.chapters.find((item) => item.id === req.params.chapterId);
      if (chapter && stale) {
        chapter.summary = stale.summary;
        chapter.updatedAt = stale.updatedAt;
      }
      latest.storySummary = book.storySummary;
      latest.updatedAt = new Date().toISOString();
    });
    return res.json({ book: saved });
  } catch (err) {
    return res.status(502).json({ error: `章节摘要更新失败：${err.message}` });
  }
});

router.delete('/:id/permanent', (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const index = books.findIndex((item) => item.id === req.params.id && item.userId === req.user.id && item.deletedAt);
  if (index === -1) return res.status(404).json({ error: '回收站中没有该项目' });
  books.splice(index, 1);
  writeJson(BOOKS_FILE, books);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id && !item.deletedAt);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  book.deletedAt = new Date().toISOString();
  book.updatedAt = book.deletedAt;
  writeJson(BOOKS_FILE, books);
  res.json({ ok: true });
});

router.post('/:id/restore', (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id && item.deletedAt);
  if (!book) return res.status(404).json({ error: '回收站中没有该项目' });
  book.deletedAt = null;
  book.updatedAt = new Date().toISOString();
  writeJson(BOOKS_FILE, books);
  res.json({ book });
});

router.put('/:id/chapters/:chapterId', (req, res) => {
  const { title, content } = req.body || {};
  if (typeof title !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: '标题和内容必须是字符串' });
  }
  try {
    const book = updateBook(req.user.id, req.params.id, (latest) => {
      if (latest.deletedAt) throw new Error('书籍不存在');
      const chapter = latest.chapters.find((item) => item.id === req.params.chapterId);
      if (!chapter) throw new Error('章节不存在');
      chapter.title = title;
      chapter.content = content;
      chapter.updatedAt = new Date().toISOString();
      latest.updatedAt = chapter.updatedAt;
    });
    res.json({ book });
  } catch (err) {
    res.status(err.message === '书籍不存在' || err.message === '章节不存在' ? 404 : 400).json({ error: err.message });
  }
});

export default router;

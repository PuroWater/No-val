import { Router } from 'express';
import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { normalizeBook } from '../lib/bookUtils.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function summary(book) {
  return {
    id: book.id,
    title: book.title,
    status: book.status,
    chapterCount: book.chapters.length,
    updatedAt: book.updatedAt
  };
}

router.get('/', (req, res) => {
  const books = readJson(BOOKS_FILE, [])
    .map(normalizeBook)
    .filter((book) => book.userId === req.user.id)
    .map(summary);
  res.json({ books });
});

router.get('/:id', (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  res.json({ book });
});

router.put('/:id/chapters/:chapterId', (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  const chapter = book.chapters.find((item) => item.id === req.params.chapterId);
  if (!chapter) return res.status(404).json({ error: '章节不存在' });
  const { title, content } = req.body || {};
  if (typeof title !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: '标题和内容必须是字符串' });
  }
  chapter.title = title;
  chapter.content = content;
  chapter.updatedAt = new Date().toISOString();
  book.updatedAt = chapter.updatedAt;
  writeJson(BOOKS_FILE, books);
  res.json({ book });
});

export default router;

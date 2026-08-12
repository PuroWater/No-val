import { Router } from 'express';
import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { normalizeBook } from '../lib/bookUtils.js';
import { ensureChapterTitle } from '../lib/chapterUtils.js';
import { requireAuth } from '../middleware/auth.js';
import { deleteChapters, updateBook } from '../services/bookService.js';
import { maintainChapterMeta } from '../services/maintenanceService.js';
import { buildTimeline, extractRelations } from '../services/storyMetaService.js';
import { enqueueBookWrite } from '../lib/writeQueue.js';

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

router.post('/:id/relations', (req, res) => {
  // 慢写：关系网生成基于全章节读入，进书级队列串行，避免基于旧章节覆盖最新章节
  enqueueBookWrite(req.params.id, async () => {
    const books = readJson(BOOKS_FILE, []).map(normalizeBook);
    const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id && !item.deletedAt);
    if (!book) return res.status(404).json({ error: '书籍不存在' });
    if (book.chapters.length === 0) return res.status(400).json({ error: '构思尚未生成章节，暂无法提取关系网' });
    const mode = req.body?.mode;
    if (mode !== undefined && mode !== 'incremental' && mode !== 'full') {
      return res.status(400).json({ error: 'mode 只能是 incremental 或 full' });
    }
    try {
      book.relations = await extractRelations(book, { mode });
      const saved = updateBook(req.user.id, book.id, (latest) => {
        latest.relations = book.relations;
        latest.updatedAt = new Date().toISOString();
      });
      return res.json({ book: saved });
    } catch (err) {
      return res.status(502).json({ error: `关系网生成失败：${err.message}` });
    }
  }).catch((err) => res.status(502).json({ error: `关系网生成失败：${err.message}` }));
});

router.get('/:id/timeline', (req, res) => {
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id && !item.deletedAt);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  res.json({ timeline: buildTimeline(book) });
});

router.post('/:id/chapters/:chapterId/summary', (req, res) => {
  // 慢写：摘要/事件维护进书级队列，等当前聊天完成后基于最新内容计算，避免旧摘要覆盖新内容
  enqueueBookWrite(req.params.id, async () => {
    const books = readJson(BOOKS_FILE, []).map(normalizeBook);
    const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id && !item.deletedAt);
    if (!book) return res.status(404).json({ error: '书籍不存在' });
    try {
      const index = book.chapters.findIndex((item) => item.id === req.params.chapterId);
      if (index === -1) return res.status(404).json({ error: '章节不存在' });
      await maintainChapterMeta(book, { chapterIndex: index, mode: 'modify' });
      const saved = updateBook(req.user.id, book.id, (latest) => {
        const chapter = latest.chapters.find((item) => item.id === req.params.chapterId);
        const stale = book.chapters.find((item) => item.id === req.params.chapterId);
        if (chapter && stale) {
          chapter.summary = stale.summary;
          chapter.events = stale.events;
          chapter.updatedAt = stale.updatedAt;
        }
        latest.storySummary = book.storySummary;
        latest.pendingDeletes = book.pendingDeletes;
        latest.updatedAt = new Date().toISOString();
      });
      return res.json({ book: saved });
    } catch (err) {
      return res.status(502).json({ error: `章节摘要更新失败：${err.message}` });
    }
  }).catch((err) => res.status(502).json({ error: `章节摘要更新失败：${err.message}` }));
});

router.post('/:id/chapters', (req, res) => {
  const { title } = req.body || {};
  if (typeof title !== 'string' || !String(title).trim()) {
    return res.status(400).json({ error: '章节标题不能为空' });
  }
  try {
    const book = updateBook(req.user.id, req.params.id, (latest) => {
      if (latest.deletedAt) throw new Error('书籍不存在');
      const now = new Date().toISOString();
      const index = latest.chapters.length;
      latest.chapters.push({
        id: `c_${latest.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: ensureChapterTitle(index, title),
        content: '',
        summary: '',
        createdAt: now,
        updatedAt: now
      });
      latest.updatedAt = now;
    });
    return res.status(201).json({ book });
  } catch (err) {
    return res.status(err.message === '书籍不存在' ? 404 : 400).json({ error: err.message });
  }
});

router.delete('/:id/chapters/:chapterId', (req, res) => {
  // 慢写：删除会重排章节并写回整书，进书级队列串行，避免与 AI 写回互相覆盖
  enqueueBookWrite(req.params.id, async () => {
    try {
      const books = readJson(BOOKS_FILE, []).map(normalizeBook);
      const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id);
      if (!book || book.deletedAt) return res.status(404).json({ error: '书籍不存在' });
      const index = book.chapters.findIndex((item) => item.id === req.params.chapterId);
      if (index === -1) return res.status(404).json({ error: '章节不存在' });
      deleteChapters(book, { index });
      writeJson(BOOKS_FILE, books);
      return res.json({ book });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }).catch((err) => res.status(502).json({ error: err.message }));
});

router.delete('/:id/chapters', (req, res) => {
  // 慢写：批量删除写回整书，进书级队列串行，避免与 AI 写回互相覆盖
  enqueueBookWrite(req.params.id, async () => {
    const count = Number(req.body?.count);
    try {
      const books = readJson(BOOKS_FILE, []).map(normalizeBook);
      const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id);
      if (!book || book.deletedAt) return res.status(404).json({ error: '书籍不存在' });
      // 批量删除末尾章节：删除不维护概况（残留由下次改写或 refresh_chapter_meta 清理），请求秒回。
      await deleteChapters(book, { count });
      writeJson(BOOKS_FILE, books);
      return res.json({ book });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }).catch((err) => res.status(400).json({ error: err.message }));
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

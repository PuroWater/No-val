import { Router } from 'express';
import { getUserSettings } from '../services/settingsService.js';
import { readBookById, listBooks, saveBook, deleteBookFile } from '../lib/store.js';
import { ensureChapterTitle } from '../lib/chapterUtils.js';
import { requireAuth } from '../middleware/auth.js';
import { deleteChapters, updateBook } from '../services/bookService.js';
import { maintainChapterMeta } from '../services/maintenanceService.js';
import { buildDevelopmentLine } from '../services/storyMetaService.js';
import { enqueueBookWrite } from '../lib/writeQueue.js';
import { WRITING_STYLES } from '../lib/stylePresets.js';
import { parseCoverDataUrl, saveCover, deleteCoverByPath, MAX_COVER_BYTES } from '../lib/coverStore.js';

const router = Router();
router.use(requireAuth);

function summary(book) {
  return {
    id: book.id,
    title: book.title,
    status: book.status,
    chapterCount: book.chapters.length,
    deletedAt: book.deletedAt,
    updatedAt: book.updatedAt,
    version: book.version,
    sortOrder: book.sortOrder,
    cover: book.cover
  };
}

const STATUS_ORDER = { draft: 0, ready: 1 };
// 按 (status, sortOrder) 排序：构思中在前、已生成在后，各自按用户拖拽顺序；sortOrder 缺省按创建时间。
function byDisplayOrder(a, b) {
  const sa = STATUS_ORDER[a.status] ?? 9;
  const sb = STATUS_ORDER[b.status] ?? 9;
  if (sa !== sb) return sa - sb;
  const oa = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const ob = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return String(a.updatedAt || '').localeCompare(String(b.updatedAt || ''));
}

router.get('/', (req, res) => {
  const books = listBooks()
    .filter((book) => book.userId === req.user.id && !book.deletedAt)
    .map(summary)
    .sort(byDisplayOrder);
  res.json({ books });
});

// 0.9.7 拖拽排序：ids 为创作台展示的完整顺序（构思中在前、已生成在后），按位置写 sortOrder
router.put('/order', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
  if (ids.length === 0) return res.status(400).json({ error: '排序列表不能为空' });
  try {
    ids.forEach((id, index) => {
      const book = readBookById(id);
      if (!book || book.userId !== req.user.id || book.deletedAt) return;
      book.sortOrder = index;
      saveBook(book);
    });
    const books = listBooks()
      .filter((book) => book.userId === req.user.id && !book.deletedAt)
      .map(summary)
      .sort(byDisplayOrder);
    res.json({ books });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/trash', (req, res) => {
  const books = listBooks({ archived: true })
    .filter((book) => book.userId === req.user.id && book.deletedAt)
    .map(summary);
  res.json({ books });
});

router.get('/:id', (req, res) => {
  const book = readBookById(req.params.id);
  if (!book || book.userId !== req.user.id || book.deletedAt) {
    return res.status(404).json({ error: '书籍不存在' });
  }
  res.json({ book });
});

router.put('/:id/writing-style', (req, res) => {
  const { writingStyle, version } = req.body || {};
  if (!WRITING_STYLES.some((item) => item.id === writingStyle)) {
    return res.status(400).json({ error: '文笔风格不合法' });
  }
  try {
    const book = updateBook(req.user.id, req.params.id, (latest) => {
      if (latest.deletedAt) throw new Error('书籍不存在');
      // 乐观锁：与章节保存/回收站同一套快写语义
      if (Number.isInteger(version) && latest.version !== version) {
        throw new Error('内容已更新，请刷新后重试');
      }
      latest.writingStyle = writingStyle;
      latest.updatedAt = new Date().toISOString();
      latest.version = (latest.version || 0) + 1;
    });
    return res.json({ book });
  } catch (err) {
    const status = err.message === '内容已更新，请刷新后重试' ? 409
      : (err.message === '书籍不存在' ? 404 : 400);
    return res.status(status).json({ error: err.message });
  }
});

router.post('/:id/cover', (req, res) => {
  const parsed = parseCoverDataUrl(req.body?.image);
  if (!parsed) {
    return res.status(400).json({ error: '封面图片格式不支持，请上传 JPG/PNG/WebP/GIF' });
  }
  const size = Buffer.from(parsed.base64, 'base64').length;
  if (size <= 0 || size > MAX_COVER_BYTES) {
    return res.status(400).json({ error: '封面图片大小需在 5MB 以内' });
  }
  try {
    const book = updateBook(req.user.id, req.params.id, (latest) => {
      if (latest.deletedAt) throw new Error('书籍不存在');
      const cover = saveCover(latest.id, parsed);
      if (latest.cover) deleteCoverByPath(latest.cover);
      latest.cover = cover;
      latest.updatedAt = new Date().toISOString();
      latest.version = (latest.version || 0) + 1;
    });
    return res.json({ book });
  } catch (err) {
    const status = err.message === '书籍不存在' ? 404 : 400;
    return res.status(status).json({ error: err.message });
  }
});

const developmentLineHandler = (req, res) => {
  const book = readBookById(req.params.id);
  if (!book || book.userId !== req.user.id || book.deletedAt) {
    return res.status(404).json({ error: '书籍不存在' });
  }
  res.json({ developmentLine: buildDevelopmentLine(book) });
};

router.get('/:id/development-line', developmentLineHandler);

router.post('/:id/chapters/:chapterId/summary', (req, res) => {
  // 慢写：摘要/事件维护进书级队列，等当前聊天完成后基于最新内容计算，避免旧摘要覆盖新内容
  enqueueBookWrite(req.params.id, async () => {
    const book = readBookById(req.params.id);
    if (!book || book.userId !== req.user.id || book.deletedAt) {
      return res.status(404).json({ error: '书籍不存在' });
    }
    try {
      const index = book.chapters.findIndex((item) => item.id === req.params.chapterId);
      if (index === -1) return res.status(404).json({ error: '章节不存在' });
      await maintainChapterMeta(book, { chapterIndex: index, mode: 'modify', settings: getUserSettings(req.user.id) });
      const saved = updateBook(req.user.id, book.id, (latest) => {
        const chapter = latest.chapters.find((item) => item.id === req.params.chapterId);
        const stale = book.chapters.find((item) => item.id === req.params.chapterId);
        if (chapter && stale) {
          chapter.summary = stale.summary;
          chapter.events = stale.events;
          chapter.updatedAt = stale.updatedAt;
        }
        latest.updatedAt = new Date().toISOString();
      });
      return res.json({ book: saved });
    } catch (err) {
      return res.status(502).json({ error: `章节摘要更新失败：${err.message}` });
    }
  }).catch((err) => res.status(502).json({ error: `章节摘要更新失败：${err.message}` }));
});

router.post('/:id/chapters', (req, res) => {
  const { title, version } = req.body || {};
  if (typeof title !== 'string' || !String(title).trim()) {
    return res.status(400).json({ error: '章节标题不能为空' });
  }
  try {
    const book = updateBook(req.user.id, req.params.id, (latest) => {
      if (latest.deletedAt) throw new Error('书籍不存在');
      // 乐观锁：双标签页同时新建防重叠——携带 version 不一致时拒绝并提示刷新
      if (Number.isInteger(version) && latest.version !== version) {
        throw new Error('内容已更新，请刷新后重试');
      }
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
      latest.version = (latest.version || 0) + 1;
    });
    return res.status(201).json({ book });
  } catch (err) {
    const status = err.message === '内容已更新，请刷新后重试' ? 409
      : (err.message === '书籍不存在' ? 404 : 400);
    return res.status(status).json({ error: err.message });
  }
});

router.delete('/:id/chapters/:chapterId', (req, res) => {
  // 慢写：删除会重排章节并写回整书，进书级队列串行，避免与 AI 写回互相覆盖
  enqueueBookWrite(req.params.id, async () => {
    try {
      const book = readBookById(req.params.id);
      if (!book || book.userId !== req.user.id || book.deletedAt) return res.status(404).json({ error: '书籍不存在' });
      const index = book.chapters.findIndex((item) => item.id === req.params.chapterId);
      if (index === -1) return res.status(404).json({ error: '章节不存在' });
      deleteChapters(book, { index });
      saveBook(book);
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
      const book = readBookById(req.params.id);
      if (!book || book.userId !== req.user.id || book.deletedAt) return res.status(404).json({ error: '书籍不存在' });
      // 批量删除末尾章节：删除不维护概况（残留由下次改写或 refresh_chapter_meta 清理），请求秒回。
      await deleteChapters(book, { count });
      saveBook(book);
      return res.json({ book });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }).catch((err) => res.status(400).json({ error: err.message }));
});

router.delete('/:id/permanent', (req, res) => {
  const book = readBookById(req.params.id);
  if (!book || book.userId !== req.user.id || !book.deletedAt) {
    return res.status(404).json({ error: '回收站中没有该项目' });
  }
  const { version } = req.body || {};
  // 乐观锁：双标签页一个恢复一个彻底删除时拒绝
  if (Number.isInteger(version) && book.version !== version) {
    return res.status(409).json({ error: '内容已更新，请刷新后重试' });
  }
  deleteCoverByPath(book.cover);
  deleteBookFile(book.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const book = readBookById(req.params.id);
  if (!book || book.userId !== req.user.id || book.deletedAt) return res.status(404).json({ error: '书籍不存在' });
  const { version } = req.body || {};
  // 乐观锁：双标签页一边编辑一边删除时拒绝（防止基于旧状态的写操作）
  if (Number.isInteger(version) && book.version !== version) {
    return res.status(409).json({ error: '内容已更新，请刷新后重试' });
  }
  book.deletedAt = new Date().toISOString();
  book.updatedAt = book.deletedAt;
  book.version = (book.version || 0) + 1;
  saveBook(book);
  res.json({ ok: true });
});

router.post('/:id/restore', (req, res) => {
  const book = readBookById(req.params.id);
  if (!book || book.userId !== req.user.id || !book.deletedAt) {
    return res.status(404).json({ error: '回收站中没有该项目' });
  }
  const { version } = req.body || {};
  // 乐观锁：双标签页一个恢复一个彻底删除时拒绝
  if (Number.isInteger(version) && book.version !== version) {
    return res.status(409).json({ error: '内容已更新，请刷新后重试' });
  }
  book.deletedAt = null;
  book.updatedAt = new Date().toISOString();
  book.version = (book.version || 0) + 1;
  saveBook(book);
  res.json({ book });
});

router.put('/:id/chapters/:chapterId', (req, res) => {
  const { title, content, version } = req.body || {};
  if (typeof title !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: '标题和内容必须是字符串' });
  }
  try {
    const book = updateBook(req.user.id, req.params.id, (latest) => {
      if (latest.deletedAt) throw new Error('书籍不存在');
      const chapter = latest.chapters.find((item) => item.id === req.params.chapterId);
      if (!chapter) throw new Error('章节不存在');
      // 乐观锁：客户端携带 version 且与服务端不一致 → 冲突，提示刷新（仅快写路径，AI 写不改 version）
      if (Number.isInteger(version) && latest.version !== version) {
        throw new Error('内容已更新，请刷新后重试');
      }
      chapter.title = title;
      chapter.content = content;
      chapter.updatedAt = new Date().toISOString();
      latest.updatedAt = chapter.updatedAt;
      latest.version = (latest.version || 0) + 1;
    });
    res.json({ book });
  } catch (err) {
    const status = err.message === '内容已更新，请刷新后重试' ? 409
      : (err.message === '书籍不存在' || err.message === '章节不存在' ? 404 : 400);
    res.status(status).json({ error: err.message });
  }
});

export default router;

import { Router } from 'express';
import { readBookById, saveBook } from '../lib/store.js';
import { requireAuth } from '../middleware/auth.js';
import { createDraft, handleMessage, interruptProcessing } from '../services/chatService.js';
import { createBookFromConcept } from '../services/draftService.js';
import { continueBook } from '../services/bookService.js';
import { getUserSettings } from '../services/settingsService.js';
import { enqueueBookWrite } from '../lib/writeQueue.js';

const router = Router();
router.use(requireAuth);

router.post('/sessions', (req, res) => {
  const book = createDraft(req.user.id);
  res.status(201).json({ book });
});

router.post('/message', async (req, res) => {
  const { bookId, content } = req.body || {};
  if (!String(content || '').trim()) {
    return res.status(400).json({ error: '请输入内容' });
  }
  try {
    const settings = getUserSettings(req.user.id);
    // 慢写：同一本书的聊天消息进书级队列串行，避免与维护/关系网等写回互相覆盖
    const book = await enqueueBookWrite(bookId || `new:${req.user.id}`, () =>
      handleMessage(req.user.id, bookId || '', String(content).trim(), settings)
    );
    return res.status(bookId ? 200 : 201).json({ book });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

router.post('/abort', (req, res) => {
  const bookId = String(req.body?.bookId || '').trim();
  try {
    const result = interruptProcessing(req.user.id, bookId);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/create-book', async (req, res) => {
  const concept = String(req.body?.concept || '').trim();
  if (!concept) return res.status(400).json({ error: '请输入小说构思' });
  try {
    const settings = getUserSettings(req.user.id);
    const book = await createBookFromConcept(req.user.id, concept, settings);
    return res.status(201).json({ book });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

router.post('/continue', async (req, res) => {
  const { bookId, instruction } = req.body || {};
  if (!bookId || !String(instruction || '').trim()) {
    return res.status(400).json({ error: '请选择书籍并输入续写指令' });
  }
  try {
    const settings = getUserSettings(req.user.id);
    const book = readBookById(bookId);
    if (!book || book.userId !== req.user.id || book.deletedAt) {
      return res.status(404).json({ error: '书籍不存在' });
    }
    await continueBook(book, String(instruction).trim(), settings);
    saveBook(book);
    return res.json({ book });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

export default router;

import { Router } from 'express';
import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { normalizeBook } from '../lib/bookUtils.js';
import { requireAuth } from '../middleware/auth.js';
import { createDraft, handleMessage, interruptProcessing } from '../services/chatService.js';
import { createBookFromConcept, continueBook } from '../services/bookService.js';
import { getUserSettings } from '../services/settingsService.js';

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
    const book = await handleMessage(req.user.id, bookId || '', String(content).trim(), settings);
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
    const books = readJson(BOOKS_FILE, []).map(normalizeBook);
    const book = books.find((item) => item.id === bookId && item.userId === req.user.id);
    if (!book) return res.status(404).json({ error: '书籍不存在' });
    await continueBook(book, String(instruction).trim(), settings);
    writeJson(BOOKS_FILE, books);
    return res.json({ book });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

export default router;

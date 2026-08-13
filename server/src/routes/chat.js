import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createDraft, handleMessage, interruptProcessing, getJobProgress } from '../services/chatService.js';
import { getUserSettings } from '../services/settingsService.js';
import { enqueueBookWrite } from '../lib/writeQueue.js';

const router = Router();
router.use(requireAuth);

router.post('/sessions', (req, res) => {
  const book = createDraft(req.user.id);
  res.status(201).json({ book });
});

router.post('/message', async (req, res) => {
  const { bookId, content, messageId } = req.body || {};
  if (!String(content || '').trim()) {
    return res.status(400).json({ error: '请输入内容' });
  }
  try {
    const settings = getUserSettings(req.user.id);
    // 慢写：同一本书的聊天消息进书级队列串行，避免与维护/关系网等写回互相覆盖
    const book = await enqueueBookWrite(bookId || `new:${req.user.id}`, () =>
      handleMessage(req.user.id, bookId || '', String(content).trim(), settings, String(messageId || '').trim())
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

router.get('/progress', (req, res) => {
  const bookId = String(req.query.bookId || '').trim();
  res.json({ progress: getJobProgress(req.user.id, bookId) });
});

export default router;

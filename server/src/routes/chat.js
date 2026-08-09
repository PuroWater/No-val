import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createBookFromConcept, continueBook } from '../services/bookService.js';

const router = Router();
router.use(requireAuth);

router.post('/create-book', async (req, res) => {
  const concept = String(req.body?.concept || '').trim();
  if (!concept) return res.status(400).json({ error: '请输入小说构思' });
  try {
    const book = await createBookFromConcept(req.user.id, concept);
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
    const book = await continueBook(req.user.id, bookId, String(instruction).trim());
    return res.json({ book });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

export default router;

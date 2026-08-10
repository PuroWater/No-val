import { Router } from 'express';
import { readJson, writeJson, SETTINGS_FILE } from '../lib/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const THEMES = ['light', 'dark', 'paper'];
const FONT_SIZES = ['small', 'medium', 'large'];
const CHAPTER_RANGE = [1, 2, 3, 4, 5];

router.get('/', (req, res) => {
  const settings = readJson(SETTINGS_FILE, []);
  const current = settings.find((item) => item.userId === req.user.id) || {
    userId: req.user.id,
    theme: 'light',
    fontSize: 'medium',
    chaptersPerOutput: 3,
    chapterWords: 2000
  };
  res.json({ settings: current });
});

router.put('/', (req, res) => {
  const { theme, fontSize, chaptersPerOutput, chapterWords } = req.body || {};
  if (!THEMES.includes(theme) || !FONT_SIZES.includes(fontSize)) {
    return res.status(400).json({ error: '设置值不合法' });
  }
  const chapterCount = Number(chaptersPerOutput);
  const wordCount = Number(chapterWords);
  if (!CHAPTER_RANGE.includes(chapterCount)) {
    return res.status(400).json({ error: '每次输出章节数需为 1-5' });
  }
  if (!Number.isInteger(wordCount) || wordCount < 1000 || wordCount > 10000) {
    return res.status(400).json({ error: '每章字数需为 1000-10000' });
  }
  const settings = readJson(SETTINGS_FILE, []);
  let current = settings.find((item) => item.userId === req.user.id);
  if (!current) {
    current = { userId: req.user.id };
    settings.push(current);
  }
  current.theme = theme;
  current.fontSize = fontSize;
  current.chaptersPerOutput = chapterCount;
  current.chapterWords = wordCount;
  writeJson(SETTINGS_FILE, settings);
  res.json({ settings: current });
});

export default router;

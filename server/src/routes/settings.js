import { Router } from 'express';
import { readJson, writeJson, SETTINGS_FILE } from '../lib/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const THEMES = ['system', 'light', 'dark', 'green', 'paper'];
const FONT_SIZES = ['small', 'medium', 'large'];
const CHAPTER_RANGE = [1, 2, 3, 4, 5];

router.get('/', (req, res) => {
  const settings = readJson(SETTINGS_FILE, []);
  const current = settings.find((item) => item.userId === req.user.id) || {
    userId: req.user.id,
    theme: 'paper',
    fontSize: 'medium',
    chaptersPerOutput: 3,
    chapterWords: 2000,
    enterToSend: true,
    thinkingForWriting: false,
    developmentLineOrientation: 'vertical',
    reviewAfterWrite: false
  };
  res.json({ settings: current });
});

router.put('/', (req, res) => {
  const { theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, thinkingForWriting, developmentLineOrientation, timelineOrientation, reviewAfterWrite } = req.body || {};
  // 0.8.6 起字段改名 developmentLineOrientation，旧名 timelineOrientation 兼容
  const orientation = developmentLineOrientation ?? timelineOrientation;
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
  if (enterToSend !== undefined && typeof enterToSend !== 'boolean') {
    return res.status(400).json({ error: '发送快捷键设置不合法' });
  }
  if (reviewAfterWrite !== undefined && typeof reviewAfterWrite !== 'boolean') {
    return res.status(400).json({ error: '生成后审校设置不合法' });
  }
  if (thinkingForWriting !== undefined && typeof thinkingForWriting !== 'boolean') {
    return res.status(400).json({ error: '正文思考设置不合法' });
  }
  if (orientation !== undefined && orientation !== 'vertical' && orientation !== 'horizontal') {
    return res.status(400).json({ error: '发展线方向设置不合法' });
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
  if (enterToSend !== undefined) current.enterToSend = enterToSend;
  if (thinkingForWriting !== undefined) current.thinkingForWriting = thinkingForWriting;
  if (orientation !== undefined) current.developmentLineOrientation = orientation;
  if (reviewAfterWrite !== undefined) current.reviewAfterWrite = reviewAfterWrite;
  writeJson(SETTINGS_FILE, settings);
  res.json({ settings: current });
});

export default router;

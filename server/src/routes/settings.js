import { Router } from 'express';
import { readJson, writeJson, SETTINGS_FILE } from '../lib/store.js';
import { requireAuth } from '../middleware/auth.js';
import { defaultSettings } from '../lib/settingsDefaults.js';
import { getUserSettings } from '../services/settingsService.js';

const router = Router();
router.use(requireAuth);

const THEMES = ['system', 'light', 'dark', 'green', 'paper'];
const FONT_SIZES = ['small', 'medium', 'large'];
const CHAPTER_RANGE = [1, 2, 3, 4, 5];

router.get('/', (req, res) => {
  res.json({ settings: getUserSettings(req.user.id) });
});

router.put('/', (req, res) => {
  const { theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, thinkingEnabled, thinkingForWriting, developmentLineOrientation, reviewAfterWrite, confirmBeforeWrite } = req.body || {};
  // 0.9.0 统一思考开关：新字段 thinkingEnabled，兼容旧 thinkingForWriting
  const thinking = thinkingEnabled ?? thinkingForWriting;
  const orientation = developmentLineOrientation;
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
  if (confirmBeforeWrite !== undefined && typeof confirmBeforeWrite !== 'boolean') {
    return res.status(400).json({ error: '写前确认设置不合法' });
  }
  if (thinking !== undefined && typeof thinking !== 'boolean') {
    return res.status(400).json({ error: '模型思考设置不合法' });
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
  if (thinking !== undefined) current.thinkingEnabled = thinking;
  if (orientation !== undefined) current.developmentLineOrientation = orientation;
  if (reviewAfterWrite !== undefined) current.reviewAfterWrite = reviewAfterWrite;
  if (confirmBeforeWrite !== undefined) current.confirmBeforeWrite = confirmBeforeWrite;
  writeJson(SETTINGS_FILE, settings);
  res.json({ settings: current });
});

export default router;

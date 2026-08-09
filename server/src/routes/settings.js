import { Router } from 'express';
import { readJson, writeJson, SETTINGS_FILE } from '../lib/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const THEMES = ['light', 'dark', 'paper'];
const FONT_SIZES = ['small', 'medium', 'large'];

router.get('/', (req, res) => {
  const settings = readJson(SETTINGS_FILE, []);
  const current = settings.find((item) => item.userId === req.user.id) || {
    userId: req.user.id,
    theme: 'light',
    fontSize: 'medium'
  };
  res.json({ settings: current });
});

router.put('/', (req, res) => {
  const { theme, fontSize } = req.body || {};
  if (!THEMES.includes(theme) || !FONT_SIZES.includes(fontSize)) {
    return res.status(400).json({ error: '设置值不合法' });
  }
  const settings = readJson(SETTINGS_FILE, []);
  let current = settings.find((item) => item.userId === req.user.id);
  if (!current) {
    current = { userId: req.user.id };
    settings.push(current);
  }
  current.theme = theme;
  current.fontSize = fontSize;
  writeJson(SETTINGS_FILE, settings);
  res.json({ settings: current });
});

export default router;

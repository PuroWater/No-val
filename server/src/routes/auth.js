import { Router } from 'express';
import { readJson, writeJson, USERS_FILE } from '../lib/store.js';
import { hashPassword, verifyPassword } from '../lib/security.js';
import { signToken } from '../lib/token.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

function publicUser(user) {
  return { id: user.id, username: user.username };
}

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
    return res.status(400).json({ error: '用户名需为 3-20 位字母、数字或下划线' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  const users = readJson(USERS_FILE, []);
  if (users.some((user) => user.username === name)) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  const user = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username: name,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeJson(USERS_FILE, users);
  const token = signToken({ sub: user.id }, SECRET());
  return res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const users = readJson(USERS_FILE, []);
  const user = users.find((item) => item.username === String(username || '').trim());
  if (!user || !(await verifyPassword(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = signToken({ sub: user.id }, SECRET());
  return res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.put('/password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: '新密码至少 6 位' });
  }
  const users = readJson(USERS_FILE, []);
  const user = users.find((item) => item.id === req.user.id);
  if (!user || !(await verifyPassword(String(oldPassword || ''), user.passwordHash))) {
    return res.status(401).json({ error: '原密码错误' });
  }
  user.passwordHash = await hashPassword(newPassword);
  writeJson(USERS_FILE, users);
  return res.json({ ok: true });
});

export default router;

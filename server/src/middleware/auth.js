import { readJson, USERS_FILE } from '../lib/store.js';
import { verifyToken } from '../lib/token.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const payload = verifyToken(token, SECRET());
    const users = readJson(USERS_FILE, []);
    const user = users.find((item) => item.id === payload.sub);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    req.user = { id: user.id, username: user.username, nickname: user.nickname || user.username };
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

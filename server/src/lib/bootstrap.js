import fs from 'node:fs';
import { hashPassword } from './security.js';
import { readJson, writeJson, USERS_FILE, BOOKS_FILE, SETTINGS_FILE } from './store.js';
import { normalizeBook } from './bookUtils.js';

// 仅做确定性迁移：旧 book.timeline → chapter.events（normalizeBook 完成），有残留才落盘。
// 不再调用 AI 全量生成事件（该函数已删除；长书迁移需分块，属后续规划）。
async function migrateBooks() {
  if (!fs.existsSync(BOOKS_FILE)) return;
  const raw = readJson(BOOKS_FILE, []);
  const needsWrite = raw.some((book) => Array.isArray(book.timeline) && book.timeline.length > 0);
  if (!needsWrite) return;
  writeJson(BOOKS_FILE, raw.map(normalizeBook));
}

export async function ensureInitialData() {
  const users = readJson(USERS_FILE, []);
  if (!users.some((user) => user.username === 'admin')) {
    users.push({
      id: `u_${Date.now()}`,
      username: 'admin',
      passwordHash: await hashPassword('123456'),
      createdAt: new Date().toISOString()
    });
    writeJson(USERS_FILE, users);
  }
  if (!fs.existsSync(BOOKS_FILE)) writeJson(BOOKS_FILE, []);
  if (!fs.existsSync(SETTINGS_FILE)) writeJson(SETTINGS_FILE, []);
  await migrateBooks();
}

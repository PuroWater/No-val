import fs from 'node:fs';
import { hashPassword } from './security.js';
import {
  readJson,
  writeJson,
  USERS_FILE,
  SETTINGS_FILE,
  LEGACY_BOOKS_FILE,
  BOOKS_DIR,
  DRAFTS_DIR,
  saveBook
} from './store.js';
import { normalizeBook } from './bookUtils.js';

// 0.7.3 存储迁移：旧整表 books.json → 按 status 拆分到 books/ 与 drafts/（每本一个文件），
// 软删书（deletedAt 非空）落为 .archived.json；迁移成功后删除旧文件（含 .bak 备份）。
function migrateLegacyBooks() {
  if (!fs.existsSync(LEGACY_BOOKS_FILE)) return;
  const raw = readJson(LEGACY_BOOKS_FILE, []);
  fs.mkdirSync(BOOKS_DIR, { recursive: true });
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  for (const book of raw.map(normalizeBook)) {
    saveBook(book);
  }
  fs.rmSync(LEGACY_BOOKS_FILE, { force: true });
  fs.rmSync(`${LEGACY_BOOKS_FILE}.bak`, { force: true });
}

export async function ensureInitialData() {
  const users = readJson(USERS_FILE, []);
  if (!users.some((user) => user.username === 'admin')) {
    users.push({
      id: `u_${Date.now()}`,
      username: 'admin',
      nickname: 'admin',
      passwordHash: await hashPassword('123456'),
      createdAt: new Date().toISOString()
    });
    writeJson(USERS_FILE, users);
  }
  fs.mkdirSync(BOOKS_DIR, { recursive: true });
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  if (!fs.existsSync(SETTINGS_FILE)) writeJson(SETTINGS_FILE, []);
  migrateLegacyBooks();
}

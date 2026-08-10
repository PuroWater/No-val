import fs from 'node:fs';
import { hashPassword } from './security.js';
import { readJson, writeJson, USERS_FILE, BOOKS_FILE, SETTINGS_FILE } from './store.js';
import { normalizeBook } from './bookUtils.js';

function migrateBooks() {
  if (!fs.existsSync(BOOKS_FILE)) return;
  const raw = readJson(BOOKS_FILE, []);
  const needsMigration = raw.some(
    (book) => book && Array.isArray(book.chapters) && book.chapters.some((chapter) => !chapter.createdAt)
  );
  if (!needsMigration) return;
  const books = raw.map(normalizeBook);
  writeJson(BOOKS_FILE, books);
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
  migrateBooks();
}

import fs from 'node:fs';
import { hashPassword } from './security.js';
import { readJson, writeJson, USERS_FILE, BOOKS_FILE, SETTINGS_FILE } from './store.js';
import { normalizeBook } from './bookUtils.js';
import { ensureChapterEvents } from '../services/bookService.js';

async function migrateBooks() {
  if (!fs.existsSync(BOOKS_FILE)) return;
  const books = readJson(BOOKS_FILE, []).map(normalizeBook);
  let changed = false;
  for (const book of books) {
    if (book.chapters.length > 0 && book.chapters.some((chapter) => (chapter.events || []).length === 0 && chapter.summary)) {
      try {
        await ensureChapterEvents(book);
        changed = true;
      } catch (err) {
        console.error('[storyOverview] 旧书概况迁移失败:', book.id, err.message);
      }
    }
  }
  if (changed) writeJson(BOOKS_FILE, books);
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

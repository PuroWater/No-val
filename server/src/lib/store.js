import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { normalizeBook } from './bookUtils.js';

export const USERS_FILE = path.join(DATA_DIR, 'users.json');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json');
// 书级单文件存储：已生成图书与构思分目录，每本一个 <bookId>.json；软删归档为 <bookId>.archived.json
export const BOOKS_DIR = path.join(DATA_DIR, 'books');
export const DRAFTS_DIR = path.join(DATA_DIR, 'drafts');
// 旧版整表文件（0.7.2 及以前），仅迁移用
export const LEGACY_BOOKS_FILE = path.join(DATA_DIR, 'books.json');

export function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, `${file}.bak`);
    } catch {
      // 备份失败不阻塞主写入
    }
  }
  fs.renameSync(tmp, file);
}

// ---------- 书级存储 ----------

export function bookDir(status) {
  return status === 'draft' ? DRAFTS_DIR : BOOKS_DIR;
}

function bookFileName(bookId, archived = false) {
  return `${bookId}${archived ? '.archived' : ''}.json`;
}

function locateBookFile(bookId) {
  for (const dir of [BOOKS_DIR, DRAFTS_DIR]) {
    for (const archived of [false, true]) {
      const file = path.join(dir, bookFileName(bookId, archived));
      if (fs.existsSync(file)) return { dir, archived, file };
    }
  }
  return null;
}

export function readBookById(bookId) {
  const located = locateBookFile(bookId);
  if (!located) return null;
  return normalizeBook(readJson(located.file, null));
}

// 列出所有书（默认未归档；archived=true 时只列回收站里的 .archived.json 文件）
export function listBooks({ archived = false } = {}) {
  const result = [];
  for (const dir of [BOOKS_DIR, DRAFTS_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const isArchived = name.endsWith('.archived.json');
      const isPlain = name.endsWith('.json') && !name.includes('.archived');
      if (archived ? !isArchived : !isPlain) continue;
      const book = normalizeBook(readJson(path.join(dir, name), null));
      if (book) result.push(book);
    }
  }
  return result;
}

export function readAllBooks() {
  return listBooks();
}

// 保存单本书：自动处理软删归档/恢复（deletedAt 决定文件名后缀）与定稿移动（drafts ↔ books 目录）
export function saveBook(book) {
  const normalized = normalizeBook(book);
  const archived = Boolean(normalized.deletedAt);
  const dir = bookDir(normalized.status);
  const target = path.join(dir, bookFileName(normalized.id, archived));
  const located = locateBookFile(normalized.id);
  if (located && located.file !== target) {
    fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(located.file, target);
  }
  writeJson(target, normalized);
  return normalized;
}

// 彻底删除某本书的文件（回收站彻底删除用）
export function deleteBookFile(bookId) {
  const located = locateBookFile(bookId);
  if (!located) return false;
  fs.rmSync(located.file, { force: true });
  return true;
}

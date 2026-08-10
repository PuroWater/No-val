import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

export const USERS_FILE = path.join(DATA_DIR, 'users.json');
export const BOOKS_FILE = path.join(DATA_DIR, 'books.json');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

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

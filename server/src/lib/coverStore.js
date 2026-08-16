// 封面上传/读取（0.9.8）：封面以二进制文件存 data/covers/，书籍 JSON 只存静态路径。
// 图片通过 POST /api/books/:id/cover 上传（base64 data URL），前端 <img> 直接读 /covers/<file>。
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

export const COVERS_DIR = path.join(DATA_DIR, 'covers');

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export const MAX_COVER_BYTES = 5 * 1024 * 1024;

function ensureDir() {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

// 仅接受 data:image/(jpeg|png|webp|gif);base64,...
export function parseCoverDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { mime: 'image/' + match[1], base64: match[2] };
}

export function saveCover(bookId, { mime, base64 }) {
  ensureDir();
  const ext = MIME_EXT[mime] || 'jpg';
  const fileName = bookId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.writeFileSync(path.join(COVERS_DIR, fileName), Buffer.from(base64, 'base64'));
  return '/covers/' + fileName;
}

// 替换或彻底删除时清理旧封面；只允许删除 /covers/ 下的文件名，防路径穿越。
export function deleteCoverByPath(cover) {
  if (typeof cover !== 'string' || !cover.startsWith('/covers/')) return;
  const name = path.basename(cover);
  if (!name) return;
  const file = path.join(COVERS_DIR, name);
  if (path.dirname(file) !== COVERS_DIR) return;
  fs.rmSync(file, { force: true });
}

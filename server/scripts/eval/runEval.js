// golden 对话 eval 运行器：对运行中的后端（默认 http://localhost:3001）执行场景并断言。
// 需要：后端已启动、环境变量已配置真实模型 Key。用法：npm run eval
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLDEN_SCENARIOS, REAL_BOOK_ID } from './goldenScenarios.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const BASE = process.env.EVAL_BASE_URL || 'http://localhost:3001';

async function request(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const api = {
  async login() {
    const data = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: '123456' } });
    return data.token;
  },
  async createBookCopy(bookId, token, title) {
    const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/books', `${bookId}.json`), 'utf8'));
    const id = `b_golden_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const book = JSON.parse(JSON.stringify(src));
    book.id = id;
    book.title = title;
    book.chat = [];
    book.createdAt = new Date().toISOString();
    book.updatedAt = book.createdAt;
    book.chapters.forEach((c) => { c.updatedAt = book.createdAt; });
    await api.saveBookFile(book);
    return { bookId: id, book, before: book.chapters.length, token };
  },
  async saveBookFile(book) {
    fs.writeFileSync(path.join(ROOT, 'data/books', `${book.id}.json`), JSON.stringify(book, null, 2), 'utf8');
  },
  async sendMessage(bookId, content, token, messageId) {
    return request('/api/chat/message', { method: 'POST', body: { bookId, content, messageId }, token });
  },
  async cleanup(bookId, token) {
    try {
      await request(`/api/books/${bookId}`, { method: 'DELETE', token });
      await request(`/api/books/${bookId}/permanent`, { method: 'DELETE', token });
    } catch (e) {
      console.log('  [cleanup] 警告:', e.message);
    }
  }
};

async function main() {
  const token = await api.login();
  // eval 必须自控用户设置：强制关闭写前确认，结束恢复原值
  const settingsBefore = await request('/api/settings', { token });
  const baseSettings = {
    theme: settingsBefore.settings.theme,
    fontSize: settingsBefore.settings.fontSize,
    chaptersPerOutput: settingsBefore.settings.chaptersPerOutput,
    chapterWords: settingsBefore.settings.chapterWords,
    confirmBeforeWrite: false
  };
  await request('/api/settings', { method: 'PUT', body: baseSettings, token });
  console.log(`golden eval 开始，共 ${GOLDEN_SCENARIOS.length} 个场景（BASE=${BASE}）`);
  let failed = 0;
  for (const scenario of GOLDEN_SCENARIOS) {
    const ctx = await scenario.setup(api, token);
    console.log(`\n[场景] ${scenario.name} (${ctx.bookId})`);
    let ok = true;
    let detail = '';
    try {
      for (const step of scenario.steps) {
        const data = await api.sendMessage(ctx.bookId, step.content, token, step.messageId);
        const book = data.book;
        const lastMsg = book.chat[book.chat.length - 1];
        const result = step.assert ? step.assert(book, lastMsg, ctx) : { ok: true, detail: 'ok' };
        ok = result.ok;
        detail = result.detail;
        console.log(`  消息「${step.content}」 => ${ok ? 'PASS' : 'FAIL'} ${detail}`);
        if (!ok) break;
        step.record?.(book, ctx);
      }
    } catch (err) {
      ok = false;
      detail = err.message;
      console.log(`  执行异常 => FAIL ${detail}`);
    } finally {
      await api.cleanup(ctx.bookId, token);
    }
    if (!ok) failed += 1;
  }
  await request('/api/settings', { method: 'PUT', body: { ...baseSettings, confirmBeforeWrite: settingsBefore.settings.confirmBeforeWrite === true }, token });
  console.log(`\n${failed === 0 ? 'GOLDEN EVAL ALL PASS' : `GOLDEN EVAL FAILED (${failed}/${GOLDEN_SCENARIOS.length})`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('EVAL ERROR:', err);
  process.exit(1);
});

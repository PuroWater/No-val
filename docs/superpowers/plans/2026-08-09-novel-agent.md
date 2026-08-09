# Novel Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable local novel creation web app with React, Express, JSON persistence, and DeepSeek `deepseek-v4-flash` integration.

**Architecture:** A `client/` React SPA talks to a `server/` Express API over `/api`. The server owns authentication, JSON file persistence under `data/`, and all DeepSeek calls. The frontend never receives the API key.

**Tech Stack:** Node.js 18+, Express, React 18, Vite 5, React Router 6, bcryptjs, jsonwebtoken, Node built-in `node --test`, global `fetch`.

## Global Constraints

- Node.js must be 18 or newer; this machine has Node 24.
- Model is `deepseek-v4-flash`; configurable only through `DEEPSEEK_MODEL`.
- API Key comes from `DEEPSEEK_API_KEY` environment variable, never from JSON or frontend code.
- Data persists only under `data/*.json`; no database.
- Backend port `3001`; frontend dev port `5173`; Vite proxies `/api` to `http://localhost:3001`.
- Passwords are bcrypt-hashed; JWT uses `JWT_SECRET`.
- `.env`, `node_modules/`, `dist/`, and `data/*.json` must be gitignored.
- Test account: `admin / 123456`, seeded on first server start.
- On Windows PowerShell, invoke npm as `npm.cmd` because `npm.ps1` may be blocked by execution policy.

## File Structure

```text
Novel Agent/
├─ client/
│  ├─ index.html
│  ├─ package.json
│  ├─ vite.config.js
│  └─ src/
│     ├─ api.js
│     ├─ App.jsx
│     ├─ main.jsx
│     ├─ styles.css
│     ├─ auth/AuthContext.jsx
│     ├─ components/
│     │  ├─ BookList.jsx
│     │  ├─ ChapterEditor.jsx
│     │  ├─ ChatPanel.jsx
│     │  ├─ ProtectedRoute.jsx
│     │  ├─ RelationGraph.jsx
│     │  └─ Sidebar.jsx
│     └─ pages/
│        ├─ BookDetailPage.jsx
│        ├─ HomePage.jsx
│        ├─ LoginPage.jsx
│        ├─ MyPage.jsx
│        ├─ SettingsPage.jsx
│        └─ ShelfPage.jsx
├─ server/
│  ├─ package.json
│  ├─ src/
│  │  ├─ config.js
│  │  ├─ index.js
│  │  ├─ middleware/auth.js
│  │  ├─ lib/bootstrap.js
│  │  ├─ lib/security.js
│  │  ├─ lib/store.js
│  │  ├─ lib/token.js
│  │  ├─ routes/auth.js
│  │  ├─ routes/books.js
│  │  ├─ routes/chat.js
│  │  ├─ routes/settings.js
│  │  ├─ services/bookService.js
│  │  └─ services/deepseek.js
│  └─ test/
│     ├─ deepseek.test.js
│     ├─ security.test.js
│     ├─ store.test.js
│     └─ token.test.js
├─ data/                         # runtime-created, gitignored
├─ .env.example
├─ .gitignore
├─ README.md
├─ SUMMARY.md
└─ TARGET.md
```

---

### Task 1: Project Scaffold and Dependencies

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server/package.json`
- Create: `client/package.json`
- Create: `client/vite.config.js`
- Create: `client/index.html`

**Interfaces:**
- Produces: `server` scripts `dev`, `start`, `test`.
- Produces: `client` scripts `dev`, `build`, `preview`.
- Produces: Vite dev server on port 5173 with `/api` proxy.

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
dist/
.env
data/*.json
*.log
```

- [ ] **Step 2: Create `.env.example`**

```text
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
JWT_SECRET=change-me
PORT=3001
```

- [ ] **Step 3: Create `server/package.json`**

```json
{
  "name": "novel-agent-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  }
}
```

- [ ] **Step 4: Create `client/package.json`**

```json
{
  "name": "novel-agent-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.8"
  }
}
```

- [ ] **Step 5: Create `client/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
```

- [ ] **Step 6: Create `client/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Novel Agent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Install server dependencies**

Run in `server/`: `npm.cmd install`

Expected: `node_modules` created, exit code 0.

- [ ] **Step 8: Install client dependencies**

Run in `client/`: `npm.cmd install`

Expected: `node_modules` created, exit code 0.

---

### Task 2: Server Config, JSON Store, Security, and Token Modules

**Files:**
- Create: `server/src/config.js`
- Create: `server/src/lib/store.js`
- Create: `server/src/lib/security.js`
- Create: `server/src/lib/token.js`
- Create: `server/test/store.test.js`
- Create: `server/test/security.test.js`
- Create: `server/test/token.test.js`

**Interfaces:**
- `config.js` exports `ROOT_DIR`, `DATA_DIR`, `ENV_PATH`.
- `store.js` exports `readJson(file, fallback)`, `writeJson(file, data)`, `USERS_FILE`, `BOOKS_FILE`, `SETTINGS_FILE`.
- `security.js` exports `hashPassword(plain)`, `verifyPassword(plain, hash)`.
- `token.js` exports `signToken(payload, secret, expiresIn)`, `verifyToken(token, secret)`.

- [ ] **Step 1: Write the failing tests**

`server/test/store.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from '../src/lib/store.js';

test('writeJson then readJson round-trips data', () => {
  const file = path.join(os.tmpdir(), `store-${Date.now()}.json`);
  writeJson(file, { ok: true });
  assert.deepEqual(readJson(file, []), { ok: true });
  fs.rmSync(file, { force: true });
});

test('readJson returns fallback for missing file', () => {
  assert.deepEqual(readJson('missing-file.json', []), []);
});
```

`server/test/security.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/security.js';

test('password hash verifies correct password', async () => {
  const hash = await hashPassword('123456');
  assert.equal(await verifyPassword('123456', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});
```

`server/test/token.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../src/lib/token.js';

test('JWT round-trips payload', () => {
  const token = signToken({ sub: 'u_1' }, 'test-secret');
  const payload = verifyToken(token, 'test-secret');
  assert.equal(payload.sub, 'u_1');
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run in `server/`: `npm.cmd test`

Expected: errors about missing modules (`store.js`, `security.js`, `token.js`).

- [ ] **Step 3: Implement `server/src/config.js`**

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const ENV_PATH = path.join(ROOT_DIR, '.env');
```

- [ ] **Step 4: Implement `server/src/lib/store.js`**

```js
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
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
```

- [ ] **Step 5: Implement `server/src/lib/security.js`**

```js
import bcrypt from 'bcryptjs';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 6: Implement `server/src/lib/token.js`**

```js
import jwt from 'jsonwebtoken';

export function signToken(payload, secret, expiresIn = '7d') {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyToken(token, secret) {
  return jwt.verify(token, secret);
}
```

- [ ] **Step 7: Run tests and confirm they pass**

Run in `server/`: `npm.cmd test`

Expected: all three test files pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/config.js server/src/lib server/test
git commit -m "feat(server): add config, json store, security, and token modules"
```

---

### Task 3: Authentication Routes, Middleware, Bootstrap, and Server Entry

**Files:**
- Create: `server/src/lib/bootstrap.js`
- Create: `server/src/middleware/auth.js`
- Create: `server/src/routes/auth.js`
- Create: `server/src/index.js`

**Interfaces:**
- Consumes: `readJson`, `writeJson`, `USERS_FILE` from `store.js`; `hashPassword`, `verifyPassword`; `signToken`, `verifyToken`; `ENV_PATH`.
- Produces: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- Produces: `requireAuth` middleware that sets `req.user = { id, username }`.

- [ ] **Step 1: Implement `server/src/lib/bootstrap.js`**

```js
import fs from 'node:fs';
import { hashPassword } from './security.js';
import { readJson, writeJson, USERS_FILE, BOOKS_FILE, SETTINGS_FILE } from './store.js';

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
}
```

- [ ] **Step 2: Implement `server/src/middleware/auth.js`**

```js
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
    req.user = { id: user.id, username: user.username };
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}
```

- [ ] **Step 3: Implement `server/src/routes/auth.js`**

```js
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

export default router;
```

- [ ] **Step 4: Implement `server/src/index.js`**

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { ENV_PATH } from './config.js';
import { ensureInitialData } from './lib/bootstrap.js';
import authRouter from './routes/auth.js';
import booksRouter from './routes/books.js';
import chatRouter from './routes/chat.js';
import settingsRouter from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: ENV_PATH });

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/chat', chatRouter);
app.use('/api/settings', settingsRouter);

app.use((req, res) => res.status(404).json({ error: '接口不存在' }));

const port = Number(process.env.PORT || 3001);
await ensureInitialData();
app.listen(port, () => {
  console.log(`Novel Agent server listening on http://localhost:${port}`);
});
```

- [ ] **Step 5: Create empty route modules so the server imports**

Create `server/src/routes/books.js`, `server/src/routes/chat.js`, `server/src/routes/settings.js`, each exporting `Router()` with no routes for now.

- [ ] **Step 6: Run tests**

Run in `server/`: `npm.cmd test`

Expected: existing tests still pass.

- [ ] **Step 7: Smoke test login**

Start server in a background process, then run:

```powershell
$body = @{ username = 'admin'; password = '123456' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/auth/login -ContentType 'application/json' -Body $body
```

Expected: JSON containing `token` and `user.username = admin`.

- [ ] **Step 8: Commit**

```bash
git add server/src
git commit -m "feat(server): add auth routes, middleware, and bootstrap"
```

---

### Task 4: Book and Settings Routes

**Files:**
- Modify: `server/src/routes/books.js` (replace empty placeholder router)
- Modify: `server/src/routes/settings.js` (replace empty placeholder router)
- Modify: `server/src/index.js` (mounts already added in Task 3)

**Interfaces:**
- Consumes: `requireAuth`, `readJson`, `writeJson`, `BOOKS_FILE`, `SETTINGS_FILE`.
- Produces: `GET /api/books`, `GET /api/books/:id`, `PUT /api/books/:id/chapters/:chapterId`, `GET /api/settings`, `PUT /api/settings`.

- [ ] **Step 1: Implement `server/src/routes/books.js`**

```js
import { Router } from 'express';
import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function summary(book) {
  return {
    id: book.id,
    title: book.title,
    chapterCount: book.chapters.length,
    updatedAt: book.updatedAt
  };
}

router.get('/', (req, res) => {
  const books = readJson(BOOKS_FILE, [])
    .filter((book) => book.userId === req.user.id)
    .map(summary);
  res.json({ books });
});

router.get('/:id', (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  res.json({ book });
});

router.put('/:id/chapters/:chapterId', (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const book = books.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!book) return res.status(404).json({ error: '书籍不存在' });
  const chapter = book.chapters.find((item) => item.id === req.params.chapterId);
  if (!chapter) return res.status(404).json({ error: '章节不存在' });
  const { title, content } = req.body || {};
  if (typeof title !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: '标题和内容必须是字符串' });
  }
  chapter.title = title;
  chapter.content = content;
  chapter.updatedAt = new Date().toISOString();
  book.updatedAt = chapter.updatedAt;
  writeJson(BOOKS_FILE, books);
  res.json({ book });
});

export default router;
```

- [ ] **Step 2: Implement `server/src/routes/settings.js`**

```js
import { Router } from 'express';
import { readJson, writeJson, SETTINGS_FILE } from '../lib/store.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const THEMES = ['light', 'dark', 'paper'];
const FONT_SIZES = ['small', 'medium', 'large'];

router.get('/', (req, res) => {
  const settings = readJson(SETTINGS_FILE, []);
  const current = settings.find((item) => item.userId === req.user.id) || {
    userId: req.user.id,
    theme: 'light',
    fontSize: 'medium'
  };
  res.json({ settings: current });
});

router.put('/', (req, res) => {
  const { theme, fontSize } = req.body || {};
  if (!THEMES.includes(theme) || !FONT_SIZES.includes(fontSize)) {
    return res.status(400).json({ error: '设置值不合法' });
  }
  const settings = readJson(SETTINGS_FILE, []);
  let current = settings.find((item) => item.userId === req.user.id);
  if (!current) {
    current = { userId: req.user.id };
    settings.push(current);
  }
  current.theme = theme;
  current.fontSize = fontSize;
  writeJson(SETTINGS_FILE, settings);
  res.json({ settings: current });
});

export default router;
```

- [ ] **Step 3: Smoke test authenticated routes**

Login to get a token, then call `GET /api/settings` with `Authorization: Bearer <token>`.

Expected: JSON with default `theme = light`, `fontSize = medium`.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes
git commit -m "feat(server): add book and settings routes"
```

---

### Task 5: DeepSeek Service, Book Service, and Chat Routes

**Files:**
- Create: `server/src/services/deepseek.js`
- Create: `server/src/services/bookService.js`
- Create: `server/src/routes/chat.js`
- Create: `server/test/deepseek.test.js`
- Modify: `server/src/index.js` (chat router already mounted)

**Interfaces:**
- `deepseek.js` exports `chatCompletion({ system, user, temperature, maxTokens })` and `parseDeepSeekJson(text)`.
- `bookService.js` exports `createBookFromConcept(userId, concept)` and `continueBook(userId, bookId, instruction)`.
- Produces: `POST /api/chat/create-book`, `POST /api/chat/continue`.

- [ ] **Step 1: Write the failing JSON parsing test**

`server/test/deepseek.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepSeekJson } from '../src/services/deepseek.js';

test('parseDeepSeekJson strips markdown fences', () => {
  const text = '```json\n{"title":"测试"}\n```';
  assert.deepEqual(parseDeepSeekJson(text), { title: '测试' });
});

test('parseDeepSeekJson throws on invalid json', () => {
  assert.throws(() => parseDeepSeekJson('not json'));
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run in `server/`: `npm.cmd test`

Expected: `deepseek.js` module not found.

- [ ] **Step 3: Implement `server/src/services/deepseek.js`**

```js
export function parseDeepSeekJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型返回内容不是有效 JSON');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function chatCompletion({ system, user, temperature = 0.8, maxTokens = 2400 }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('未配置 DEEPSEEK_API_KEY，请在根目录 .env 中设置');
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' }
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`DeepSeek 调用失败 (${response.status}) ${detail}`.trim());
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 未返回内容');
  return parseDeepSeekJson(content);
}
```

- [ ] **Step 4: Run the parsing test**

Run in `server/`: `npm.cmd test`

Expected: both parsing tests pass.

- [ ] **Step 5: Implement `server/src/services/bookService.js`**

```js
import { readJson, writeJson, BOOKS_FILE } from '../lib/store.js';
import { chatCompletion } from './deepseek.js';

function nextChapterId(book) {
  return `c_${book.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function extractRelations(book) {
  const text = book.chapters.map((c) => `${c.title}\n${c.content}`).join('\n\n');
  const result = await chatCompletion({
    system: '你是小说关系网分析助手。始终只返回 JSON，不要包含 Markdown。',
    user: `分析以下小说内容中的人物与势力关系，返回 JSON：{"nodes":[{"id":"n_1","name":"名称","type":"person|faction"}],"edges":[{"from":"n_1","to":"n_2","label":"关系"}]}。要求节点 id 唯一，边引用已有节点 id。\n${text}`,
    maxTokens: 1200
  });
  return {
    nodes: Array.isArray(result.nodes) ? result.nodes : [],
    edges: Array.isArray(result.edges) ? result.edges : []
  };
}

export async function createBookFromConcept(userId, concept) {
  const result = await chatCompletion({
    system: '你是小说创作助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据构思创作一本小说，返回 JSON：{"title":"书名","outline":"简介","chapters":[{"title":"章节标题","content":"章节正文"}]}。构思：${concept}`,
    maxTokens: 4000
  });
  if (!result.title || !Array.isArray(result.chapters) || result.chapters.length === 0) {
    throw new Error('模型未返回完整小说结构');
  }
  const now = new Date().toISOString();
  const bookId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const book = {
    id: bookId,
    userId,
    title: String(result.title).trim(),
    outline: String(result.outline || '').trim(),
    chapters: result.chapters.map((chapter, index) => ({
      id: nextChapterId({ id: bookId }),
      title: String(chapter.title || `第 ${index + 1} 章`).trim(),
      content: String(chapter.content || '').trim(),
      updatedAt: now
    })),
    relations: { nodes: [], edges: [] },
    createdAt: now,
    updatedAt: now
  };
  book.relations = await extractRelations(book).catch(() => ({ nodes: [], edges: [] }));
  const books = readJson(BOOKS_FILE, []);
  books.push(book);
  writeJson(BOOKS_FILE, books);
  return book;
}

export async function continueBook(userId, bookId, instruction) {
  const books = readJson(BOOKS_FILE, []);
  const book = books.find((item) => item.id === bookId && item.userId === userId);
  if (!book) throw new Error('书籍不存在');
  const context = book.chapters.map((c) => `${c.title}\n${c.content}`).join('\n\n');
  const result = await chatCompletion({
    system: '你是小说续写助手。始终只返回 JSON，不要包含 Markdown。',
    user: `根据已有内容续写下一章，返回 JSON：{"chapter":{"title":"章节标题","content":"章节正文"}}。用户指令：${instruction}\n已有内容：\n${context}`,
    maxTokens: 2400
  });
  const chapter = result.chapter;
  if (!chapter || !chapter.content) throw new Error('模型未返回有效章节');
  book.chapters.push({
    id: nextChapterId(book),
    title: String(chapter.title || `第 ${book.chapters.length + 1} 章`).trim(),
    content: String(chapter.content).trim(),
    updatedAt: new Date().toISOString()
  });
  book.updatedAt = new Date().toISOString();
  book.relations = await extractRelations(book).catch(() => book.relations);
  writeJson(BOOKS_FILE, books);
  return book;
}
```

- [ ] **Step 6: Implement `server/src/routes/chat.js`**

```js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createBookFromConcept, continueBook } from '../services/bookService.js';

const router = Router();
router.use(requireAuth);

router.post('/create-book', async (req, res) => {
  const concept = String(req.body?.concept || '').trim();
  if (!concept) return res.status(400).json({ error: '请输入小说构思' });
  try {
    const book = await createBookFromConcept(req.user.id, concept);
    return res.status(201).json({ book });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

router.post('/continue', async (req, res) => {
  const { bookId, instruction } = req.body || {};
  if (!bookId || !String(instruction || '').trim()) {
    return res.status(400).json({ error: '请选择书籍并输入续写指令' });
  }
  try {
    const book = await continueBook(req.user.id, bookId, String(instruction).trim());
    return res.json({ book });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 7: Run all server tests**

Run in `server/`: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/services server/src/routes/chat.js server/test/deepseek.test.js
git commit -m "feat(server): add deepseek and chat routes"
```

---

### Task 6: Frontend Shell, Auth Context, API Client, and Base Styles

**Files:**
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`
- Create: `client/src/api.js`
- Create: `client/src/auth/AuthContext.jsx`
- Create: `client/src/components/ProtectedRoute.jsx`
- Create: `client/src/styles.css`
- Create: minimal placeholder versions of the six page files listed in the file structure.

**Interfaces:**
- `api.js` exports `api(path, options)`, `getToken`, `setToken`, `clearToken`.
- `AuthContext` exports `AuthProvider` and `useAuth()` with `{ user, login, register, logout }`.
- `App.jsx` defines routes: `/login`, `/`, `/create`, `/continue`, `/my`, `/shelf`, `/settings`, `/books/:id`.

- [ ] **Step 1: Implement `client/src/api.js`**

```js
const TOKEN_KEY = 'novel_token';
const USER_KEY = 'novel_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function setStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('登录已过期');
  }
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
```

- [ ] **Step 2: Implement `client/src/auth/AuthContext.jsx`**

```jsx
import { createContext, useContext, useState } from 'react';
import { api, setToken, setStoredUser, clearAuth } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('novel_user'));
    } catch {
      return null;
    }
  });

  async function login(username, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(data.token);
    setStoredUser(data.user);
    setUser(data.user);
  }

  async function register(username, password) {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(data.token);
    setStoredUser(data.user);
    setUser(data.user);
  }

  function logout() {
    clearAuth();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 3: Implement `client/src/components/ProtectedRoute.jsx`**

```jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function ProtectedRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 4: Implement `client/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 5: Implement `client/src/App.jsx` with placeholder pages**

```jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MyPage from './pages/MyPage.jsx';
import ShelfPage from './pages/ShelfPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import BookDetailPage from './pages/BookDetailPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<HomePage />}>
          <Route path="/" element={<Navigate to="/create" replace />} />
          <Route path="/create" element={<div className="placeholder">创作</div>} />
          <Route path="/continue" element={<div className="placeholder">续写</div>} />
          <Route path="/my" element={<MyPage />} />
          <Route path="/books/:id" element={<BookDetailPage />} />
          <Route path="/shelf" element={<ShelfPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
```

Placeholder `MyPage`, `ShelfPage`, `SettingsPage`, `BookDetailPage` each return a simple `<div className="placeholder">页面名</div>`. `HomePage` returns `<Outlet />` for now.

- [ ] **Step 6: Add base `client/src/styles.css`**

```css
:root {
  color-scheme: light;
  --bg: #f5f6f8;
  --panel: #ffffff;
  --text: #1f2328;
  --muted: #6b7280;
  --accent: #2f6fed;
  --border: #d9dee7;
}

[data-theme='dark'] {
  color-scheme: dark;
  --bg: #15181d;
  --panel: #20242b;
  --text: #e8eaed;
  --muted: #9aa3af;
  --accent: #6ea8ff;
  --border: #353b45;
}

[data-theme='paper'] {
  --bg: #f3ead8;
  --panel: #fffaf0;
  --text: #3b3226;
  --muted: #7a6f5e;
  --accent: #8a6d3b;
  --border: #ddd0b8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, 'Segoe UI', sans-serif;
}

button, input, textarea, select {
  font: inherit;
}

.placeholder {
  padding: 40px;
  color: var(--muted);
}
```

- [ ] **Step 7: Verify client builds**

Run in `client/`: `npm.cmd run build`

Expected: Vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git add client/src
git commit -m "feat(client): add shell, auth context, api client, and styles"
```

---

### Task 7: Login and Register Page

**Files:**
- Create: `client/src/pages/LoginPage.jsx`
- Modify: `client/src/styles.css` (login styles)

**Interfaces:**
- Consumes: `useAuth().login`, `useAuth().register`.
- Produces: `/login` page with mode switch.

- [ ] **Step 1: Implement `client/src/pages/LoginPage.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      navigate('/create');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Novel Agent</h1>
        <p className="login-subtitle">小说创作平台</p>
        <div className="mode-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>登录</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>注册</button>
        </div>
        <label>用户名
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>密码
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={loading}>{loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Add login styles**

Add centered card layout, `.mode-tabs`, `.primary`, `.form-error`, `.login-page` to `styles.css`.

- [ ] **Step 3: Build and smoke test**

Run in `client/`: `npm.cmd run build`

Expected: build passes.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/LoginPage.jsx client/src/styles.css
git commit -m "feat(client): add login and register page"
```

---

### Task 8: Home Shell, Sidebar, and Chat Panel

**Files:**
- Create: `client/src/pages/HomePage.jsx`
- Create: `client/src/components/Sidebar.jsx`
- Create: `client/src/components/ChatPanel.jsx`
- Modify: `client/src/App.jsx` (replace placeholders for `/create` and `/continue`)
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: `api('/books')`, `api('/chat/create-book')`, `api('/chat/continue')`.
- Produces: `<ChatPanel mode="create" />` and `<ChatPanel mode="continue" />`.

- [ ] **Step 1: Implement `client/src/components/Sidebar.jsx`**

```jsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Novel Agent</div>
      <nav>
        <NavLink to="/create">创作</NavLink>
        <NavLink to="/continue">续写</NavLink>
        <NavLink to="/shelf">书架</NavLink>
        <NavLink to="/my">我的</NavLink>
      </nav>
      <div className="sidebar-user">
        <span>{user?.username}</span>
        <button onClick={() => { logout(); navigate('/login'); }}>退出</button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Implement `client/src/pages/HomePage.jsx`**

```jsx
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';

export default function HomePage() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Implement `client/src/components/ChatPanel.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const SUGGESTIONS = ['今天有什么想法', '来聊聊吧！'];

export default function ChatPanel({ mode }) {
  const [input, setInput] = useState('');
  const [bookId, setBookId] = useState('');
  const [books, setBooks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'continue') {
      api('/books').then((data) => setBooks(data.books)).catch((err) => setError(err.message));
    }
  }, [mode]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    setError('');
    setLoading(true);
    const question = input.trim();
    setMessages((list) => [...list, { role: 'user', text: question }]);
    setInput('');
    try {
      const payload = mode === 'create'
        ? { concept: question }
        : { bookId, instruction: question };
      const data = await api(mode === 'create' ? '/chat/create-book' : '/chat/continue', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const text = mode === 'create'
        ? `已创建《${data.book.title}》，共 ${data.book.chapters.length} 章。`
        : `已续写《${data.book.title}》下一章。`;
      setMessages((list) => [...list, { role: 'agent', text }]);
      navigate('/my');
    } catch (err) {
      setMessages((list) => [...list, { role: 'agent', text: `失败：${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        {mode === 'create' ? '创作新书' : '续写章节'}
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            {SUGGESTIONS.map((text) => (
              <button key={text} onClick={() => setInput(text)}>{text}</button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`chat-message ${message.role}`}>{message.text}</div>
        ))}
        {loading && <div className="chat-message agent">正在创作，请稍候…</div>}
        {error && <div className="chat-message agent">失败：{error}</div>}
      </div>
      {mode === 'continue' && (
        <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">选择一本书</option>
          {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
        </select>
      )}
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'create' ? '输入一本小说的构思…' : '输入续写指令…'}
        />
        <button className="primary" onClick={handleSend} disabled={loading || (mode === 'continue' && !bookId)}>发送</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `client/src/App.jsx`**

Replace the `/create` and `/continue` placeholder elements with `<ChatPanel mode="create" />` and `<ChatPanel mode="continue" />`, importing `ChatPanel`.

- [ ] **Step 5: Add shell and chat styles**

Add `.app-shell`, `.sidebar`, `.app-main`, `.chat-panel`, `.chat-messages`, `.chat-message`, `.chat-input`, `.chat-empty` to `styles.css`.

- [ ] **Step 6: Build**

Run in `client/`: `npm.cmd run build`

Expected: build passes.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/HomePage.jsx client/src/components/Sidebar.jsx client/src/components/ChatPanel.jsx client/src/App.jsx client/src/styles.css
git commit -m "feat(client): add home shell, sidebar, and chat panel"
```

---

### Task 9: My Books, Book Detail, Chapter Editor, and Autosave

**Files:**
- Create: `client/src/pages/MyPage.jsx`
- Create: `client/src/pages/BookDetailPage.jsx`
- Create: `client/src/components/BookList.jsx`
- Create: `client/src/components/ChapterEditor.jsx`
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: `api('/books')`, `api('/books/:id')`, `api('/books/:id/chapters/:chapterId', PUT)`.
- Produces: `/my` book list, `/books/:id` detail page with 内容 / 关系网 tabs.

- [ ] **Step 1: Implement `client/src/components/BookList.jsx`**

```jsx
import { Link } from 'react-router-dom';

export default function BookList({ books }) {
  if (books.length === 0) return <p className="muted">还没有创作过的书，去“创作”开始吧。</p>;
  return (
    <div className="book-grid">
      {books.map((book) => (
        <Link key={book.id} className="book-card" to={`/books/${book.id}`}>
          <strong>{book.title}</strong>
          <span>{book.chapterCount} 章</span>
          <span className="muted">更新于 {new Date(book.updatedAt).toLocaleString()}</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement `client/src/pages/MyPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import BookList from '../components/BookList.jsx';

export default function MyPage() {
  const [books, setBooks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/books').then((data) => setBooks(data.books)).catch((err) => setError(err.message));
  }, []);

  return (
    <section className="page">
      <div className="page-head">
        <h2>我的</h2>
        <Link to="/settings" className="link-button">设置</Link>
      </div>
      {error && <p className="form-error">{error}</p>}
      <BookList books={books} />
    </section>
  );
}
```

- [ ] **Step 3: Implement `client/src/components/ChapterEditor.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';

export default function ChapterEditor({ chapter, onSave }) {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const [saving, setSaving] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await onSave({ title, content });
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, content]);

  return (
    <div className="chapter-editor">
      <div className="editor-toolbar">
        <span>{saving ? '保存中…' : '已自动保存'}</span>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="章节标题" />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="正文内容" />
    </div>
  );
}
```

- [ ] **Step 4: Implement `client/src/pages/BookDetailPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import ChapterEditor from '../components/ChapterEditor.jsx';
import RelationGraph from '../components/RelationGraph.jsx';

export default function BookDetailPage() {
  const { id } = useParams();
  const [book, setBook] = useState(null);
  const [tab, setTab] = useState('content');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/books/${id}`).then((data) => setBook(data.book)).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="form-error">{error}</p>;
  if (!book) return <p className="muted">加载中…</p>;

  const chapter = book.chapters[chapterIndex];

  async function saveChapter(patch) {
    const data = await api(`/books/${id}/chapters/${chapter.id}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
    setBook(data.book);
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>{book.title}</h2>
        <p className="muted">{book.outline}</p>
      </div>
      <div className="tabs">
        <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>内容</button>
        <button className={tab === 'relations' ? 'active' : ''} onClick={() => setTab('relations')}>关系网</button>
      </div>
      {tab === 'content' ? (
        <div className="book-content">
          <select value={chapterIndex} onChange={(e) => setChapterIndex(Number(e.target.value))}>
            {book.chapters.map((item, index) => (
              <option key={item.id} value={index}>{item.title}</option>
            ))}
          </select>
          {chapter && <ChapterEditor key={chapter.id} chapter={chapter} onSave={saveChapter} />}
        </div>
      ) : (
        <RelationGraph relations={book.relations} />
      )}
    </section>
  );
}
```

- [ ] **Step 5: Add a placeholder `RelationGraph`**

Create `client/src/components/RelationGraph.jsx` that returns `<p className="muted">关系网将在下一步实现</p>`.

- [ ] **Step 6: Add page, card, tab, and editor styles**

Add `.page`, `.page-head`, `.book-grid`, `.book-card`, `.tabs`, `.book-content`, `.chapter-editor`, `.editor-toolbar`, `.muted`, `.link-button` to `styles.css`.

- [ ] **Step 7: Build**

Run in `client/`: `npm.cmd run build`

Expected: build passes.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/MyPage.jsx client/src/pages/BookDetailPage.jsx client/src/components/BookList.jsx client/src/components/ChapterEditor.jsx client/src/components/RelationGraph.jsx client/src/styles.css
git commit -m "feat(client): add my books, book detail, and autosave editor"
```

---

### Task 10: Relationship Graph

**Files:**
- Modify: `client/src/components/RelationGraph.jsx`
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: `relations = { nodes: [{ id, name, type }], edges: [{ from, to, label }] }`.
- Produces: SVG node-link graph.

- [ ] **Step 1: Implement `client/src/components/RelationGraph.jsx`**

```jsx
function layoutNodes(nodes) {
  const cx = 250;
  const cy = 200;
  const radius = 150;
  return (nodes || []).map((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1);
    return { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

export default function RelationGraph({ relations }) {
  const nodes = layoutNodes(relations?.nodes);
  const edges = relations?.edges || [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (nodes.length === 0) return <p className="muted">关系网暂无数据，完成章节创作后会生成。</p>;
  return (
    <div className="relation-graph">
      <svg viewBox="0 0 500 400" role="img" aria-label="人物与势力关系网">
        {edges.map((edge, index) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          return (
            <g key={index}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
              <text className="edge-label" x={(from.x + to.x) / 2} y={(from.y + to.y) / 2}>{edge.label}</text>
            </g>
          );
        })}
        {nodes.map((node) => (
          <g key={node.id} className={`relation-node ${node.type}`}>
            <circle cx={node.x} cy={node.y} r={24} />
            <text x={node.x} y={node.y - 32} textAnchor="middle">{node.name}</text>
            <text x={node.x} y={node.y + 4} textAnchor="middle">{node.type === 'faction' ? '势力' : '人物'}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Add graph styles**

Add `.relation-graph`, `line`, `.edge-label`, `.relation-node circle`, `.relation-node text` to `styles.css`.

- [ ] **Step 3: Build**

Run in `client/`: `npm.cmd run build`

Expected: build passes.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/RelationGraph.jsx client/src/styles.css
git commit -m "feat(client): render relationship graph"
```

---

### Task 11: Bookshelf Placeholder and Settings Page

**Files:**
- Create: `client/src/pages/ShelfPage.jsx`
- Create: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: `api('/settings')` GET and PUT.
- Produces: `/shelf` placeholder and `/settings` theme/font controls.

- [ ] **Step 1: Implement `client/src/pages/ShelfPage.jsx`**

```jsx
export default function ShelfPage() {
  return (
    <section className="page">
      <h2>书架</h2>
      <div className="shelf-placeholder">
        <p>其他用户上架功能处于内部开发阶段，暂未开放。</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implement `client/src/pages/SettingsPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const THEMES = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'paper', label: '护眼纸纹' }
];

const SIZES = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' }
];

export default function SettingsPage() {
  const [theme, setTheme] = useState('light');
  const [fontSize, setFontSize] = useState('medium');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/settings').then((data) => {
      setTheme(data.settings.theme);
      setFontSize(data.settings.fontSize);
      document.documentElement.dataset.theme = data.settings.theme;
      document.documentElement.style.fontSize = { small: '14px', medium: '16px', large: '18px' }[data.settings.fontSize];
    });
  }, []);

  async function save(nextTheme, nextSize) {
    const data = await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ theme: nextTheme, fontSize: nextSize })
    });
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.style.fontSize = { small: '14px', medium: '16px', large: '18px' }[data.settings.fontSize];
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  return (
    <section className="page">
      <h2>设置</h2>
      <div className="settings-group">
        <span>背景风格</span>
        <div className="option-row">
          {THEMES.map((item) => (
            <button key={item.value} className={theme === item.value ? 'active' : ''} onClick={() => { setTheme(item.value); save(item.value, fontSize); }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-group">
        <span>字号</span>
        <div className="option-row">
          {SIZES.map((item) => (
            <button key={item.value} className={fontSize === item.value ? 'active' : ''} onClick={() => { setFontSize(item.value); save(theme, item.value); }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {saved && <p className="saved-tip">已保存</p>}
    </section>
  );
}
```

- [ ] **Step 3: Add styles**

Add `.shelf-placeholder`, `.settings-group`, `.option-row`, `.saved-tip` to `styles.css`.

- [ ] **Step 4: Build**

Run in `client/`: `npm.cmd run build`

Expected: build passes.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ShelfPage.jsx client/src/pages/SettingsPage.jsx client/src/styles.css
git commit -m "feat(client): add bookshelf placeholder and settings page"
```

---

### Task 12: README, SUMMARY, Full Verification, and Final Commit

**Files:**
- Create: `README.md`
- Modify: `SUMMARY.md`

**Interfaces:**
- Produces: startup and configuration documentation.
- Produces: structured project summary.

- [ ] **Step 1: Write `README.md`**

Include: project intro, directory structure, environment variables, install commands, start commands, test account, and troubleshooting (missing key, port occupied).

- [ ] **Step 2: Write `SUMMARY.md`**

Use the structure: 项目介绍 / 核心功能 / 模块设计 / 修改日志.

- [ ] **Step 3: Run all automated tests**

Run in `server/`: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 4: Build the client**

Run in `client/`: `npm.cmd run build`

Expected: Vite build succeeds without errors.

- [ ] **Step 5: Smoke test the running app**

Start both servers. Login as `admin / 123456`, call `GET /api/settings`, and confirm the login response includes a token.

- [ ] **Step 6: Final commit**

```bash
git add README.md SUMMARY.md
git commit -m "docs: add readme and project summary"
```

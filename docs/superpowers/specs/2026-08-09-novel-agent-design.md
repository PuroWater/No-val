# Novel Agent 小说创作平台设计文档

日期：2026-08-09  
状态：已确认，作为实现依据

## 1. 背景与目标

构建一个可直接运行的小说创作平台 Web 应用。前端为 React SPA，后端为 Express，数据使用本地 JSON 文件持久化，不引入数据库。后端统一调用 DeepSeek 大模型完成新书创作、续写和关系网提取，前端不直接接触 API Key。

## 2. 架构

- `client/`：React + Vite SPA，开发端口 5173，`/api` 代理到后端 3001。
- `server/`：Express API，端口 3001，负责认证、JSON 持久化、DeepSeek 调用。
- `data/`：运行时自动生成的 JSON 文件，包含用户、书籍和设置数据。
- 根目录：`README.md`、`SUMMARY.md`、`TARGET.md`、`.env.example`、`.gitignore`。

## 3. 目录结构

```text
Novel Agent/
├─ client/
│  ├─ src/
│  │  ├─ api.js
│  │  ├─ App.jsx
│  │  ├─ main.jsx
│  │  ├─ styles.css
│  │  ├─ auth/AuthContext.jsx
│  │  ├─ components/
│  │  │  ├─ BookList.jsx
│  │  │  ├─ ChapterEditor.jsx
│  │  │  ├─ ChatPanel.jsx
│  │  │  ├─ ProtectedRoute.jsx
│  │  │  ├─ RelationGraph.jsx
│  │  │  └─ Sidebar.jsx
│  │  └─ pages/
│  │     ├─ BookDetailPage.jsx
│  │     ├─ HomePage.jsx
│  │     ├─ LoginPage.jsx
│  │     ├─ MyPage.jsx
│  │     ├─ SettingsPage.jsx
│  │     └─ ShelfPage.jsx
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.js
├─ server/
│  ├─ src/
│  │  ├─ config.js
│  │  ├─ index.js
│  │  ├─ middleware/auth.js
│  │  ├─ routes/auth.js
│  │  ├─ routes/books.js
│  │  ├─ routes/chat.js
│  │  ├─ routes/settings.js
│  │  ├─ lib/security.js
│  │  ├─ lib/store.js
│  │  ├─ lib/token.js
│  │  ├─ services/bookService.js
│  │  └─ services/deepseek.js
│  └─ package.json
├─ data/
│  ├─ users.json
│  ├─ books.json
│  └─ settings.json
├─ .env.example
├─ .gitignore
├─ README.md
├─ SUMMARY.md
└─ TARGET.md
```

## 4. 数据模型

### users.json

```json
[
  {
    "id": "u_xxx",
    "username": "admin",
    "passwordHash": "$2a$10$...",
    "createdAt": "2026-08-09T00:00:00.000Z"
  }
]
```

首次启动自动创建测试账号 `admin / 123456`，密码使用 bcrypt 哈希。

### books.json

```json
[
  {
    "id": "b_xxx",
    "userId": "u_xxx",
    "title": "书名",
    "outline": "简介",
    "chapters": [
      {
        "id": "c_xxx",
        "title": "第一章",
        "content": "正文",
        "updatedAt": "2026-08-09T00:00:00.000Z"
      }
    ],
    "relations": {
      "nodes": [
        { "id": "n_1", "name": "角色A", "type": "person" },
        { "id": "n_2", "name": "势力B", "type": "faction" }
      ],
      "edges": [
        { "from": "n_1", "to": "n_2", "label": "所属" }
      ]
    },
    "createdAt": "2026-08-09T00:00:00.000Z",
    "updatedAt": "2026-08-09T00:00:00.000Z"
  }
]
```

### settings.json

```json
[
  {
    "userId": "u_xxx",
    "theme": "light",
    "fontSize": "medium"
  }
]
```

`theme` 取值：`light`、`dark`、`paper`。`fontSize` 取值：`small`、`medium`、`large`。

## 5. API 约定

统一前缀 `/api`，除注册、登录外均需 `Authorization: Bearer <token>`。

- `POST /api/auth/register`：`{ username, password }`，返回 `{ token, user }`。
- `POST /api/auth/login`：`{ username, password }`，返回 `{ token, user }`。
- `GET /api/auth/me`：返回当前用户。
- `GET /api/books`：返回当前用户的书籍摘要列表。
- `GET /api/books/:id`：返回完整书籍。
- `PUT /api/books/:id/chapters/:chapterId`：保存章节，返回完整书籍。
- `POST /api/chat/create-book`：`{ concept }`，创建新书并返回完整书籍。
- `POST /api/chat/continue`：`{ bookId, instruction }`，续写章节并返回完整书籍。
- `GET /api/settings`：返回当前用户设置。
- `PUT /api/settings`：`{ theme, fontSize }`，保存设置。

错误统一返回 `{ "error": "可读错误信息" }`，状态码使用 400、401、404、500。

## 6. DeepSeek 集成

- 环境变量：`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL=deepseek-v4-flash`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`。
- 请求 DeepSeek 的 `/chat/completions` 接口，使用 OpenAI 兼容格式。
- 创建新书：向模型提供小说构思，要求返回 JSON `{ title, outline, chapters: [{ title, content }] }`。
- 续写：传入书籍简介、已有章节和用户指令，要求返回 JSON `{ chapter: { title, content } }`。
- 关系网：传入全部章节，要求返回 JSON `{ nodes, edges }`。
- 后端解析响应时剥离可能的 Markdown 代码块，再执行 `JSON.parse`；解析失败时返回可读错误。

## 7. 前端页面

- `/login`：登录页，含登录与注册切换。
- `/`：主界面外壳，左侧功能栏为创作、续写、书架、我的，右侧为内容区。
- 创作与续写：聊天式交互，上方展示“今天有什么想法”“来聊聊吧！”提示。
- `/my`：书籍列表，展示书名、章节数、更新时间，入口可进入设置。
- `/books/:id`：书籍详情，并列“内容”与“关系网”栏位。
- `/shelf`：书架占位页。
- `/settings`：设置页，切换主题和字号。

前端通过 `AuthContext` 保存 JWT 与用户信息，`ProtectedRoute` 拦截未登录访问，`api.js` 统一附带 Authorization 头并在 401 时清理登录态。

## 8. 安全与隐私

- `.env` 和 `data/*.json` 加入 `.gitignore`，不提交真实密钥与用户数据。
- 密码使用 bcrypt 哈希，不输出到日志。
- JWT 使用 `JWT_SECRET` 签名。
- DeepSeek API Key 只在后端环境变量中读取。

## 9. 错误处理

- 缺少 API Key 或模型调用失败时，后端返回 502 及可读提示，前端聊天区展示错误，不中断页面。
- JSON 数据文件损坏时，使用兜底空数组并重建文件。
- 章节保存前校验书籍归属，未登录或越权访问返回 401 / 404。

## 10. 测试与验收

- 后端使用 Node 内置 `node --test` 测试哈希、JWT、JSON 解析等纯逻辑。
- 手工验收按 TARGET.md 的验收清单执行：注册登录、创作、续写、编辑自动保存、关系网、书架占位、设置持久化。
- 全量验证通过后更新 README 和 SUMMARY.md。

## 11. 非目标

- 本阶段不实现数据库、多用户书架共享、发布上线、流式输出、移动端原生应用。
- 关系网为静态 SVG 展示，不做拖拽编辑。

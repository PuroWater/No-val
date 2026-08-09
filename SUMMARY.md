# Novel Agent 项目摘要

## 当前状态

- 当前版本：0.2.0
- 当前分支：Develop
- 技术栈：React 18 + Vite 5，Express 4，Node.js 18+，JSON 本地持久化
- 大模型：DeepSeek，模型默认 `deepseek-v4-flash`
- 数据目录：项目根目录 `data/`

## 项目介绍

Novel Agent 是一个本地可直接运行的小说创作平台 Web 应用。前端使用 React SPA，后端使用 Express API，所有业务数据以 JSON 文件保存在 `data/` 下，不依赖数据库。后端统一调用 DeepSeek 完成小说构思采集、摘要整合、章节生成、续写、改写和关系网提取，前端不直接接触 API Key。

项目采用“一书一页面”的创作工作台：顶部选择一本历史图书或新建创作会话，聊天记录随书籍持久化，生成后可在聊天中打开并列窗口，边看、边改、边继续创作。

## 核心功能

### 用户认证

- 登录、注册、退出登录。
- 密码使用 bcrypt 哈希存储，不保存明文。
- 登录成功返回 JWT，前端保存到 localStorage。
- 未登录访问受保护页面时自动跳回登录页。
- 首次启动自动创建测试账号 `admin / 123456`。

### 创作工作台（一书一页面）

- 创作与续写合并为同一个工作台，不再分为两个独立板块。
- 顶部下拉框可选择“＋ 新创作”或任意历史图书。
- 新创作先生成 `draft` 草稿会话，标题暂为“未命名新书”。
- 用户发送首轮构思后，Agent 一次只追问一个缺失信息，包括主角、故事背景、分类等。
- 信息齐全后 Agent 输出整合后的构思摘要，并询问是否需要修改。
- 用户回复“确认”后才调用 DeepSeek 生成正式书籍。
- 用户也可以继续提出修改意见，Agent 会重新整合摘要后再确认。

### 持久化聊天

- 每本书的聊天记录保存在该书籍 JSON 的 `chat` 字段中。
- 消息包含 `role`、`content`、`kind`、`createdAt`。
- `kind` 支持 `text`、`question`、`confirm`、`book`、`error`。
- 切换“我的 / 书架 / 设置”等板块后，回到创作工作台仍保持原书籍和原会话。
- 重启后端后聊天记录依然存在。

### 书本组件与并列编辑

- 小说生成后，聊天区出现书本样式组件。
- 书本组件显示书名、章节数，并提供“打开并列窗口”和“详情”入口。
- 并列窗口与聊天界面同屏显示，可实时查看章节、关系网和编辑内容。
- 章节编辑停止输入 1 秒后自动保存。

### 生成后协作

- 续写下一章：在聊天中直接输入续写指令。
- 改写章节：输入修改意见，Agent 判断目标章节并重写。
- 剧情问答：询问设定、角色或剧情，Agent 直接回答。
- 每次续写或改写后自动重新整理人物与势力关系网。

### 其他页面

- 我的：展示已生成书籍列表，包含书名、章节数、更新时间，并进入设置页。
- 书架：内部开发阶段占位页面，仅展示前端 UI。
- 设置：浅色 / 深色 / 护眼纸纹背景风格，小 / 中 / 大字号，持久化到 `settings.json`。
- 书籍详情：`内容 / 关系网` 并列栏位，关系网使用 SVG 展示人物与势力节点。

## 技术架构

### 前端 `client/`

- React 18 + Vite 5 + React Router 6。
- 开发服务器端口 5173，`/api` 代理到后端 3001。
- Vite 监听 `0.0.0.0`，同时支持 localhost 与 127.0.0.1 访问。
- 核心文件：
  - `src/App.jsx`：路由定义。
  - `src/api.js`：统一 API 请求、JWT 注入、401 处理。
  - `src/auth/AuthContext.jsx`：登录态管理。
  - `src/pages/WorkspacePage.jsx`：一书一页面创作工作台。
  - `src/components/ChatPanel.jsx`：持久化聊天界面。
  - `src/components/BookWidget.jsx`：书本组件。
  - `src/components/BookSidePanel.jsx`：并列阅读与编辑窗口。
  - `src/components/ChapterEditor.jsx`：章节自动保存编辑器。
  - `src/components/RelationGraph.jsx`：SVG 关系网。
  - `src/styles.css`：主题变量与全站样式。

### 后端 `server/`

- Express 4 + ESM。
- 端口 3001，生产模式同时托管 `client/dist` 构建产物。
- 核心文件：
  - `src/index.js`：服务入口、静态托管、SPA 回退、404 信息。
  - `src/routes/auth.js`：注册、登录、当前用户。
  - `src/routes/books.js`：书籍列表、详情、章节保存。
  - `src/routes/chat.js`：草稿会话、消息推进、兼容旧接口。
  - `src/routes/settings.js`：主题与字号设置。
  - `src/services/chatService.js`：聊天状态机、构思采集、摘要确认。
  - `src/services/bookService.js`：生成、续写、改写、关系网提取。
  - `src/services/deepseek.js`：DeepSeek API 调用与 JSON 解析。
  - `src/lib/store.js`：JSON 读写。
  - `src/lib/security.js`：bcrypt 密码哈希。
  - `src/lib/token.js`：JWT 签发与校验。
  - `src/lib/bookUtils.js`：书籍数据规范化与 ID 生成。

### 数据模型

`data/users.json`：

```json
{
  "id": "u_xxx",
  "username": "admin",
  "passwordHash": "$2a$10$...",
  "createdAt": "..."
}
```

`data/books.json`：

```json
{
  "id": "b_xxx",
  "userId": "u_xxx",
  "status": "draft" | "ready",
  "title": "书名或未命名新书",
  "outline": "简介",
  "chapters": [],
  "relations": { "nodes": [], "edges": [] },
  "chat": [],
  "draft": { "concept": "", "summary": "" },
  "createdAt": "...",
  "updatedAt": "..."
}
```

`data/settings.json`：

```json
{
  "userId": "u_xxx",
  "theme": "light",
  "fontSize": "medium"
}
```

## API 一览

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/books`
- `GET /api/books/:id`
- `PUT /api/books/:id/chapters/:chapterId`
- `POST /api/chat/sessions`
- `POST /api/chat/message`
- `POST /api/chat/create-book`（兼容）
- `POST /api/chat/continue`（兼容）
- `GET /api/settings`
- `PUT /api/settings`

除注册、登录外，其余接口需要 `Authorization: Bearer <token>`。

## 安全与隐私

- `.env` 被 `.gitignore` 忽略，不提交 `DEEPSEEK_API_KEY`。
- `data/*.json` 被忽略，不提交用户与书籍数据。
- 密码 bcrypt 哈希，日志不输出密钥和密码。
- DeepSeek 请求只发生在后端。

## 启动方式

开发模式：

```bash
npm run dev:server
npm run dev:client
```

访问 `http://localhost:5173`。

生产模式：

```bash
npm run build
npm start
```

访问 `http://localhost:3001`。

## 修改日志

| 时间 | 版本 | 内容 | 技术细节 | 总结 |
| --- | --- | --- | --- | --- |
| 2026-08-09 | 0.1.0 | 需求、设计与实施计划 | 编写 TARGET、设计文档和逐任务实施计划 | 明确架构、数据模型、API 与验收清单 |
| 2026-08-09 | 0.1.0 | 项目脚手架 | Vite + React 18、Express 4、依赖安装、.env.example、.gitignore | 前后端基础工程可启动 |
| 2026-08-09 | 0.1.0 | 服务端基础与认证 | JSON store、bcrypt、JWT、admin 自动播种 | 账号安全落盘，登录态可用 |
| 2026-08-09 | 0.1.0 | 书籍与设置 API | 书籍 CRUD、章节保存、主题字号设置 | 数据持久化链路完整 |
| 2026-08-09 | 0.1.0 | DeepSeek 接入 | `deepseek-v4-flash`、JSON 解析、错误处理 | 后端可调用大模型创作与续写 |
| 2026-08-09 | 0.1.0 | 前端主要页面 | 登录、主界面、我的、详情、关系网、设置、书架 | 页面可运行并通过构建 |
| 2026-08-09 | 0.1.0 | 生产模式静态托管 | Express 托管 `client/dist`，SPA 回退 | 打开后端地址即可使用 |
| 2026-08-09 | 0.1.0 | 开发服务器 IPv4 修复 | Vite `host: '0.0.0.0'` | localhost 与 127.0.0.1 均可访问 |
| 2026-08-09 | 0.2.0 | 交互式创作工作台 | 一书一页面、创作与续写合并、顶部书籍选择 | 创作入口统一 |
| 2026-08-09 | 0.2.0 | 后端聊天状态机 | `draft` 书籍、`/api/chat/sessions`、`/api/chat/message`、逐项提问、摘要确认 | 构思采集流程完整 |
| 2026-08-09 | 0.2.0 | 聊天持久化 | 书籍 `chat` 字段落盘，重启后保留 | 切换板块不再丢失会话 |
| 2026-08-09 | 0.2.0 | 书本组件与并列窗口 | BookWidget、BookSidePanel、同屏阅读编辑 | 边看边改边写 |
| 2026-08-09 | 0.2.0 | 生成后协作 | 续写、改写、剧情问答、关系网自动更新 | 已生成书籍可持续迭代 |
| 2026-08-09 | 0.2.0 | 文档与版本 | README、TARGET、SUMMARY、设计文档、0.2.0 | 文档与功能同步更新 |

## 验证记录

- 后端测试：7 个自动化测试通过。
- 前端构建：`npm run build` 通过。
- 冒烟验证：登录成功、草稿创建成功、聊天消息持久化、生产页面 200。
- 真实大模型调用依赖根目录 `.env` 中的 `DEEPSEEK_API_KEY`。

# Novel Agent 项目摘要

## 当前状态

- 当前版本：0.3.4
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
- 顶部使用独立的“＋ 新创作”按钮进入新会话，下拉框只用于选择历史图书。
- 历史图书按“构思中”和“已生成图书”分组显示。
- 点击“＋ 新创作”只进入聊天界面，不预先创建书籍条目。
- 只有用户真正发送首条消息后才会创建书籍条目；没有书名时草稿标题使用“构思：首段内容”作为概括信息，生成正式书名后再替换。
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
- 发送消息时用户消息立即乐观上屏，不需要等待 AI 返回。
- 后端会先持久化用户消息和“处理中”状态，再调用 AI，切换页面后加载信息不会丢失。
- 同一会话存在“处理中”消息时禁止再次发送，前端按钮禁用，后端也会拦截重复请求。

### 书本组件与并列编辑

- 小说生成后，聊天区出现书本样式组件。
- 书本组件显示书名、章节数，并提供“打开并列窗口”和“详情”入口。
- 并列窗口与聊天界面同屏显示，可实时查看章节、关系网和编辑内容。
- 章节编辑停止输入 1 秒后自动保存。
- 关系网为空时自动生成，并支持手动重新生成。
- 生成时自动提取人物与势力关系；续写和改写完成后会基于全部章节重新提取。
- 手动编辑章节正文后不会自动调用模型，可在关系网栏位点击“重新生成关系网”更新。

### 生成后协作

- 续写下一章：在聊天中直接输入续写指令。
- 改写章节：输入修改意见，Agent 判断目标章节并重写。
- 剧情问答：询问设定、角色或剧情，Agent 直接回答。
- 每次续写或改写后自动重新整理人物与势力关系网。

### 删除与回收站

- 创作页可删除当前图书或草稿。
- 我的页可删除已生成图书。
- 删除采用软删除，项目进入回收站。
- 设置页回收站分为“图书（已生成）”和“构思（未生成）”两组分别管理。
- 回收站支持恢复和彻底删除，彻底删除后不可恢复。

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
  "chapters": [
    {
      "id": "c_xxx",
      "title": "章节标题",
      "content": "章节正文",
      "summary": "章节摘要",
      "updatedAt": "..."
    }
  ],
  "relations": { "nodes": [], "edges": [] },
  "storySummary": "全书剧情摘要",
  "chat": [],
  "draft": { "concept": "", "summary": "" },
  "deletedAt": null,
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
- `GET /api/books/trash`
- `GET /api/books/:id`
- `POST /api/books/:id/relations`
- `DELETE /api/books/:id`
- `POST /api/books/:id/restore`
- `DELETE /api/books/:id/permanent`
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

## 项目注意事项

### 目录与文件约定

- 根目录只放工程级文件：`README.md`、`SUMMARY.md`、`TARGET.md`、`package.json`、`.gitignore`、`.env.example`。
- 前端代码统一放在 `client/src`：页面放入 `pages/`，可复用组件放入 `components/`，认证逻辑放入 `auth/`，样式集中在 `styles.css`。
- 后端代码统一放在 `server/src`：路由放入 `routes/`，业务逻辑放入 `services/`，通用工具放入 `lib/`，入口为 `index.js`。
- 测试文件统一放在 `server/test/`，使用 Node 内置 `node --test`。
- 运行时数据统一放在 `data/`，禁止把业务数据写到代码目录。
- 新增文件必须遵守现有分层，不允许在页面组件中直接读写 JSON 文件。

### 文档职责约定

- `TARGET.md`：负责每一次更新的目标。每次更新前先修改 TARGET，按“日期 + 版本”划分，写明“待更新说明”和“待更新功能”；开发完成后记录实际完成内容。
- `SUMMARY.md`：负责项目详细概况，在每次更新完工后进行总结并持续维护。结构为顶部总概括，底部按时间与版本列出更新说明，写明更新或修复了哪些内容、完成了什么。
- `README.md`：只做简单项目介绍和快速启动说明，不承担详细需求、实施计划与更新日志，避免与 TARGET、SUMMARY 重复。
- 三份文档的分工顺序：先更新 TARGET 定目标，再按计划开发，最后更新 SUMMARY 做总结；README 始终面向使用者保持简单。

### 配置约定

- 所有环境变量以 `.env.example` 为准：`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL=deepseek-v4-flash`、`DEEPSEEK_BASE_URL`、`JWT_SECRET`、`PORT`。
- 本地真实配置写在根目录 `.env`，`.env` 必须被 `.gitignore` 忽略。
- 后端端口固定为 3001，前端开发端口固定为 5173，Vite 必须保持 `host: '0.0.0.0'`。
- 生产模式由 Express 托管 `client/dist`，SPA 回退只对非 `/api` 请求生效。
- Windows PowerShell 执行 npm 时使用 `npm.cmd`，避免 `npm.ps1` 执行策略问题。

### 数据与接口约定

- `data/users.json` 只存放用户账号数据，密码只允许存 bcrypt 哈希。
- `data/books.json` 是书籍与聊天记录的唯一数据源，所有字段必须兼容 `normalizeBook`。
- `data/settings.json` 存放用户偏好，`theme` 与 `fontSize` 取值由后端白名单校验。
- 新增 API 必须遵循 `/api` 前缀和统一错误格式 `{ "error": "中文说明" }`。
- 除注册、登录外，所有接口必须校验 JWT。
- 新增 API 后必须同步更新 SUMMARY 的 API 一览。

### Git 与协作约定

- 提交信息必须使用中文，推荐格式 `类型(模块): 中文描述`，示例：`feat(聊天): 新增持久化会话`。
- 日常开发在 `Develop` 分支进行，大功能先建功能分支，验证通过后再合并。
- 未确认前不推送到远程，提交只保留在本地。
- 开发新功能前先确认 TARGET 需求，必要时补充设计文档和实施计划。
- 功能完成后必须同步更新 `README.md`、`SUMMARY.md`，涉及需求时同步更新 `TARGET.md`。

### 质量与安全门禁

- 修改后端必须运行 `npm test`，所有测试必须通过。
- 修改前端必须运行 `npm run build`，构建必须通过。
- 禁止提交 `node_modules/`、`dist/`、`.vite/`、`.env`、`data/*.json`。
- DeepSeek 调用只允许发生在后端，前端不得持有或接触 API Key。
- 沙箱网络受限时，DeepSeek 真实调用无法验证，只能验证错误处理分支；完整验证需配置 `.env`。

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

## 验证记录

- 后端测试：7 个自动化测试通过。
- 前端构建：`npm run build` 通过。
- 冒烟验证：登录成功、草稿创建成功、聊天消息持久化、生产页面 200。
- 真实大模型调用依赖根目录 `.env` 中的 `DEEPSEEK_API_KEY`。

## 版本更新说明

### 2026-08-09 v0.1.0 初始版本

更新内容：

- 建立 React + Vite 前端与 Express 后端工程。
- 完成 JWT 认证、bcrypt 密码哈希、JSON 本地持久化与测试账号。
- 完成书籍、章节、设置、DeepSeek 创作与续写接口。
- 完成登录、主界面、我的、详情、关系网、设置、书架页面。
- Express 生产模式托管前端构建产物。

完成结果：项目可本地运行，支持账号登录、小说创作与续写、章节编辑、关系网展示和设置持久化。

### 2026-08-09 v0.2.0 交互式创作工作台

更新内容：

- 创作与续写合并为“一书一页面”创作工作台。
- 新增草稿会话、逐步提问、摘要确认后生成的交互流程。
- 聊天记录持久化到书籍 JSON，切换板块后会话不丢失。
- 新增书本组件和并列窗口，支持边看、边改、边继续创作。
- 支持续写下一章、改写章节、剧情问答和关系网自动更新。
- 修复重复新创作、消息未即时上屏、处理中切换页面丢失状态、重复发送问题。

完成结果：创作流程完整闭环，首条消息后才建档，聊天即时反馈且防重复。

### 2026-08-10 v0.2.0 文档职责调整

更新内容：

- 明确 TARGET、SUMMARY、README 三份文档的分工。
- SUMMARY 项目注意事项重构为结构、文件、配置、数据、Git 与质量约定。
- 功能行为归入各自功能板块说明。
- README 简化为项目介绍与快速启动。

完成结果：文档职责清晰，TARGET 管目标、SUMMARY 管总结、README 管介绍。

### 2026-08-10 v0.3.0 图书回收站与创作分类

更新内容：

- 新增图书与草稿删除功能，删除后进入回收站。
- 新增回收站列表、恢复、彻底删除接口与页面。
- 设置页回收站分“图书（已生成）”和“构思（未生成）”分别管理。
- 创作页历史图书按“构思中 / 已生成图书”分组。
- 我的页图书卡片增加删除按钮。
- 版本号升级到 0.3.0。

完成结果：历史聊天和生成图书可管理，回收站分类清晰，创作页不再混排草稿与成书。

### 2026-08-10 v0.3.1 关系网修复

更新内容：

- 新增关系网重新生成接口 `POST /api/books/:id/relations`。
- 旧图书关系网为空时，前端进入关系网栏位会自动生成。
- 关系网栏位新增“重新生成关系网”按钮。
- 版本号升级到 0.3.1。

完成结果：旧图书和新增图书都能正常生成并展示人物与势力关系网。

### 2026-08-10 v0.3.2 书籍详情页空白修复

更新内容：

- 修复图书详情页空白问题。
- 调整 `BookSidePanel` Hooks 顺序，保证加载状态和内容状态使用相同的 Hooks 数量。
- 版本号升级到 0.3.2。

完成结果：点击图书详情可正常显示章节内容和关系网，控制台无应用报错。

### 2026-08-10 v0.3.3 关系网 JSON 解析修复

更新内容：

- DeepSeek 返回损坏 JSON 时，后端自动让模型修复后再解析。
- 新增 `sanitizeRelations`，过滤无效节点、去重节点、过滤引用不存在节点的边。
- 生成、续写、改写、重新生成关系网全部使用修复后的算法。
- 版本号升级到 0.3.3。

完成结果：《乐子》重新生成成功，10 个节点、14 条边；新小说和后续续写/改写都会沿用同一套关系网算法。

### 2026-08-10 v0.3.4 摘要式关系网维护

更新内容：

- 章节新增 `summary` 字段，生成章节时同步产出 80-150 字剧情摘要。
- 书籍新增 `storySummary` 字段，维护全书剧情摘要。
- 续写下一章时只读取全书摘要、最近章节摘要和现有关系网，不再读取全部正文。
- 续写、改写完成后基于章节摘要增量更新全书摘要和关系网。
- 版本号升级到 0.3.4。

完成结果：长小说 token 消耗显著降低，关系网维护不再受全部正文长度限制。

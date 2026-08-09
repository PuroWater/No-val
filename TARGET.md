【项目目标】
在当前开发环境下（已安装 VSCode、Node.js），生成一个可直接运行的**小说创作平台 Web 应用**。项目不连接任何数据库，后端数据使用本地 JSON 文件持久化。前端为 React 单页应用（SPA），后端为 Express，调用 DeepSeek 大模型辅助创作。

【技术栈与运行环境】
- 前端：React + Vite，使用 React Router 管理页面，不依赖外部 CDN。
- 后端：Node.js + Express，使用本地文件系统读写 JSON。
- 大模型：DeepSeek，后端统一调用，模型固定为 `deepseek-v4-flash`。
- Node.js 版本：建议 18 或以上。
- 端口约定：后端 `3001`，前端开发服务器 `5173`，Vite 将 `/api` 代理到后端。

【项目目录结构】
项目代码直接在当前工作目录下创建，根目录保留 `README.md`、`SUMMARY.md`、`TARGET.md`，代码放入以下结构：

```text
Novel Agent/
├─ client/                 # React 前端
│  ├─ src/                 # 页面、组件、路由
│  └─ package.json
├─ server/                 # Express 后端
│  ├─ src/                 # 路由、数据层、DeepSeek 调用
│  └─ package.json
├─ data/                   # 运行时生成的 JSON 数据
│  ├─ users.json
│  ├─ books.json
│  └─ settings.json
├─ .env.example            # 环境变量示例，不含真实密钥
├─ .gitignore
├─ README.md
├─ SUMMARY.md
└─ TARGET.md
```

【功能需求】

1. 用户认证
   - 登录页包含“登录 / 注册”两个入口，支持账号密码注册和登录。
   - 密码使用哈希存储（如 bcryptjs），禁止明文保存。
   - 登录成功后返回 JWT，前端保存登录态；未登录访问主界面时自动跳回登录页。
   - 提供测试账号 `admin / 123456`，后端首次启动时自动创建。
   - 支持退出登录。
2. 主界面（Agent 聊天）
   - 登录后进入主界面，左侧功能栏包含：创作、续写、书架、我的。
   - 聊天框上方空白区域显示“今天有什么想法”“来聊聊吧！”等提示，用户可点击提示快速填入。
   - 聊天框用于接收用户的小说构思或续写指令，后端处理后调用 DeepSeek。
3. 创作
   - 用户输入一本小说的构思后，Agent 整理请求并调用 DeepSeek 生成书名、简介、大纲和首批章节。
   - 生成结果自动在“我的”中新增一本图书，章节按章存储。
   - 支持用户继续与 Agent 对话，选择某本书续写下一章或补充指定章节。
4. 我的
   - 展示当前用户创作过的书籍列表，包含书名、章节数、更新时间。
   - 点击书籍进入详情页，详情页并列提供“内容”和“关系网”两个栏位。
   - “内容”栏支持按章查看和编辑，编辑后自动保存（如停止输入 1 秒后保存）。
5. 关系网
   - 展示书籍内的人物与势力关系，使用节点和连线表示。
   - 关系数据在章节生成或更新时由后端整理，存入书籍 JSON。
   - 前端使用 SVG 绘制关系图，节点区分人物 / 势力类型。
6. 书架
   - 本阶段只实现前端页面与“开发中”占位状态，不实现其他用户上架功能。
7. 设置
   - 设置界面支持切换背景风格，如浅色、深色、护眼纸纹。
   - 支持字号等简单偏好设置，并持久化到 `data/settings.json`。
   - 设置入口放在“我的”页面。

【数据与持久化】
- `data/users.json`：用户账号（id、username、passwordHash、createdAt）。
- `data/books.json`：书籍（id、userId、title、outline、chapters、relations、createdAt、updatedAt）。
- `data/settings.json`：用户偏好（userId、theme、fontSize）。
- 数据文件在首次启动时自动创建；读写采用简单 JSON 持久化，本阶段不引入数据库。

【后端 API 约定】
- `POST /api/auth/register`：注册。
- `POST /api/auth/login`：登录，返回 JWT。
- `GET /api/me`：获取当前用户信息。
- `GET /api/books`：获取当前用户书籍列表。
- `GET /api/books/:id`：获取书籍详情。
- `PUT /api/books/:id/chapters/:chapterId`：保存章节内容。
- `POST /api/chat/create-book`：根据构思生成新书。
- `POST /api/chat/continue`：续写章节。
- `GET /api/settings`、`PUT /api/settings`：读取、保存设置。
- 除注册、登录外，其余接口需要携带 JWT。

【DeepSeek 集成】
- 后端统一调用 DeepSeek API，前端不直接持有密钥。
- 密钥从环境变量 `DEEPSEEK_API_KEY` 读取；本地通过根目录 `.env` 提供，`.env` 必须加入 `.gitignore`，不提交仓库。
- 模型固定为 `deepseek-v4-flash`，可通过 `.env` 中 `DEEPSEEK_MODEL` 覆盖。
- 后端负责处理超时、限流、缺少密钥等错误，并在聊天界面显示可读的错误提示。

【安全与隐私】
- `.gitignore` 必须忽略 `node_modules`、`.env`、`dist`、`data/*.json` 等目录或文件。
- 提供 `.env.example` 说明需要配置的环境变量，不写入真实密钥。
- 密码必须哈希存储，日志中不得输出密钥或密码。

【README 与启动方式】
`README.md` 必须包含：
- 项目简介和目录说明。
- 依赖安装命令：`cd client && npm install`、`cd server && npm install`。
- 启动命令：后端 `cd server && npm run dev`，前端 `cd client && npm run dev`。
- 环境变量说明（`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`JWT_SECRET`）。
- 测试账号 `admin / 123456`。
- 常见问题：缺少密钥、端口被占用等。

【输出期望】
- 完整项目文件结构与源码，代码包含必要注释。
- 清晰的启动步骤和测试账号。
- 依赖清单及安装命令，存储位置明确。
- 完成后更新根目录 `SUMMARY.md`。

【SUMMARY.md 规范】
更新根目录 `SUMMARY.md`，按以下结构组织：
- 项目介绍
- 核心功能
- 模块设计
- 修改日志（时间、内容、总结）

【验收清单】
- 注册 / 登录 / 退出登录正常，未登录访问主界面会跳回登录页。
- 输入构思可生成新书，书名、章节进入“我的”。
- 可续写章节，可编辑章节并自动保存。
- 书籍详情页有并列的“内容 / 关系网”栏位，关系网能展示人物和势力关系。
- 书架为占位页面。
- 设置中的背景风格切换后刷新仍生效。
- 后端数据均写入 `data/` 下 JSON 文件。
- `.env` 与 `data/*.json` 未被提交。

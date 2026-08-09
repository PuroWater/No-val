# Novel Agent 小说创作平台

一个可直接运行的本地小说创作 Web 应用。前端使用 React + Vite，后端使用 Express，数据以 JSON 文件持久化在 `data/` 目录，不依赖数据库。后端统一调用 DeepSeek 模型辅助创作，模型默认 `deepseek-v4-flash`。

## 功能

- 登录 / 注册，JWT 登录态，未登录自动跳回登录页。
- 创作：输入小说构思，Agent 生成书名、简介、大纲和首批章节。
- 续写：选择已创作书籍，继续生成下一章。
- 我的：书籍列表、章节编辑、停止输入 1 秒后自动保存。
- 关系网：展示书中人物与势力关系的 SVG 节点图。
- 书架：内部开发阶段占位页面。
- 设置：浅色 / 深色 / 护眼纸纹背景风格与字号切换。

## 目录结构

```text
Novel Agent/
├─ client/     # React 前端（Vite，端口 5173）
├─ server/     # Express 后端（端口 3001）
├─ data/       # 运行时生成的 users.json / books.json / settings.json
├─ .env.example
└─ TARGET.md
```

## 环境要求

- Node.js 18 或以上。
- 可选：DeepSeek API Key。

## 配置环境变量

在项目根目录创建 `.env`，参考 `.env.example`：

```text
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
JWT_SECRET=请改成随机字符串
PORT=3001
```

`.env` 已加入 `.gitignore`，不会提交到仓库。

## 安装

```bash
cd client
npm install
cd ../server
npm install
```

Windows PowerShell 若提示禁止运行脚本，请使用 `npm.cmd install`。

## 启动

开两个终端：

```bash
cd server
npm run dev
```

```bash
cd client
npm run dev
```

访问 `http://localhost:5173`。

## 生产模式

后端会直接托管前端构建产物，只需一个服务即可访问完整界面：

```bash
npm run build
npm start
```

然后访问 `http://localhost:3001`。

## 测试账号

首次启动后自动创建：`admin / 123456`

## 测试与构建

```bash
cd server
npm test
```

```bash
cd client
npm run build
```

## 常见问题

- 创作返回“未配置 DEEPSEEK_API_KEY”：在根目录 `.env` 中配置密钥后重启 server。
- 端口被占用：修改 `.env` 的 `PORT`，或在 `client/vite.config.js` 中调整代理地址。
- 忘记登录态：清除浏览器 localStorage，或重新登录。

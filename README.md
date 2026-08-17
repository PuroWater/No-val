# No-val 小说创作平台

一个本地运行的 LLM Agent 小说创作 Web 应用：前端 React SPA + 后端 Express，通过"路由器-执行器-状态机"的 Agent 架构，把"构思 → 生成 → 续写 → 改写 → 一致性维护"全流程做成可对话、可编辑、可测试的创作工作台。

## ✨ 核心特性

- **一书一页面工作台**：聊天与书籍并列窗口同屏，边聊、边看、边改、边创作；会话随书籍持久化，重启不回丢。
- **对话式创作闭环**：构思阶段 Agent 逐步追问缺失信息 → 整合摘要 → 用户确认后生成；支持续写、改写、插入/删除章节、剧情问答。
- **Agent 架构**：意图路由（结构化输出）→ 任务单（工具白名单 + 完成条件）→ 状态机执行器，工具结果标准化校验、失败回传重试、跨消息幂等，行为可预测、可测试。
- **长书 token 友好**：章节摘要 + 按章事件 + 差分维护内核，日常路径只读局部上下文，成本不随章节数膨胀。
- **人物/世界观一致性**：零 AI 派生人物索引 + 按章快照增量人物卡 + 评审反馈环，按位置定向注入，保障长篇一致性。
- **多供应商模型**：DeepSeek / OpenAI / Anthropic / OpenRouter / Grok / Kimi / GLM / MiniMax / Ollama / 自定义，设置页一键切换，支持原生 function calling 与 JSON 模式双通道。
- **可靠性工程**：书级写队列 + 版本号乐观锁 + 请求可中断 + 三态五档模型思考开关 + 140 个单元测试 + golden eval 真实回归。

## 🚀 快速开始

需要 Node.js 18+。

```bash
# 安装依赖（server + client）
npm run install:all
```

### 开发模式

```bash
npm run dev:server   # 后端 http://localhost:3001
npm run dev:client   # 前端 http://localhost:5173
```

访问 `http://localhost:5173`。

### 生产模式

```bash
npm run build   # 构建前端到 client/dist
npm start       # 后端 3001 同时托管前端产物
```

访问 `http://localhost:3001`。

### 首次使用

- 测试账号：`admin / 123456`（首次启动自动创建）
- 模型配置：登录后进入 **设置 → 模型服务**，选择供应商、填入 API Key、获取模型列表并选择模型，保存后自动激活。

## 🔧 模型配置

模型服务在设置页管理，配置（含 API Key）保存在本地 `data/providers.json`（`data/` 已被 gitignore，不会提交到仓库）。

可选环境变量（创建 `.env` 文件）：

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 后端端口 | `3001` |
| `JWT_SECRET` | JWT 签名密钥（生产建议自定义） | `dev-secret` |

## 📁 目录结构

```
├─ client/          # React 前端（Vite 5）
│  └─ src/          # 页面、组件、路由、样式
├─ server/          # Express 后端（ESM）
│  └─ src/          # 路由、服务、Agent 架构、模型适配器
├─ data/            # 运行时数据（JSON，已 gitignore）
│  ├─ users.json    # 用户（bcrypt 密码哈希）
│  ├─ providers.json# 模型服务配置（含 API Key）
│  ├─ books/        # 已生成图书
│  └─ drafts/       # 构思中图书
└─ docs/            # 设计文档（已 gitignore）
```

## 🧪 测试

```bash
npm test        # 140 个单元测试（server）
npm run eval    # golden eval 真实模型回归（需运行中的后端 + 真实模型）
```

## 📄 文档

- `TARGET.md`：迭代目标与版本记录（本地维护，不入库）
- `SUMMARY.md`：项目详细概况与技术架构（本地维护，不入库）

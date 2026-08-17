# No-val 小说创作平台

一个可直接运行的本地小说创作 Web 应用。前端使用 React + Vite，后端使用 Express，数据以 JSON 文件持久化在 `data/` 目录。后端统一调用模型辅助创作（默认 DeepSeek，可在设置页“模型服务”接入其它 OpenAI 兼容模型，如 OpenAI / Ollama / 各类中转与本地模型）。

## 快速开始

安装依赖：

```bash
npm run install:all
```

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

测试账号：`admin / 123456`

## 项目文档

- `TARGET.md`：每轮更新的目标、待更新说明与版本记录。
- `SUMMARY.md`：项目详细概况、技术架构与版本更新说明。

模型配置：默认读取环境变量（参考 `.env.example`）；也可在设置页“模型服务”中添加/切换 provider（写入 `data/providers.json`）。

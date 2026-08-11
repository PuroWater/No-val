# Novel Agent 小说创作平台

一个可直接运行的本地小说创作 Web 应用。前端使用 React + Vite，后端使用 Express，数据以 JSON 文件持久化在 `data/` 目录。后端统一调用 DeepSeek 模型辅助创作，模型默认 `deepseek-v4-flash`。

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

配置 DeepSeek 密钥时，在项目根目录创建 `.env`，参考 `.env.example`。

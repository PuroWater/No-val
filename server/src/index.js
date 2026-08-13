import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { ENV_PATH, ROOT_DIR } from './config.js';
import { ensureInitialData } from './lib/bootstrap.js';
import authRouter from './routes/auth.js';
import booksRouter from './routes/books.js';
import chatRouter from './routes/chat.js';
import settingsRouter from './routes/settings.js';
import { recoverStaleProcessing } from './services/chatService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: ENV_PATH });

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/chat', chatRouter);
app.use('/api/settings', settingsRouter);

const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist');
app.use(express.static(CLIENT_DIST));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: '前端尚未构建，请先运行 npm run build' });
  });
});

app.use((req, res) => res.status(404).json({ error: `接口不存在: ${req.method} ${req.originalUrl}` }));

const port = Number(process.env.PORT || 3001);
await ensureInitialData();
recoverStaleProcessing();
const server = app.listen(port, () => {
  console.log(`Novel Agent server listening on http://localhost:${port}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，请先关闭占用该端口的进程，或通过 PORT 环境变量换一个端口。`);
  } else {
    console.error('服务器启动失败：', err);
  }
  process.exit(1);
});

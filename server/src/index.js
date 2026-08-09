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

app.use((req, res) => res.status(404).json({ error: `接口不存在: ${req.method} ${req.originalUrl}` }));

const port = Number(process.env.PORT || 3001);
await ensureInitialData();
app.listen(port, () => {
  console.log(`Novel Agent server listening on http://localhost:${port}`);
});

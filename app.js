import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import adminApi from './src/routes/admin/index.js';
import appApi from './src/routes/app/index.js';
import { errorHandler, notFound } from './src/middleware/errors.js';

dotenv.config();
const app = express();
const dirname = path.dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(dirname, 'uploads'), {
  acceptRanges: true,
  cacheControl: true,
  etag: true,
  immutable: true,
  maxAge: '7d',
}));
app.use('/api/v1/admin', adminApi);
app.use('/api/v1/app', appApi);
app.get('/', (_, res) => res.json({ success: true, message: 'VK English Academy API is running', data: null }));
app.use(notFound);
app.use(errorHandler);
export default app;

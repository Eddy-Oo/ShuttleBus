import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { prisma } from './prisma.js';
import { authRouter } from './http/auth-routes.js';
import { catalogRouter } from './http/catalog-routes.js';
import { createTripRouter } from './http/trip-routes.js';
import { errorHandler, sendSuccess } from './http/errors.js';
import type { Server } from 'socket.io';

export function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

export function createApp(io: Server) {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      console.error('Health check database query failed', error);
      return res.status(503).json({ success: false, error: 'Database unavailable', code: 'DATABASE_UNAVAILABLE', data: { status: 'degraded', database: 'error' } });
    }
    return sendSuccess(res, { status: 'ok', database: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', catalogRouter);
  app.use('/api', createTripRouter(io));

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found', code: 'NOT_FOUND' });
  });
  app.use(errorHandler);

  return app;
}

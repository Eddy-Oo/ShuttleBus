import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp, getAllowedOrigins } from './app.js';
import { attachRealtimeHandlers } from './realtime/socket.js';
import { prisma } from './prisma.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters');
}

const io = new Server({
  cors: {
    origin: getAllowedOrigins().includes('*') ? '*' : getAllowedOrigins(),
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 32 * 1024,
  pingInterval: 25000,
  pingTimeout: 20000,
});

const app = createApp(io);
const httpServer = createServer(app);
io.attach(httpServer);
attachRealtimeHandlers(io);


await prisma.$connect();
httpServer.listen(port, '0.0.0.0', () => {
  console.info(`ShuttleTrack API listening on 0.0.0.0:${port}`);
});

function shutdown(signal: string) {
  console.info(`${signal} received; shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10000).unref();
  io.close(async () => {
    clearTimeout(forceExit);
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

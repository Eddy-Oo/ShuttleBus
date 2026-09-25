import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { compare } from 'bcryptjs';
import { prisma } from '../prisma.js';
import { createAdminToken, createVehicleToken } from '../auth/tokens.js';
import { authenticate, requireAdmin } from '../auth/middleware.js';
import { ApiError, sendSuccess } from './errors.js';
import { adminLoginSchema, vehicleLoginSchema } from '../validation/schemas.js';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ success: false, error: 'Too many login attempts; try again later', code: 'RATE_LIMITED' });
  },
});

export const authRouter = Router();

authRouter.post('/admin/login', loginLimiter, async (req, res) => {
  const input = adminLoginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { username: input.username } });
  if (!user || user.role !== 'ADMIN' || !(await compare(input.password, user.passwordHash))) {
    throw new ApiError(401, 'Invalid username or password', 'INVALID_CREDENTIALS');
  }

  const token = createAdminToken({ id: user.id, username: user.username, role: user.role });
  return sendSuccess(res, {
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

authRouter.post('/vehicle/login', loginLimiter, async (req, res) => {
  const input = vehicleLoginSchema.parse(req.body);
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true, name: true, status: true, deviceTokenHash: true, tokenVersion: true },
  });
  if (!vehicle || vehicle.status !== 'active' || !vehicle.deviceTokenHash || !(await compare(input.deviceToken, vehicle.deviceTokenHash))) {
    throw new ApiError(401, 'Invalid vehicle credentials', 'INVALID_CREDENTIALS');
  }

  const token = createVehicleToken(vehicle.id, vehicle.tokenVersion);
  return sendSuccess(res, {
    token,
    vehicle: { id: vehicle.id, name: vehicle.name },
  });
});

authRouter.get('/me', authenticate, requireAdmin, (req, res) => {
  return sendSuccess(res, { id: req.auth!.sub, username: req.auth!.role === 'VEHICLE' ? undefined : req.auth!.username, role: req.auth!.role });
});

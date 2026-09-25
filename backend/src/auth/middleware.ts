import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { verifyToken, type AuthPrincipal } from './tokens.js';

async function findPrincipal(token: string): Promise<AuthPrincipal | null> {
  let principal: AuthPrincipal;
  try {
    principal = verifyToken(token);
  } catch {
    return null;
  }

  if (principal.role === 'VEHICLE') {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: principal.vehicleId },
      select: { status: true, tokenVersion: true },
    });
    if (!vehicle || vehicle.status !== 'active' || vehicle.tokenVersion !== principal.tokenVersion) return null;
  }
  return principal;
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
    return;
  }

  try {
    const principal = await findPrincipal(token);
    if (!principal) {
      res.status(401).json({ success: false, error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      return;
    }
    req.auth = principal;
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    next();
    return;
  }

  try {
    const principal = await findPrincipal(token);
    if (!principal) {
      res.status(401).json({ success: false, error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      return;
    }
    req.auth = principal;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: AuthPrincipal['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireVehicle = requireRole('VEHICLE');

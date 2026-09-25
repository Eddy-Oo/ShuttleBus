import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

export type AuthPrincipal =
  | { sub: string; role: 'ADMIN' | 'VIEWER'; username: string }
  | { sub: string; role: 'VEHICLE'; vehicleId: string; tokenVersion: number };

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters');
  }
  return value;
}

function ttl(kind: 'admin' | 'vehicle'): SignOptions['expiresIn'] {
  return kind === 'admin'
    ? (process.env.JWT_ADMIN_TTL || '12h') as SignOptions['expiresIn']
    : (process.env.JWT_VEHICLE_TTL || '30d') as SignOptions['expiresIn'];
}

export function createAdminToken(user: { id: string; username: string; role: 'ADMIN' | 'VIEWER' }): string {
  return jwt.sign({ role: user.role, username: user.username }, secret(), {
    subject: user.id,
    expiresIn: ttl('admin'),
  });
}

export function createVehicleToken(vehicleId: string, tokenVersion: number): string {
  return jwt.sign({ role: 'VEHICLE', vehicleId, tokenVersion }, secret(), {
    subject: vehicleId,
    expiresIn: ttl('vehicle'),
  });
}

export function verifyToken(token: string): AuthPrincipal {
  const claims = jwt.verify(token, secret()) as JwtPayload & Record<string, unknown>;
  if (claims.role === 'VEHICLE' && typeof claims.vehicleId === 'string' && Number.isInteger(claims.tokenVersion)) {
    return { sub: claims.sub as string, role: 'VEHICLE', vehicleId: claims.vehicleId, tokenVersion: claims.tokenVersion as number };
  }
  if ((claims.role === 'ADMIN' || claims.role === 'VIEWER') && typeof claims.username === 'string') {
    return { sub: claims.sub as string, role: claims.role, username: claims.username };
  }
  throw new Error('Invalid token claims');
}

import { afterEach, describe, expect, it } from 'vitest';
import { createAdminToken, createVehicleToken, verifyToken } from './tokens.js';

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe('JWT authentication tokens', () => {
  it('round-trips admin identity and role', () => {
    process.env.JWT_SECRET = 'a-test-secret-that-is-long-enough-for-hmac';
    const token = createAdminToken({ id: 'user-1', username: 'admin', role: 'ADMIN' });
    expect(verifyToken(token)).toMatchObject({ sub: 'user-1', username: 'admin', role: 'ADMIN' });
  });

  it('binds vehicle tokens to one vehicle ID', () => {
    process.env.JWT_SECRET = 'a-test-secret-that-is-long-enough-for-hmac';
    const token = createVehicleToken('vehicle-1', 3);
    expect(verifyToken(token)).toMatchObject({ sub: 'vehicle-1', vehicleId: 'vehicle-1', role: 'VEHICLE', tokenVersion: 3 });
  });

  it('requires a strong configured secret', () => {
    process.env.JWT_SECRET = 'short';
    expect(() => createVehicleToken('vehicle-1', 0)).toThrow(/at least 32 characters/);
  });
});

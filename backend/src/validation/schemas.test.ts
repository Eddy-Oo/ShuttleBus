import { describe, expect, it } from 'vitest';
import {
  routeCreateSchema,
  routeGeometrySchema,
  routeStopCreateSchema,
  stopCreateSchema,
  vehicleLocationSchema,
} from './schemas.js';

describe('API validation schemas', () => {
  it('accepts GeoJSON LineString coordinates as longitude/latitude pairs', () => {
    expect(routeGeometrySchema.safeParse({
      type: 'LineString',
      coordinates: [[100.65, 14.03], [100.66, 14.04]],
    }).success).toBe(true);
  });

  it('rejects malformed route geometry and out-of-range coordinates', () => {
    expect(routeGeometrySchema.safeParse({ type: 'LineString', coordinates: [[100, 14]] }).success).toBe(false);
    expect(routeGeometrySchema.safeParse({ type: 'LineString', coordinates: [[181, 14], [100, 15]] }).success).toBe(false);
  });

  it('rejects invalid stop coordinates and empty route names', () => {
    expect(stopCreateSchema.safeParse({ nameTh: 'Gate', latitude: 91, longitude: 100 }).success).toBe(false);
    expect(routeCreateSchema.safeParse({ name: ' ', color: '#2563EB' }).success).toBe(false);
  });

  it('validates location updates and ordered RouteStop data', () => {
    expect(vehicleLocationSchema.safeParse({ vehicleId: 'bus-1', latitude: 14.03, longitude: 100.65 }).success).toBe(true);
    expect(vehicleLocationSchema.safeParse({ vehicleId: 'bus-1', latitude: 91, longitude: 100 }).success).toBe(false);
    expect(routeStopCreateSchema.safeParse({ stopId: 'stop-1', stopOrder: 0 }).success).toBe(false);
    expect(routeStopCreateSchema.safeParse({ stopId: 'stop-1', stopOrder: 1 }).success).toBe(true);
  });
});

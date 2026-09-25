export const REALTIME_EVENTS = {
  vehicleLocationUpdate: 'vehicle:location:update',
  vehicleLocationSnapshot: 'vehicle:location:snapshot',
  tripStarted: 'trip:started',
  tripEnded: 'trip:ended',
} as const;

export interface VehicleLocationUpdate {
  vehicleId: string;
  vehicleName?: string;
  tripId?: string | null;
  routeId?: string | null;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  recordedAt?: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Validate untrusted Socket.IO payloads before they reach the UI or map. */
export function parseVehicleLocation(value: unknown): VehicleLocationUpdate | null {
  if (!value || typeof value !== 'object') return null;

  const payload = value as Record<string, unknown>;
  if (typeof payload.vehicleId !== 'string' || payload.vehicleId.trim().length === 0) return null;
  if (!isFiniteNumber(payload.latitude) || payload.latitude < -90 || payload.latitude > 90) return null;
  if (!isFiniteNumber(payload.longitude) || payload.longitude < -180 || payload.longitude > 180) return null;
  if (payload.speed !== undefined && payload.speed !== null && (!isFiniteNumber(payload.speed) || payload.speed < 0)) return null;
  if (payload.heading !== undefined && payload.heading !== null && (!isFiniteNumber(payload.heading) || payload.heading < 0 || payload.heading > 360)) return null;
  if (payload.tripId !== undefined && payload.tripId !== null && typeof payload.tripId !== 'string') return null;
  if (payload.recordedAt !== undefined && typeof payload.recordedAt !== 'string') return null;
  if (payload.routeId !== undefined && payload.routeId !== null && typeof payload.routeId !== 'string') return null;
  if (payload.vehicleName !== undefined && typeof payload.vehicleName !== 'string') return null;

  return {
    vehicleId: payload.vehicleId.trim(),
    ...(payload.vehicleName !== undefined ? { vehicleName: payload.vehicleName as string } : {}),
    ...(payload.tripId !== undefined ? { tripId: payload.tripId as string | null } : {}),
    ...(payload.routeId !== undefined ? { routeId: payload.routeId as string | null } : {}),
    latitude: payload.latitude,
    longitude: payload.longitude,
    ...(payload.speed !== undefined ? { speed: payload.speed as number | null } : {}),
    ...(payload.heading !== undefined ? { heading: payload.heading as number | null } : {}),
    ...(payload.recordedAt !== undefined ? { recordedAt: payload.recordedAt as string } : {}),
  };
}

/** A snapshot is sent by the server on connection; malformed entries are ignored. */
export function parseVehicleLocationSnapshot(value: unknown): VehicleLocationUpdate[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map(parseVehicleLocation)
    .filter((location): location is VehicleLocationUpdate => location !== null);
}

/** Extract the vehicle ID from a trip:started / trip:ended payload. */
export function parseTripVehicleId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const vehicleId = (value as Record<string, unknown>).vehicleId;
  return typeof vehicleId === 'string' && vehicleId.trim() ? vehicleId.trim() : null;
}

import { describe, expect, it } from 'vitest';
import { parseTripVehicleId, parseVehicleLocation, parseVehicleLocationSnapshot } from '../realtime/contracts';

describe('Socket.IO vehicle location contract', () => {
  it('accepts a valid GPS update and trims the vehicle ID', () => {
    expect(parseVehicleLocation({
      vehicleId: ' bus-7 ',
      tripId: 'trip-1',
      latitude: 14.032,
      longitude: 100.651,
      speed: 12.5,
      heading: 90,
      recordedAt: '2026-09-25T10:00:00.000Z',
    })).toEqual({
      vehicleId: 'bus-7',
      tripId: 'trip-1',
      latitude: 14.032,
      longitude: 100.651,
      speed: 12.5,
      heading: 90,
      recordedAt: '2026-09-25T10:00:00.000Z',
    });
  });

  it.each([
    { vehicleId: '', latitude: 14, longitude: 100 },
    { vehicleId: 'bus-1', latitude: 91, longitude: 100 },
    { vehicleId: 'bus-1', latitude: 14, longitude: -181 },
    { vehicleId: 'bus-1', latitude: Number.NaN, longitude: 100 },
    { vehicleId: 'bus-1', latitude: 14, longitude: 100, speed: -1 },
    { vehicleId: 'bus-1', latitude: 14, longitude: 100, heading: 361 },
  ])('rejects invalid location payloads: %o', payload => {
    expect(parseVehicleLocation(payload)).toBeNull();
  });

  it('filters invalid entries in a server snapshot and rejects non-array snapshots', () => {
    expect(parseVehicleLocationSnapshot([
      { vehicleId: 'bus-1', latitude: 14, longitude: 100 },
      { vehicleId: 'bus-2', latitude: 100, longitude: 100 },
    ])).toEqual([{ vehicleId: 'bus-1', latitude: 14, longitude: 100 }]);
    expect(parseVehicleLocationSnapshot({ vehicles: [] })).toBeNull();
  });

  it('keeps routeId and vehicleName so maps can filter and label markers', () => {
    expect(parseVehicleLocation({ vehicleId: 'v-1', vehicleName: 'Bus 01', routeId: 'route-1', latitude: 14, longitude: 100 }))
      .toEqual({ vehicleId: 'v-1', vehicleName: 'Bus 01', routeId: 'route-1', latitude: 14, longitude: 100 });
    expect(parseVehicleLocation({ vehicleId: 'v-1', routeId: 5, latitude: 14, longitude: 100 })).toBeNull();
    expect(parseVehicleLocation({ vehicleId: 'v-1', vehicleName: {}, latitude: 14, longitude: 100 })).toBeNull();
  });

  it('extracts the vehicle from trip lifecycle events', () => {
    expect(parseTripVehicleId({ id: 't-1', vehicleId: ' v-2 ', status: 'completed' })).toBe('v-2');
    expect(parseTripVehicleId({ id: 't-1' })).toBeNull();
    expect(parseTripVehicleId(null)).toBeNull();
  });
});

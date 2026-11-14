import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { Server } from 'socket.io';
import { prisma } from '../prisma.js';
import { authenticate, requireVehicle } from '../auth/middleware.js';
import { ApiError, sendSuccess } from './errors.js';
import { vehicleLocationSchema } from '../validation/schemas.js';

/**
 * HTTP ingestion endpoint for GPS hardware such as an ESP32.
 * The device authenticates with the same per-vehicle JWT used by the mobile app.
 */
export function createVehicleLocationRouter(io: Server) {
  const router = Router();

  // The Things Stack webhook. Map each TTS end-device ID to a ShuttleTrack vehicle ID
  // with LORAWAN_DEVICE_MAP and protect this endpoint with LORAWAN_WEBHOOK_SECRET.
  router.post('/lorawan/uplink', async (req, res) => {
    const secret = process.env.LORAWAN_WEBHOOK_SECRET ?? '';
    const supplied = req.get('authorization') ?? '';
    const expected = `Bearer ${secret}`;
    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (!secret || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
      throw new ApiError(401, 'Invalid LoRaWAN webhook credentials', 'LORAWAN_UNAUTHORIZED');
    }

    let deviceMap: Record<string, string>;
    try {
      deviceMap = JSON.parse(process.env.LORAWAN_DEVICE_MAP ?? '{}') as Record<string, string>;
    } catch {
      throw new ApiError(500, 'LORAWAN_DEVICE_MAP must be valid JSON', 'LORAWAN_CONFIG_ERROR');
    }

    const body = req.body as {
      end_device_ids?: { device_id?: unknown };
      received_at?: unknown;
      uplink_message?: { decoded_payload?: Record<string, unknown> };
    };
    const ttnDeviceId = typeof body?.end_device_ids?.device_id === 'string'
      ? body.end_device_ids.device_id
      : '';
    const vehicleId = deviceMap[ttnDeviceId];
    if (!ttnDeviceId || !vehicleId) {
      throw new ApiError(400, 'LoRaWAN device is not mapped to a ShuttleTrack vehicle', 'LORAWAN_DEVICE_NOT_MAPPED');
    }

    const decoded = body.uplink_message?.decoded_payload;
    const latitude = decoded?.latitude;
    const longitude = decoded?.longitude;
    const speed = decoded?.speed;
    const heading = decoded?.heading;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ApiError(400, 'LoRaWAN decoded_payload must contain numeric latitude and longitude', 'LORAWAN_INVALID_PAYLOAD');
    }

    const recordedAt = typeof body.received_at === 'string' ? new Date(body.received_at) : new Date();
    if (!Number.isFinite(recordedAt.getTime()) || recordedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new ApiError(400, 'Invalid LoRaWAN received_at timestamp', 'INVALID_TIMESTAMP');
    }
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, name: true, status: true, assignedRouteId: true },
    });
    if (!vehicle || vehicle.status !== 'active') {
      throw new ApiError(403, 'Mapped vehicle is not active', 'VEHICLE_INACTIVE');
    }
    const activeTrip = await prisma.trip.findFirst({
      where: { vehicleId, status: 'active' },
      select: { id: true, routeId: true },
    });
    const tripId = activeTrip?.id ?? null;
    const routeId = activeTrip?.routeId ?? vehicle.assignedRouteId;
    const numericSpeed = typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed : null;
    const numericHeading = typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 && heading <= 360 ? heading : null;

    await prisma.$transaction(async tx => {
      const updated = await tx.vehicle.updateMany({
        where: {
          id: vehicleId,
          status: 'active',
          OR: [{ lastLocationAt: null }, { lastLocationAt: { lte: recordedAt } }],
        },
        data: {
          currentLatitude: latitude,
          currentLongitude: longitude,
          currentSpeed: numericSpeed,
          currentHeading: numericHeading,
          lastLocationAt: recordedAt,
        },
      });
      if (updated.count !== 1) {
        throw new ApiError(409, 'LoRaWAN location is stale', 'STALE_LOCATION');
      }
      await tx.vehicleLocation.create({
        data: {
          vehicleId,
          tripId,
          latitude,
          longitude,
          speed: numericSpeed,
          heading: numericHeading,
          source: 'LORAWAN',
          deviceId: ttnDeviceId,
          recordedAt,
        },
      });
    });

    const update = {
      vehicleId,
      vehicleName: vehicle.name,
      tripId,
      routeId,
      latitude,
      longitude,
      ...(numericSpeed !== null ? { speed: numericSpeed } : {}),
      ...(numericHeading !== null ? { heading: numericHeading } : {}),
      source: 'LORAWAN',
      deviceId: ttnDeviceId,
      recordedAt: recordedAt.toISOString(),
    };
    io.to('web').emit('vehicle:location:update', update);
    return sendSuccess(res, update, 201, 'LoRaWAN GPS location received');
  });

  router.post('/vehicle/location', authenticate, requireVehicle, async (req, res) => {
    const input = vehicleLocationSchema.parse(req.body);
    const vehicleId = req.auth!.role === 'VEHICLE' ? req.auth!.vehicleId : '';
    const tokenVersion = req.auth!.role === 'VEHICLE' ? req.auth!.tokenVersion : -1;

    if (vehicleId !== input.vehicleId) {
      throw new ApiError(403, 'Token does not belong to this vehicle', 'VEHICLE_MISMATCH');
    }

    if (input.source && input.source !== 'ESP32') {
      throw new ApiError(400, 'This endpoint is reserved for ESP32 GPS devices', 'INVALID_GPS_SOURCE');
    }
    const source = 'ESP32' as const;
    const deviceId = input.deviceId ?? `esp32-${vehicleId}`;
    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
    if (recordedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new ApiError(400, 'Location timestamp is too far in the future', 'INVALID_TIMESTAMP');
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, name: true, status: true, tokenVersion: true, assignedRouteId: true },
    });
    if (!vehicle || vehicle.status !== 'active') {
      throw new ApiError(403, 'Vehicle is not active', 'VEHICLE_INACTIVE');
    }
    if (vehicle.tokenVersion !== tokenVersion) {
      throw new ApiError(403, 'Vehicle token has been revoked', 'TOKEN_REVOKED');
    }

    let tripId = input.tripId ?? null;
    let routeId: string | null = vehicle.assignedRouteId;
    if (tripId) {
      const trip = await prisma.trip.findFirst({
        where: { id: tripId, vehicleId, status: 'active' },
        select: { id: true, routeId: true },
      });
      if (!trip) throw new ApiError(409, 'Trip is not active for this vehicle', 'INVALID_TRIP');
      routeId = trip.routeId;
    } else {
      const activeTrip = await prisma.trip.findFirst({
        where: { vehicleId, status: 'active' },
        select: { id: true, routeId: true },
      });
      tripId = activeTrip?.id ?? null;
      if (activeTrip) routeId = activeTrip.routeId;
    }

    await prisma.$transaction(async tx => {
      if (tripId) {
        const activeTrip = await tx.trip.findFirst({
          where: { id: tripId, vehicleId, status: 'active' },
          select: { id: true },
        });
        if (!activeTrip) throw new ApiError(409, 'Trip is no longer active for this vehicle', 'INVALID_TRIP');
      }

      const updated = await tx.vehicle.updateMany({
        where: {
          id: vehicleId,
          status: 'active',
          tokenVersion,
          OR: [{ lastLocationAt: null }, { lastLocationAt: { lte: recordedAt } }],
        },
        data: {
          currentLatitude: input.latitude,
          currentLongitude: input.longitude,
          currentSpeed: input.speed ?? null,
          currentHeading: input.heading ?? null,
          lastLocationAt: recordedAt,
        },
      });
      if (updated.count !== 1) {
        throw new ApiError(409, 'Location is stale or vehicle credentials were revoked', 'STALE_LOCATION');
      }

      await tx.vehicleLocation.create({
        data: {
          vehicleId,
          tripId,
          latitude: input.latitude,
          longitude: input.longitude,
          speed: input.speed ?? null,
          heading: input.heading ?? null,
          source,
          deviceId,
          recordedAt,
        },
      });
    });

    const update = {
      vehicleId,
      vehicleName: vehicle.name,
      tripId,
      routeId,
      latitude: input.latitude,
      longitude: input.longitude,
      ...(input.speed !== undefined ? { speed: input.speed } : {}),
      ...(input.heading !== undefined ? { heading: input.heading } : {}),
      source,
      deviceId,
      recordedAt: recordedAt.toISOString(),
    };

    io.to('web').emit('vehicle:location:update', update);
    return sendSuccess(res, update, 201, 'ESP32 GPS location received');
  });

  return router;
}

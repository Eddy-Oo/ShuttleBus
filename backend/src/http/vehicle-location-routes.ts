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

  router.post('/vehicle/location', authenticate, requireVehicle, async (req, res) => {
    const input = vehicleLocationSchema.parse(req.body);
    const vehicleId = req.auth!.role === 'VEHICLE' ? req.auth!.vehicleId : '';
    const tokenVersion = req.auth!.role === 'VEHICLE' ? req.auth!.tokenVersion : -1;

    if (vehicleId !== input.vehicleId) {
      throw new ApiError(403, 'Token does not belong to this vehicle', 'VEHICLE_MISMATCH');
    }

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
      recordedAt: recordedAt.toISOString(),
    };

    io.to('web').emit('vehicle:location:update', update);
    return sendSuccess(res, update, 201, 'ESP32 GPS location received');
  });

  return router;
}

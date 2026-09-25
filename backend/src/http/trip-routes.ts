import { Router } from 'express';
import type { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { authenticate, requireAdmin, requireVehicle } from '../auth/middleware.js';
import { ApiError, sendSuccess } from './errors.js';
import { startTripSchema } from '../validation/schemas.js';

function pathId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(400, 'Invalid resource ID', 'INVALID_ID');
  }
  return value;
}

const tripInclude = {
  vehicle: { select: { id: true, name: true, type: true, status: true } },
  route: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TripInclude;

export function createTripRouter(io: Server) {
  const router = Router();

  router.get('/trips/active', authenticate, requireAdmin, async (_req, res) => {
    const trips = await prisma.trip.findMany({
      where: { status: 'active' },
      include: tripInclude,
      orderBy: { startedAt: 'desc' },
    });
    return sendSuccess(res, trips);
  });

  router.post('/trips/start', authenticate, requireVehicle, async (req, res) => {
    const input = startTripSchema.parse(req.body);
    const vehicleId = req.auth!.role === 'VEHICLE' ? req.auth!.vehicleId : '';
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new ApiError(404, 'Vehicle not found', 'NOT_FOUND');
    if (vehicle.status !== 'active') throw new ApiError(409, 'Vehicle is not active', 'VEHICLE_INACTIVE');
    if (vehicle.assignedRouteId && vehicle.assignedRouteId !== input.routeId) {
      throw new ApiError(409, 'Vehicle is assigned to a different route', 'ROUTE_ASSIGNMENT_MISMATCH');
    }
    const route = await prisma.route.findUnique({ where: { id: input.routeId } });
    if (!route || route.status !== 'active') throw new ApiError(404, 'Active route not found', 'NOT_FOUND');

    // The partial unique index "Trip_one_active_per_vehicle_idx" guarantees one active trip per
    // vehicle even under concurrent requests, without serializable-isolation false conflicts.
    let trip;
    try {
      trip = await prisma.trip.create({ data: { vehicleId, routeId: route.id }, include: tripInclude });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(409, 'Vehicle already has an active trip', 'TRIP_ALREADY_ACTIVE');
      }
      throw error;
    }

    io.to('web').emit('trip:started', trip);
    return sendSuccess(res, trip, 201, 'Trip started');
  });

  router.post('/trips/:id/end', authenticate, async (req, res) => {
    const tripId = pathId(req.params.id);
    const current = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!current) throw new ApiError(404, 'Trip not found', 'NOT_FOUND');
    const principal = req.auth!;
    if (principal.role !== 'ADMIN' && (principal.role !== 'VEHICLE' || principal.vehicleId !== current.vehicleId)) {
      throw new ApiError(403, 'Only the assigned vehicle or an admin can end this trip', 'FORBIDDEN');
    }
    if (current.status !== 'active') throw new ApiError(409, 'Trip is already completed', 'TRIP_ALREADY_ENDED');

    // Conditional update so two concurrent "end" calls cannot both succeed.
    const ended = await prisma.trip.updateMany({
      where: { id: current.id, status: 'active' },
      data: { status: 'completed', endedAt: new Date() },
    });
    if (ended.count !== 1) throw new ApiError(409, 'Trip is already completed', 'TRIP_ALREADY_ENDED');
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: current.id }, include: tripInclude });
    io.to('web').emit('trip:ended', trip);
    return sendSuccess(res, trip, 200, 'Trip ended');
  });

  return router;
}

import { Server, type Socket } from 'socket.io';
import { prisma } from '../prisma.js';
import { verifyToken, type AuthPrincipal } from '../auth/tokens.js';
import { ApiError } from '../http/errors.js';
import { vehicleLocationSchema } from '../validation/schemas.js';

interface RealtimeSocket extends Socket {
  data: Socket['data'] & { principal: AuthPrincipal | null };
}

type LocationAck = (result: { success: boolean; data?: unknown; error?: string; code?: string }) => void;

async function sendLocationSnapshot(socket: RealtimeSocket) {
  const vehicles = await prisma.vehicle.findMany({
    where: { status: 'active', currentLatitude: { not: null }, currentLongitude: { not: null }, trips: { some: { status: 'active' } } },
    select: {
      id: true,
      name: true,
      assignedRouteId: true,
      currentLatitude: true,
      currentLongitude: true,
      currentSpeed: true,
      currentHeading: true,
      lastLocationAt: true,
      trips: { where: { status: 'active' }, select: { id: true, routeId: true }, take: 1 },
    },
  });
  socket.emit('vehicle:location:snapshot', vehicles.map(vehicle => ({
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    tripId: vehicle.trips[0]?.id ?? null,
    routeId: vehicle.trips[0]?.routeId ?? vehicle.assignedRouteId,
    latitude: vehicle.currentLatitude!,
    longitude: vehicle.currentLongitude!,
    ...(vehicle.currentSpeed !== null ? { speed: vehicle.currentSpeed } : {}),
    ...(vehicle.currentHeading !== null ? { heading: vehicle.currentHeading } : {}),
    ...(vehicle.lastLocationAt ? { recordedAt: vehicle.lastLocationAt.toISOString() } : {}),
  })));
}

async function handleLocationUpdate(io: Server, socket: RealtimeSocket, payload: unknown, acknowledge?: LocationAck) {
  const ack = typeof acknowledge === 'function' ? acknowledge : () => undefined;
  try {
    const principal = socket.data.principal;
    if (!principal || principal.role !== 'VEHICLE') {
      throw new ApiError(403, 'Only authenticated vehicle clients can publish locations', 'VEHICLE_AUTH_REQUIRED');
    }

    // Socket handshakes are long-lived: enforce JWT expiry on every publish too.
    try {
      verifyToken(socket.handshake.auth.token as string);
    } catch {
      throw new ApiError(401, 'Vehicle token has expired; log in again', 'INVALID_TOKEN');
    }

    const parsed = vehicleLocationSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid vehicle location payload', 'VALIDATION_ERROR', parsed.error.issues);
    }
    const input = parsed.data;
    if (principal.vehicleId !== input.vehicleId) {
      throw new ApiError(403, 'Token does not belong to this vehicle', 'VEHICLE_MISMATCH');
    }

    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
    if (recordedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new ApiError(400, 'Location timestamp is too far in the future', 'INVALID_TIMESTAMP');
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true, name: true, status: true, tokenVersion: true, assignedRouteId: true } });
    if (!vehicle || vehicle.status !== 'active') {
      throw new ApiError(403, 'Vehicle is not active', 'VEHICLE_INACTIVE');
    }
    if (vehicle.tokenVersion !== principal.tokenVersion) {
      throw new ApiError(403, 'Vehicle token has been revoked', 'TOKEN_REVOKED');
    }

    let tripId = input.tripId ?? null;
    let routeId: string | null = vehicle.assignedRouteId;
    if (tripId) {
      const trip = await prisma.trip.findFirst({ where: { id: tripId, vehicleId: vehicle.id, status: 'active' }, select: { id: true, routeId: true } });
      if (!trip) throw new ApiError(409, 'Trip is not active for this vehicle', 'INVALID_TRIP');
      routeId = trip.routeId;
    } else {
      const activeTrip = await prisma.trip.findFirst({ where: { vehicleId: vehicle.id, status: 'active' }, select: { id: true, routeId: true } });
      tripId = activeTrip?.id ?? null;
      if (activeTrip) routeId = activeTrip.routeId;
    }

    const locationData = {
      vehicleId: vehicle.id,
      tripId,
      latitude: input.latitude,
      longitude: input.longitude,
      speed: input.speed ?? null,
      heading: input.heading ?? null,
      recordedAt,
    };
    await prisma.$transaction(async tx => {
      if (tripId) {
        const activeTrip = await tx.trip.findFirst({
          where: { id: tripId, vehicleId: vehicle.id, status: 'active' },
          select: { id: true },
        });
        if (!activeTrip) throw new ApiError(409, 'Trip is no longer active for this vehicle', 'INVALID_TRIP');
      }

      const updated = await tx.vehicle.updateMany({
        where: {
          id: vehicle.id,
          status: 'active',
          tokenVersion: principal.tokenVersion,
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
      await tx.vehicleLocation.create({ data: locationData });
    });

    const update = {
      vehicleId: vehicle.id,
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
    ack({ success: true, data: update });
  } catch (error) {
    if (error instanceof ApiError) {
      ack({ success: false, error: error.message, code: error.code });
      return;
    }
    console.error('Vehicle location update failed', error);
    ack({ success: false, error: 'Unable to store vehicle location', code: 'LOCATION_STORE_FAILED' });
  }
}

export function attachRealtimeHandlers(io: Server) {
  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : '';
    if (!token) {
      socket.data.principal = null;
      next();
      return;
    }

    try {
      const principal = verifyToken(token);
      if (principal.role === 'VEHICLE') {
        const vehicle = await prisma.vehicle.findUnique({
          where: { id: principal.vehicleId },
          select: { status: true, tokenVersion: true },
        });
        if (!vehicle || vehicle.status !== 'active' || vehicle.tokenVersion !== principal.tokenVersion) {
          next(new Error('Vehicle token is invalid or revoked'));
          return;
        }
      }
      socket.data.principal = principal;
      next();
    } catch {
      next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', socket => {
    const realtimeSocket = socket as RealtimeSocket;
    if (realtimeSocket.data.principal?.role !== 'VEHICLE') {
      realtimeSocket.join('web');
      void sendLocationSnapshot(realtimeSocket).catch(error => {
        console.error('Could not send vehicle snapshot', error);
      });
    }
    realtimeSocket.on('vehicle:location:update', (payload: unknown, ack?: LocationAck) => {
      void handleLocationUpdate(io, realtimeSocket, payload, ack);
    });
  });
}

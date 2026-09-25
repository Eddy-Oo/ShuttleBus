import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { authenticate, optionalAuthenticate, requireAdmin, requireVehicle } from '../auth/middleware.js';
import { ApiError, sendSuccess } from './errors.js';
import {
  routeCreateSchema,
  routeStopCreateSchema,
  routeStopOrderSchema,
  routeUpdateSchema,
  stopCreateSchema,
  stopUpdateSchema,
  vehicleCreateSchema,
  vehicleUpdateSchema,
} from '../validation/schemas.js';

const vehicleSelect = {
  id: true,
  name: true,
  type: true,
  assignedRouteId: true,
  status: true,
  currentLatitude: true,
  currentLongitude: true,
  currentSpeed: true,
  currentHeading: true,
  lastLocationAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VehicleSelect;

type Tx = Prisma.TransactionClient;

function pathId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(400, 'Invalid resource ID', 'INVALID_ID');
  }
  return value;
}

async function reorderRouteStops(tx: Tx, routeId: string, orderedIds: string[]) {
  const rows = await tx.routeStop.findMany({ where: { routeId }, select: { id: true, stopOrder: true } });
  const offset = Math.max(0, ...rows.map(row => row.stopOrder)) + rows.length + 10;

  // Move all existing values out of the 1..N range before assigning contiguous positions.
  for (let index = 0; index < rows.length; index += 1) {
    await tx.routeStop.update({
      where: { id: rows[index]!.id },
      data: { stopOrder: offset + index },
    });
  }
  for (let index = 0; index < orderedIds.length; index += 1) {
    await tx.routeStop.update({
      where: { id: orderedIds[index]! },
      data: { stopOrder: index + 1 },
    });
  }
}

async function assertRouteExists(routeId: string | null | undefined) {
  if (!routeId) return;
  const route = await prisma.route.findUnique({ where: { id: routeId }, select: { id: true } });
  if (!route) {
    throw new ApiError(400, 'assignedRouteId does not reference an existing route', 'INVALID_REFERENCE', [
      { path: 'assignedRouteId', message: 'Route not found' },
    ]);
  }
}

export const catalogRouter = Router();

// Public route/stop reads; inactive resources are visible only to an admin.
catalogRouter.get('/routes', optionalAuthenticate, async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  if (includeInactive && (!req.auth || req.auth.role !== 'ADMIN')) {
    throw new ApiError(403, 'Admin access required to include inactive routes', 'FORBIDDEN');
  }
  const routes = await prisma.route.findMany({
    where: includeInactive ? {} : { status: 'active' },
    orderBy: { createdAt: 'asc' },
    include: { routeStops: { orderBy: { stopOrder: 'asc' }, include: { stop: true } } },
  });
  const result = includeInactive
    ? routes
    : routes.map(route => ({
        ...route,
        routeStops: route.routeStops.filter(item => item.stop.status === 'active'),
      }));
  return sendSuccess(res, result);
});

catalogRouter.get('/routes/:id', optionalAuthenticate, async (req, res) => {
  const routeId = pathId(req.params.id);
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: { routeStops: { orderBy: { stopOrder: 'asc' }, include: { stop: true } } },
  });
  if (!route || (route.status !== 'active' && req.auth?.role !== 'ADMIN')) {
    throw new ApiError(404, 'Route not found', 'NOT_FOUND');
  }
  return sendSuccess(res, route);
});

catalogRouter.get('/routes/:id/stops', optionalAuthenticate, async (req, res) => {
  const routeId = pathId(req.params.id);
  const route = await prisma.route.findUnique({ where: { id: routeId }, select: { id: true, status: true } });
  if (!route || (route.status !== 'active' && req.auth?.role !== 'ADMIN')) {
    throw new ApiError(404, 'Route not found', 'NOT_FOUND');
  }
  const routeStops = await prisma.routeStop.findMany({
    where: { routeId: route.id, ...(req.auth?.role === 'ADMIN' ? {} : { stop: { status: 'active' } }) },
    orderBy: { stopOrder: 'asc' },
    include: { stop: true, route: true },
  });
  return sendSuccess(res, routeStops);
});

catalogRouter.post('/routes', authenticate, requireAdmin, async (req, res) => {
  const input = routeCreateSchema.parse(req.body);
  const geometry = input.geometry === undefined
    ? undefined
    : input.geometry === null
      ? Prisma.JsonNull
      : input.geometry as Prisma.InputJsonValue;
  const route = await prisma.route.create({
    data: {
      name: input.name,
      ...(input.color ? { color: input.color } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(geometry !== undefined ? { geometry } : {}),
    },
  });
  return sendSuccess(res, route, 201, 'Route created');
});

catalogRouter.patch('/routes/:id', authenticate, requireAdmin, async (req, res) => {
  const routeId = pathId(req.params.id);
  const input = routeUpdateSchema.parse(req.body);
  const geometry = input.geometry === undefined
    ? undefined
    : input.geometry === null
      ? Prisma.JsonNull
      : input.geometry as Prisma.InputJsonValue;
  const route = await prisma.route.update({
    where: { id: routeId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(geometry !== undefined ? { geometry } : {}),
    },
  });
  return sendSuccess(res, route, 200, 'Route updated');
});

catalogRouter.delete('/routes/:id', authenticate, requireAdmin, async (req, res) => {
  await prisma.route.delete({ where: { id: pathId(req.params.id) } });
  return sendSuccess(res, null, 200, 'Route deleted');
});

catalogRouter.get('/stops', optionalAuthenticate, async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  if (includeInactive && (!req.auth || req.auth.role !== 'ADMIN')) {
    throw new ApiError(403, 'Admin access required to include inactive stops', 'FORBIDDEN');
  }
  const stops = await prisma.stop.findMany({
    where: includeInactive ? {} : { status: 'active' },
    orderBy: { nameTh: 'asc' },
  });
  return sendSuccess(res, stops);
});

catalogRouter.get('/stops/:id', optionalAuthenticate, async (req, res) => {
  const stop = await prisma.stop.findUnique({ where: { id: pathId(req.params.id) } });
  if (!stop || (stop.status !== 'active' && req.auth?.role !== 'ADMIN')) {
    throw new ApiError(404, 'Stop not found', 'NOT_FOUND');
  }
  return sendSuccess(res, stop);
});

catalogRouter.post('/stops', authenticate, requireAdmin, async (req, res) => {
  const input = stopCreateSchema.parse(req.body);
  const stop = await prisma.stop.create({ data: input });
  return sendSuccess(res, stop, 201, 'Stop created');
});

catalogRouter.patch('/stops/:id', authenticate, requireAdmin, async (req, res) => {
  const input = stopUpdateSchema.parse(req.body);
  const stop = await prisma.stop.update({ where: { id: pathId(req.params.id) }, data: input });
  return sendSuccess(res, stop, 200, 'Stop updated');
});

catalogRouter.delete('/stops/:id', authenticate, requireAdmin, async (req, res) => {
  const stopId = pathId(req.params.id);
  await prisma.$transaction(async tx => {
    const memberships = await tx.routeStop.findMany({ where: { stopId }, select: { routeId: true } });
    await tx.stop.delete({ where: { id: stopId } });
    // RouteStops cascade with the stop; close the gaps they leave in each route's stopOrder.
    for (const routeId of new Set(memberships.map(row => row.routeId))) {
      const remaining = await tx.routeStop.findMany({ where: { routeId }, orderBy: { stopOrder: 'asc' }, select: { id: true } });
      await reorderRouteStops(tx, routeId, remaining.map(row => row.id));
    }
  });
  return sendSuccess(res, null, 200, 'Stop deleted');
});

catalogRouter.get('/vehicles', authenticate, requireAdmin, async (_req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    select: vehicleSelect,
    orderBy: { createdAt: 'asc' },
  });
  return sendSuccess(res, vehicles);
});

catalogRouter.get('/vehicles/me', authenticate, requireVehicle, async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: req.auth!.role === 'VEHICLE' ? req.auth!.vehicleId : '' },
    select: vehicleSelect,
  });
  if (!vehicle) throw new ApiError(404, 'Vehicle not found', 'NOT_FOUND');
  return sendSuccess(res, vehicle);
});

catalogRouter.get('/vehicles/:id', authenticate, requireAdmin, async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: pathId(req.params.id) }, select: vehicleSelect });
  if (!vehicle) throw new ApiError(404, 'Vehicle not found', 'NOT_FOUND');
  return sendSuccess(res, vehicle);
});

catalogRouter.post('/vehicles', authenticate, requireAdmin, async (req, res) => {
  const input = vehicleCreateSchema.parse(req.body);
  await assertRouteExists(input.assignedRouteId);
  const vehicle = await prisma.vehicle.create({ data: input, select: vehicleSelect });
  return sendSuccess(res, vehicle, 201, 'Vehicle created');
});

catalogRouter.patch('/vehicles/:id', authenticate, requireAdmin, async (req, res) => {
  const input = vehicleUpdateSchema.parse(req.body);
  await assertRouteExists(input.assignedRouteId);
  const vehicle = await prisma.vehicle.update({ where: { id: pathId(req.params.id) }, data: input, select: vehicleSelect });
  return sendSuccess(res, vehicle, 200, 'Vehicle updated');
});

catalogRouter.delete('/vehicles/:id', authenticate, requireAdmin, async (req, res) => {
  await prisma.vehicle.delete({ where: { id: pathId(req.params.id) } });
  return sendSuccess(res, null, 200, 'Vehicle deleted');
});

catalogRouter.post('/vehicles/:id/device-token', authenticate, requireAdmin, async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: pathId(req.params.id) }, select: { id: true } });
  if (!vehicle) throw new ApiError(404, 'Vehicle not found', 'NOT_FOUND');
  const deviceToken = randomBytes(32).toString('base64url');
  const deviceTokenHash = await hash(deviceToken, 12);
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { deviceTokenHash, tokenVersion: { increment: 1 } },
  });
  return sendSuccess(res, {
    vehicleId: vehicle.id,
    deviceToken,
    warning: 'This token is shown once. Store it in the vehicle device securely.',
  }, 201, 'Vehicle token rotated');
});

catalogRouter.post('/routes/:id/stops', authenticate, requireAdmin, async (req, res) => {
  const routeId = pathId(req.params.id);
  const input = routeStopCreateSchema.parse(req.body);
  const route = await prisma.route.findUnique({ where: { id: routeId }, select: { id: true } });
  if (!route) throw new ApiError(404, 'Route not found', 'NOT_FOUND');
  const stop = await prisma.stop.findUnique({ where: { id: input.stopId }, select: { id: true } });
  if (!stop) throw new ApiError(404, 'Stop not found', 'NOT_FOUND');

  const created = await prisma.$transaction(async tx => {
    const rows = await tx.routeStop.findMany({ where: { routeId: route.id }, orderBy: { stopOrder: 'asc' }, select: { id: true, stopId: true, stopOrder: true } });
    if (rows.some(row => row.stopId === input.stopId)) throw new ApiError(409, 'Stop already belongs to this route', 'DUPLICATE_ROUTE_STOP');
    if (input.stopOrder > rows.length + 1) throw new ApiError(400, 'Stop order must be between 1 and route length + 1', 'INVALID_STOP_ORDER');

    const offset = Math.max(0, ...rows.map(row => row.stopOrder)) + rows.length + 10;
    for (let index = 0; index < rows.length; index += 1) {
      await tx.routeStop.update({ where: { id: rows[index]!.id }, data: { stopOrder: offset + index } });
    }

    const newStopOrder = offset + rows.length + 1;
    const added = await tx.routeStop.create({
      data: { routeId: route.id, stopId: stop.id, stopOrder: newStopOrder },
      select: { id: true, routeId: true, stopId: true },
    });
    const ids = rows.map(row => row.id);
    ids.splice(input.stopOrder - 1, 0, added.id);
    for (let index = 0; index < ids.length; index += 1) {
      await tx.routeStop.update({ where: { id: ids[index]! }, data: { stopOrder: index + 1 } });
    }
    return tx.routeStop.findUniqueOrThrow({ where: { id: added.id }, include: { stop: true, route: true } });
  });
  return sendSuccess(res, created, 201, 'Stop added to route');
});

catalogRouter.delete('/route-stops/:id', authenticate, requireAdmin, async (req, res) => {
  const routeStopId = pathId(req.params.id);
  await prisma.$transaction(async tx => {
    const current = await tx.routeStop.findUnique({ where: { id: routeStopId } });
    if (!current) throw new ApiError(404, 'RouteStop not found', 'NOT_FOUND');
    await tx.routeStop.delete({ where: { id: current.id } });
    const remaining = await tx.routeStop.findMany({ where: { routeId: current.routeId }, orderBy: { stopOrder: 'asc' }, select: { id: true } });
    await reorderRouteStops(tx, current.routeId, remaining.map(row => row.id));
  });
  return sendSuccess(res, null, 200, 'Stop removed from route');
});

catalogRouter.patch('/route-stops/:id/order', authenticate, requireAdmin, async (req, res) => {
  const routeStopId = pathId(req.params.id);
  const input = routeStopOrderSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const current = await tx.routeStop.findUnique({ where: { id: routeStopId } });
    if (!current) throw new ApiError(404, 'RouteStop not found', 'NOT_FOUND');
    const siblings = await tx.routeStop.findMany({ where: { routeId: current.routeId }, orderBy: { stopOrder: 'asc' }, select: { id: true } });
    if (input.stopOrder > siblings.length) throw new ApiError(400, 'Stop order exceeds route length', 'INVALID_STOP_ORDER');
    const ids = siblings.map(row => row.id);
    ids.splice(ids.indexOf(current.id), 1);
    ids.splice(input.stopOrder - 1, 0, current.id);
    await reorderRouteStops(tx, current.routeId, ids);
    return tx.routeStop.findUniqueOrThrow({ where: { id: current.id }, include: { stop: true, route: true } });
  });
  return sendSuccess(res, result, 200, 'Stop order updated');
});

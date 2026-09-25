import { z } from 'zod';

export const coordinatePairSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

export const routeGeometrySchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(coordinatePairSchema).min(2),
}).strict();

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value');
const routeStatusSchema = z.enum(['active', 'inactive']);
const vehicleStatusSchema = z.enum(['active', 'inactive', 'maintenance']);
const stopStatusSchema = z.enum(['active', 'inactive']);

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
}).strict();

export const vehicleLoginSchema = z.object({
  vehicleId: z.string().trim().min(1).max(50),
  deviceToken: z.string().min(32).max(256),
}).strict();

export const routeCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  color: colorSchema.optional(),
  status: routeStatusSchema.optional(),
  geometry: routeGeometrySchema.nullable().optional(),
}).strict();

export const routeUpdateSchema = routeCreateSchema.partial().refine(
  value => Object.keys(value).length > 0,
  'At least one field is required',
);

export const vehicleCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(50).default('bus'),
  assignedRouteId: z.string().trim().min(1).nullable().optional(),
  status: vehicleStatusSchema.optional(),
}).strict();

export const vehicleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  type: z.string().trim().min(1).max(50).optional(),
  assignedRouteId: z.string().trim().min(1).nullable().optional(),
  status: vehicleStatusSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required');

export const stopCreateSchema = z.object({
  nameTh: z.string().trim().min(1).max(255),
  nameEn: z.string().trim().max(255).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  imageUrl: z.string().url().max(500).nullable().optional(),
  status: stopStatusSchema.optional(),
}).strict();

export const stopUpdateSchema = z.object({
  nameTh: z.string().trim().min(1).max(255).optional(),
  nameEn: z.string().trim().max(255).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  status: stopStatusSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required');

export const routeStopCreateSchema = z.object({
  stopId: z.string().trim().min(1).max(50),
  stopOrder: z.number().int().min(1),
}).strict();

export const routeStopOrderSchema = z.object({
  stopOrder: z.number().int().min(1),
}).strict();

export const startTripSchema = z.object({
  routeId: z.string().trim().min(1).max(50),
}).strict();

export const vehicleLocationSchema = z.object({
  vehicleId: z.string().trim().min(1).max(50),
  tripId: z.string().trim().min(1).max(50).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  speed: z.number().finite().min(0).nullable().optional(),
  heading: z.number().finite().min(0).max(360).nullable().optional(),
  recordedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

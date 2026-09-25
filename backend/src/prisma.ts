import { PrismaClient } from '@prisma/client';

// Expected failures (unique/404/FK) are mapped to HTTP errors in http/errors.ts and
// genuinely unhandled errors are logged there, so Prisma only needs to report warnings.
export const prisma = new PrismaClient({ log: ['warn'] });

import type { ErrorRequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'API_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function sendSuccess<T>(res: Response, data: T, status = 200, message?: string) {
  return res.status(status).json({ success: true, data, ...(message ? { message } : {}) });
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      success: false,
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: 'Malformed JSON request body', code: 'INVALID_JSON' });
    return;
  }

  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ success: false, error: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
      res.status(409).json({
        success: false,
        error: fields.length ? `A record with this ${fields.join(', ')} already exists` : 'A record with this unique value already exists',
        code: 'DUPLICATE_RESOURCE',
        ...(fields.length ? { details: fields.map(path => ({ path, message: 'Must be unique' })) } : {}),
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ success: false, error: 'Resource not found', code: 'NOT_FOUND' });
      return;
    }
    if (error.code === 'P2003') {
      res.status(409).json({ success: false, error: 'Resource is referenced by other records (e.g. trip history) or references a missing record', code: 'RESOURCE_IN_USE' });
      return;
    }
    if (error.code === 'P2034') {
      res.status(409).json({ success: false, error: 'Conflicting update; please retry', code: 'TRANSACTION_CONFLICT' });
      return;
    }
  }

  console.error('Unhandled API error', error);
  res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
};

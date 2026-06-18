import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  notFound,
  badRequest,
  unauthorized,
  internalError,
  serviceUnavailable,
  forbidden,
  validationError,
  conflict,
  rateLimitExceeded,
} from '../errors/AppError.js';
import { errorHandler } from '../middleware/errorHandler.js';

function createMockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res as Response;
}

const mockReq = {} as Request;
const mockNext = vi.fn() as unknown as NextFunction;

describe('AppError', () => {
  it('creates an error with all required fields', () => {
    const err = new AppError({
      code: 'TEST_ERROR',
      message: 'Something went wrong',
      statusCode: 422,
      retryable: false,
      context: { field: 'email' },
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('TEST_ERROR');
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(422);
    expect(err.retryable).toBe(false);
    expect(err.context).toEqual({ field: 'email' });
    expect(err.stack).toBeDefined();
  });
});

describe('Error Factory Helpers', () => {
  it('notFound creates a 404 error', () => {
    const err = notFound('Item not found', { id: '123' });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.retryable).toBe(false);
    expect(err.message).toBe('Item not found');
    expect(err.context).toEqual({ id: '123' });
  });

  it('badRequest creates a 400 error', () => {
    const err = badRequest('Invalid input');
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.statusCode).toBe(400);
    expect(err.retryable).toBe(false);
  });

  it('validationError creates a 422 error', () => {
    const err = validationError('Email is invalid', { field: 'email' });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(422);
    expect(err.retryable).toBe(false);
    expect(err.context).toEqual({ field: 'email' });
  });

  it('unauthorized creates a 401 error', () => {
    const err = unauthorized();
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.statusCode).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it('forbidden creates a 403 error', () => {
    const err = forbidden();
    expect(err.code).toBe('FORBIDDEN');
    expect(err.statusCode).toBe(403);
    expect(err.retryable).toBe(false);
  });

  it('conflict creates a 409 error', () => {
    const err = conflict('Repository already connected');
    expect(err.code).toBe('CONFLICT');
    expect(err.statusCode).toBe(409);
    expect(err.retryable).toBe(false);
    expect(err.message).toBe('Repository already connected');
  });

  it('rateLimitExceeded creates a 429 retryable error', () => {
    const err = rateLimitExceeded('Too many requests', { retryAfter: 60 });
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.context).toEqual({ retryAfter: 60 });
  });

  it('internalError creates a 500 retryable error', () => {
    const err = internalError();
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.retryable).toBe(true);
  });

  it('serviceUnavailable creates a 503 retryable error', () => {
    const err = serviceUnavailable('GitHub API is down');
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    expect(err.statusCode).toBe(503);
    expect(err.retryable).toBe(true);
    expect(err.message).toBe('GitHub API is down');
  });
});

describe('errorHandler middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns consistent error format for AppError', () => {
    const err = notFound('User not found', { userId: 'abc' });
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'NOT_FOUND',
        message: 'User not found',
        retryable: false,
      }),
    });
  });

  it('includes context field with stack in non-production', () => {
    process.env.NODE_ENV = 'test';
    const err = badRequest('Missing field', { field: 'name' });
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.context).toBeDefined();
    expect(body.error.context.field).toBe('name');
    expect(body.error.context.stack).toBeDefined();
  });

  it('omits stack trace from context in production', () => {
    process.env.NODE_ENV = 'production';
    const err = badRequest('Missing field', { field: 'name' });
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.context.field).toBe('name');
    expect(body.error.context.stack).toBeUndefined();
  });

  it('returns generic 500 for unknown errors with retryable: true', () => {
    const err = new Error('Something unexpected');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        retryable: true,
      }),
    });
  });

  it('includes stack in context for unknown errors in non-production', () => {
    process.env.NODE_ENV = 'test';
    const err = new Error('Oops');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.context).toBeDefined();
    expect(body.error.context.stack).toContain('Oops');
  });

  it('omits context for unknown errors in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Oops');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.context).toBeUndefined();
  });

  it('logs the error to console', () => {
    const err = internalError('DB connection failed');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(console.error).toHaveBeenCalledWith(
      '[error]',
      expect.objectContaining({
        name: 'AppError',
        message: 'DB connection failed',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      })
    );
  });

  it('error response always has code, message, and retryable fields', () => {
    const err = serviceUnavailable();
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
    expect(body.error).toHaveProperty('retryable');
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
    expect(typeof body.error.retryable).toBe('boolean');
  });

  it('handles Prisma unique constraint error (P2002) as 409 conflict', () => {
    const err = createPrismaError('P2002', 'Unique constraint failed');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('A resource with that identifier already exists');
    expect(body.error.retryable).toBe(false);
  });

  it('handles Prisma not found error (P2025) as 404', () => {
    const err = createPrismaError('P2025', 'Record not found');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.retryable).toBe(false);
  });

  it('handles unknown Prisma error as 500 database error', () => {
    const err = createPrismaError('P2003', 'Foreign key constraint failed');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.code).toBe('DATABASE_ERROR');
    expect(body.error.retryable).toBe(false);
  });

  it('handles JSON SyntaxError (malformed body) as 400', () => {
    const err = Object.assign(new SyntaxError('Unexpected token'), { body: '' });
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.code).toBe('INVALID_JSON');
    expect(body.error.message).toBe('Request body contains invalid JSON');
    expect(body.error.retryable).toBe(false);
  });

  it('clears session cookie on 401 errors with redirectTo context', () => {
    const err = new AppError({
      code: 'AUTH_FAILED',
      message: 'Session expired',
      statusCode: 401,
      retryable: true,
      context: { redirectTo: '/login' },
    });
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.clearCookie).toHaveBeenCalledWith('solo.sid', { path: '/' });
  });

  it('does not clear session cookie on 401 errors without redirectTo', () => {
    const err = unauthorized('Invalid credentials');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

// --- Helpers ---

/**
 * Creates a mock Prisma error with the constructor name set correctly,
 * since we don't import @prisma/client in tests.
 */
function createPrismaError(code: string, message: string) {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    meta?: Record<string, unknown>;
    constructor(msg: string, errorCode: string) {
      super(msg);
      this.name = 'PrismaClientKnownRequestError';
      this.code = errorCode;
    }
  }
  return new PrismaClientKnownRequestError(message, code);
}

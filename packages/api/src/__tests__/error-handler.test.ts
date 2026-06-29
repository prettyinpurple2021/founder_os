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
import * as logger from '../services/logger.js';

function createMockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res as Response;
}

const mockReq = { method: 'GET', path: '/api/test' } as unknown as Request;
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
    vi.spyOn(logger, 'logError').mockResolvedValue(undefined);
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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          retryable: true,
        }),
      }),
    );
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

  it('logs the error via structured logger, not console.error', () => {
    const err = internalError('DB connection failed');
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    // errorLogger middleware handles console output; errorHandler delegates to logError
    expect(console.error).not.toHaveBeenCalled();
    expect(logger.logError).toHaveBeenCalledWith(
      undefined,
      'app_error',
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'DB connection failed',
        statusCode: 500,
      }),
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

describe('errorHandler error logging', () => {
  const originalEnv = process.env.NODE_ENV;
  let logErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    logErrorSpy = vi.spyOn(logger, 'logError').mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('calls logError for 500 AppError with operation context and stack', () => {
    const err = internalError('DB connection failed');
    const req = {
      method: 'POST',
      path: '/api/projects',
      user: { id: 'user-123' },
    } as unknown as Request;
    const res = createMockRes();

    errorHandler(err, req, res, mockNext);

    expect(logErrorSpy).toHaveBeenCalledWith('user-123', 'app_error', {
      method: 'POST',
      path: '/api/projects',
      statusCode: 500,
      message: 'DB connection failed',
      stack: expect.any(String),
      code: 'INTERNAL_ERROR',
    });
  });

  it('calls logError for unknown errors with unhandled_error action', () => {
    const err = new TypeError('Cannot read property of undefined');
    const req = {
      method: 'GET',
      path: '/api/users',
      user: { id: 'user-456' },
    } as unknown as Request;
    const res = createMockRes();

    errorHandler(err, req, res, mockNext);

    expect(logErrorSpy).toHaveBeenCalledWith('user-456', 'unhandled_error', {
      method: 'GET',
      path: '/api/users',
      message: 'Cannot read property of undefined',
      stack: expect.any(String),
    });
  });

  it('calls logError for 503 ServiceUnavailable errors', () => {
    const err = serviceUnavailable('GitHub API is down');
    const req = {
      method: 'POST',
      path: '/api/sync',
      user: { id: 'user-789' },
    } as unknown as Request;
    const res = createMockRes();

    errorHandler(err, req, res, mockNext);

    expect(logErrorSpy).toHaveBeenCalledWith('user-789', 'app_error', {
      method: 'POST',
      path: '/api/sync',
      statusCode: 503,
      message: 'GitHub API is down',
      stack: expect.any(String),
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('does not log 404 errors to avoid noise', () => {
    const err = notFound('Item not found');
    const req = { method: 'GET', path: '/api/items/1' } as unknown as Request;
    const res = createMockRes();

    errorHandler(err, req, res, mockNext);

    expect(logErrorSpy).not.toHaveBeenCalled();
  });

  it('calls logError for 400 errors', () => {
    const err = badRequest('Invalid input');
    const req = { method: 'POST', path: '/api/data', user: { id: 'u1' } } as unknown as Request;
    const res = createMockRes();

    errorHandler(err, req, res, mockNext);

    expect(logErrorSpy).toHaveBeenCalledWith('u1', 'app_error', {
      method: 'POST',
      path: '/api/data',
      statusCode: 400,
      message: 'Invalid input',
      stack: expect.any(String),
      code: 'BAD_REQUEST',
    });
  });

  it('passes undefined userId when request has no user', () => {
    const err = internalError('Crash');
    const req = { method: 'GET', path: '/api/health' } as unknown as Request;
    const res = createMockRes();

    errorHandler(err, req, res, mockNext);

    expect(logErrorSpy).toHaveBeenCalledWith(
      undefined,
      'app_error',
      expect.objectContaining({
        method: 'GET',
        path: '/api/health',
        statusCode: 500,
      }),
    );
  });

  it('omits stack from log details in production', () => {
    process.env.NODE_ENV = 'production';
    const err = internalError('Prod crash');
    const req = { method: 'DELETE', path: '/api/data', user: { id: 'u1' } } as unknown as Request;
    const res = createMockRes();

    errorHandler(err, req, res, mockNext);

    expect(logErrorSpy).toHaveBeenCalledWith(
      'u1',
      'app_error',
      expect.objectContaining({
        stack: undefined,
      }),
    );
  });

  it('logging errors do not block the error response', () => {
    logErrorSpy.mockRejectedValue(new Error('logging failed'));
    const err = internalError('Something broke');
    const req = { method: 'GET', path: '/api/test' } as unknown as Request;
    const res = createMockRes();

    // Should not throw even if logError rejects
    errorHandler(err, req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });

  it('does not include errorName for AppError instances', () => {
    const err = forbidden('Access denied');
    const req = { method: 'GET', path: '/api/admin', user: { id: 'u2' } } as unknown as Request;
    const res = createMockRes();

    errorHandler(err, req, res, mockNext);

    const logCall = logErrorSpy.mock.calls[0];
    expect(logCall[2]).not.toHaveProperty('errorName');
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

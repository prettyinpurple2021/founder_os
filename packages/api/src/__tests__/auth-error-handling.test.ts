import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { AppError, unauthorized, authenticationError } from '../errors/AppError.js';
import { errorHandler } from '../middleware/errorHandler.js';

// --- Helpers ---

function createMockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res as Response;
}

const mockReq = {} as Request;
const mockNext = vi.fn() as unknown as NextFunction;

// --- Tests ---

describe('Auth Error Handling', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  describe('authenticationError factory', () => {
    it('creates a 401 error with AUTH_FAILED code', () => {
      const err = authenticationError('GitHub OAuth failed');
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('AUTH_FAILED');
      expect(err.statusCode).toBe(401);
      expect(err.retryable).toBe(true);
      expect(err.message).toBe('GitHub OAuth failed');
    });

    it('includes redirectTo: /login in context by default', () => {
      const err = authenticationError();
      expect(err.context?.redirectTo).toBe('/login');
    });

    it('allows additional context to be merged', () => {
      const err = authenticationError('Token expired', { reason: 'token_invalid' });
      expect(err.context?.redirectTo).toBe('/login');
      expect(err.context?.reason).toBe('token_invalid');
    });
  });

  describe('errorHandler with session expiration errors', () => {
    it('clears session cookie on 401 errors with redirectTo context', () => {
      const err = unauthorized('Session expired', {
        reason: 'session_expired',
        redirectTo: '/login',
      });
      const res = createMockRes();

      errorHandler(err, mockReq, res, mockNext);

      expect(res.clearCookie).toHaveBeenCalledWith('solo.sid', { path: '/' });
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns structured error with redirect context for expired sessions', () => {
      process.env.NODE_ENV = 'production';
      const err = unauthorized('Session expired', {
        reason: 'session_expired',
        redirectTo: '/login',
      });
      const res = createMockRes();

      errorHandler(err, mockReq, res, mockNext);

      const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Session expired',
        retryable: false,
        context: {
          reason: 'session_expired',
          redirectTo: '/login',
        },
      });
    });

    it('returns structured error for AUTH_FAILED with redirectTo', () => {
      process.env.NODE_ENV = 'production';
      const err = authenticationError('GitHub OAuth failed');
      const res = createMockRes();

      errorHandler(err, mockReq, res, mockNext);

      const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(body.error.code).toBe('AUTH_FAILED');
      expect(body.error.message).toBe('GitHub OAuth failed');
      expect(body.error.retryable).toBe(true);
      expect(body.error.context.redirectTo).toBe('/login');
      expect(res.clearCookie).toHaveBeenCalledWith('solo.sid', { path: '/' });
    });

    it('does not clear cookie for non-redirect 401 errors', () => {
      const err = unauthorized('Invalid API key');
      const res = createMockRes();

      errorHandler(err, mockReq, res, mockNext);

      expect(res.clearCookie).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('does not clear cookie for non-401 errors', () => {
      const err = new AppError({
        code: 'FORBIDDEN',
        message: 'Not allowed',
        statusCode: 403,
        retryable: false,
        context: { redirectTo: '/login' },
      });
      const res = createMockRes();

      errorHandler(err, mockReq, res, mockNext);

      expect(res.clearCookie).not.toHaveBeenCalled();
    });
  });

  describe('OAuth failure descriptive errors', () => {
    it('error response always includes code, message, and retryable fields', () => {
      const err = authenticationError('OAuth provider unreachable');
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

    it('auth errors are retryable (user can attempt OAuth again)', () => {
      const err = authenticationError('OAuth flow interrupted');
      const res = createMockRes();

      errorHandler(err, mockReq, res, mockNext);

      const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(body.error.retryable).toBe(true);
    });
  });
});

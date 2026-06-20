import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    systemLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
    },
    session: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock passport to avoid GitHub strategy initialization
vi.mock('../auth/passport.js', () => ({
  default: {
    authenticate: vi.fn((_strategy: string, _optionsOrCb?: any) => {
      // Default: return a no-op middleware for route registration
      return (_req: Request, _res: Response, next: () => void) => next();
    }),
    initialize: () => (_req: Request, _res: Response, next: () => void) => next(),
    session: () => (_req: Request, _res: Response, next: () => void) => next(),
  },
}));

import prisma from '../lib/prisma.js';
import passport from '../auth/passport.js';

const mockedPrisma = prisma as any;

// Import the router to extract handlers
import router from '../routes/auth.js';

/**
 * Validates: Requirements 10.4
 *
 * Tests that authentication event logging (logAuth) is called with correct
 * parameters for login, logout, session_expired, and login_failed events.
 */

// Helper to extract route handlers from express router
function getRouteHandler(method: string, path: string) {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`${method.toUpperCase()} ${path} route not found`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    user: undefined,
    isAuthenticated: () => false,
    logout: vi.fn((cb: (err?: Error) => void) => cb()),
    session: {
      destroy: vi.fn((cb: (err?: Error) => void) => cb()),
    },
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & {
  _json: any;
  _statusCode: number;
  _redirectUrl: string | null;
} {
  const res: any = {
    _json: null,
    _statusCode: 200,
    _redirectUrl: null,
  };
  res.status = vi.fn((code: number) => {
    res._statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res._json = data;
    return res;
  });
  res.clearCookie = vi.fn(() => res);
  res.redirect = vi.fn((url: string) => {
    res._redirectUrl = url;
    return res;
  });
  return res;
}

describe('Authentication Event Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.systemLog.create.mockResolvedValue({ id: 'log-1' });
  });

  describe('Login logging', () => {
    it('logs login event with provider and username on successful OAuth callback', async () => {
      // Set up passport.authenticate to simulate success
      const mockUser = { id: 'user-123', username: 'testuser' };
      (passport.authenticate as any).mockImplementation(
        (_strategy: string, cb: (err: Error | null, user: any, info: any) => void) => {
          return (req: Request, _res: Response, _next: NextFunction) => {
            // Simulate successful auth — passport calls the callback with a user
            // We need to mock req.logIn as well
            (req as any).logIn = vi.fn((_user: any, loginCb: (err?: Error) => void) => loginCb());
            cb(null, mockUser, undefined);
          };
        },
      );

      // Re-import to apply the new mock behavior
      // Get the callback handler (it's the single handler on the route)
      const callbackLayer = (router as any).stack.find(
        (l: any) => l.route?.path === '/auth/github/callback' && l.route?.methods?.get,
      );
      const callbackHandler =
        callbackLayer.route.stack[callbackLayer.route.stack.length - 1].handle;

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      callbackHandler(req, res, next);

      // Wait for async operations
      await new Promise((r) => setTimeout(r, 20));

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'auth',
          action: 'login',
          details: { provider: 'github', username: 'testuser' },
          userId: 'user-123',
        },
      });
    });

    it('logs login_failed event when OAuth returns an error', async () => {
      const oauthError = new Error('Token exchange failed');
      (passport.authenticate as any).mockImplementation(
        (_strategy: string, cb: (err: Error | null, user: any, info: any) => void) => {
          return (_req: Request, _res: Response, _next: NextFunction) => {
            cb(oauthError, false, undefined);
          };
        },
      );

      const callbackLayer = (router as any).stack.find(
        (l: any) => l.route?.path === '/auth/github/callback' && l.route?.methods?.get,
      );
      const callbackHandler =
        callbackLayer.route.stack[callbackLayer.route.stack.length - 1].handle;

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      callbackHandler(req, res, next);

      await new Promise((r) => setTimeout(r, 20));

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'auth',
          action: 'login_failed',
          details: { provider: 'github', error: 'Token exchange failed', code: 'OAUTH_FAILED' },
          userId: null,
        },
      });
    });

    it('logs login_failed event when user denies OAuth access', async () => {
      (passport.authenticate as any).mockImplementation(
        (_strategy: string, cb: (err: Error | null, user: any, info: any) => void) => {
          return (_req: Request, _res: Response, _next: NextFunction) => {
            cb(null, false, { message: 'access_denied' });
          };
        },
      );

      const callbackLayer = (router as any).stack.find(
        (l: any) => l.route?.path === '/auth/github/callback' && l.route?.methods?.get,
      );
      const callbackHandler =
        callbackLayer.route.stack[callbackLayer.route.stack.length - 1].handle;

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      callbackHandler(req, res, next);

      await new Promise((r) => setTimeout(r, 20));

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'auth',
          action: 'login_failed',
          details: {
            provider: 'github',
            error: 'GitHub access was denied. Please authorize the application and try again.',
            code: 'OAUTH_ACCESS_DENIED',
          },
          userId: null,
        },
      });
    });
  });

  describe('Logout logging', () => {
    it('logs logout event with userId when authenticated user logs out', async () => {
      const handler = getRouteHandler('post', '/auth/logout');
      const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
      const logoutFn = vi.fn((cb: (err?: Error) => void) => cb());
      const req = createMockReq({
        user: { id: 'user-456', username: 'logoutuser' } as Express.User,
        logout: logoutFn as any,
        session: { destroy: destroyFn } as unknown as Request['session'],
      });
      const res = createMockRes();

      handler(req, res);

      await vi.waitFor(() => {
        expect(res.json).toHaveBeenCalled();
      });

      // Give async log a tick to fire
      await new Promise((r) => setTimeout(r, 10));

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'auth',
          action: 'logout',
          details: { reason: 'user_initiated' },
          userId: 'user-456',
        },
      });
    });

    it('logs logout event even when no user is authenticated (idempotent)', async () => {
      const handler = getRouteHandler('post', '/auth/logout');
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      handler(req, res);

      await new Promise((r) => setTimeout(r, 10));

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'auth',
          action: 'logout',
          details: { reason: 'user_initiated' },
          userId: null,
        },
      });
    });
  });

  describe('Session expiration logging', () => {
    it('logs session_expired event when session has timed out', async () => {
      // Mock finding an expired session (last active 25 hours ago)
      const expiredDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      mockedPrisma.session.findFirst.mockResolvedValue({
        id: 'session-1',
        userId: 'user-789',
        lastActiveAt: expiredDate,
      });

      // Dynamically import session expiration middleware
      const { sessionExpiration } = await import('../middleware/sessionExpiration.js');

      const req = createMockReq({
        user: { id: 'user-789' } as Express.User,
        isAuthenticated: (() => true) as any,
        session: {
          destroy: vi.fn((cb: (err?: Error) => void) => cb()),
        } as unknown as Request['session'],
      });
      const res = createMockRes();
      const next = vi.fn();

      sessionExpiration(req, res as Response, next);

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalled();
      });

      // Give async log a tick to fire
      await new Promise((r) => setTimeout(r, 10));

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'auth',
          action: 'session_expired',
          details: { lastActiveAt: expiredDate.toISOString(), expiredAfterHours: 24 },
          userId: 'user-789',
        },
      });
    });
  });
});

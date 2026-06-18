import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock prisma before importing the route
vi.mock('../lib/prisma.js', () => ({
  default: {
    session: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock passport to avoid real OAuth setup
vi.mock('../auth/passport.js', () => ({
  default: {
    authenticate: () => (_req: Request, _res: Response, next: () => void) => next(),
  },
}));

import prisma from '../lib/prisma.js';

const mockedPrisma = prisma as any;

// We import the router and test the handler directly
// To do this, we use a lightweight approach to extract the route handler
import router from '../routes/auth.js';

/**
 * Helper to find and invoke a registered route handler from the router.
 */
function findRouteHandler(method: string, path: string) {
  // Express Router stores routes in router.stack
  const stack = (router as any).stack;
  for (const layer of stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routePath === path && routeMethod === method) {
        // Return the last handler in the route's stack (the actual handler, not middleware)
        const handlers = layer.route.stack;
        return handlers[handlers.length - 1].handle;
      }
    }
  }
  return null;
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  const req = {
    isAuthenticated: vi.fn().mockReturnValue(false),
    user: undefined,
    ...overrides,
  } as unknown as Request;
  return req;
}

function createMockRes(): Response & { _json: any; _status: number } {
  const res: any = {
    _json: null,
    _status: 200,
  };
  res.status = vi.fn((code: number) => {
    res._status = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res._json = data;
    return res;
  });
  return res;
}

describe('GET /auth/session', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = findRouteHandler('get', '/auth/session');
    expect(handler).toBeTruthy();
  });

  it('returns { valid: false } when user is not authenticated', async () => {
    const req = createMockReq({ isAuthenticated: (() => false) as any });
    const res = createMockRes();

    await handler(req, res as any);

    expect(res.json).toHaveBeenCalledWith({ valid: false });
  });

  it('returns { valid: false } when req.user is undefined', async () => {
    const req = createMockReq({
      isAuthenticated: (() => true) as any,
      user: undefined,
    });
    const res = createMockRes();

    await handler(req, res as any);

    expect(res.json).toHaveBeenCalledWith({ valid: false });
  });

  it('returns { valid: false } when no session record exists in DB', async () => {
    const req = createMockReq({
      isAuthenticated: (() => true) as any,
      user: { id: 'user-1', username: 'testuser', email: 'test@example.com' } as Express.User,
    });
    const res = createMockRes();

    mockedPrisma.session.findFirst.mockResolvedValue(null);

    await handler(req, res as any);

    expect(res.json).toHaveBeenCalledWith({ valid: false });
  });

  it('returns session info when user is authenticated and session exists', async () => {
    const expiresAt = new Date('2025-01-15T12:00:00.000Z');
    const req = createMockReq({
      isAuthenticated: (() => true) as any,
      user: { id: 'user-1', username: 'testuser', email: 'test@example.com' } as Express.User,
    });
    const res = createMockRes();

    mockedPrisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token: 'token-abc',
      expiresAt,
      lastActiveAt: new Date(),
    });

    await handler(req, res as any);

    expect(res.json).toHaveBeenCalledWith({
      valid: true,
      user: {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
      },
      expiresAt: '2025-01-15T12:00:00.000Z',
    });
  });

  it('queries session by userId ordered by lastActiveAt desc', async () => {
    const req = createMockReq({
      isAuthenticated: (() => true) as any,
      user: { id: 'user-42', username: 'dev', email: 'dev@test.com' } as Express.User,
    });
    const res = createMockRes();

    mockedPrisma.session.findFirst.mockResolvedValue({
      id: 'session-2',
      userId: 'user-42',
      token: 'token-xyz',
      expiresAt: new Date(),
      lastActiveAt: new Date(),
    });

    await handler(req, res as any);

    expect(mockedPrisma.session.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-42' },
      orderBy: { lastActiveAt: 'desc' },
    });
  });

  it('returns { valid: false } when prisma throws an error', async () => {
    const req = createMockReq({
      isAuthenticated: (() => true) as any,
      user: { id: 'user-1', username: 'testuser', email: 'test@example.com' } as Express.User,
    });
    const res = createMockRes();

    mockedPrisma.session.findFirst.mockRejectedValue(new Error('DB connection failed'));

    await handler(req, res as any);

    expect(res.json).toHaveBeenCalledWith({ valid: false });
  });

  it('returns HTTP 200 for both valid and invalid sessions', async () => {
    // Valid session
    const req1 = createMockReq({
      isAuthenticated: (() => true) as any,
      user: { id: 'user-1', username: 'testuser', email: 'test@example.com' } as Express.User,
    });
    const res1 = createMockRes();

    mockedPrisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token: 'token-abc',
      expiresAt: new Date(),
      lastActiveAt: new Date(),
    });

    await handler(req1, res1 as any);
    // Should not have called res.status (defaults to 200)
    expect(res1.status).not.toHaveBeenCalled();

    // Invalid session (unauthenticated)
    const req2 = createMockReq({ isAuthenticated: (() => false) as any });
    const res2 = createMockRes();

    await handler(req2, res2 as any);
    expect(res2.status).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock prisma before importing routes
vi.mock('../lib/prisma.js', () => ({
  default: {
    systemLog: {
      create: vi.fn(),
    },
  },
}));

// Mock passport to avoid GitHub strategy initialization
vi.mock('../auth/passport.js', () => ({
  default: {
    authenticate: () => (_req: Request, _res: Response, next: () => void) => next(),
    initialize: () => (_req: Request, _res: Response, next: () => void) => next(),
    session: () => (_req: Request, _res: Response, next: () => void) => next(),
  },
}));

import prisma from '../lib/prisma.js';

const mockedPrisma = prisma as any;

// We'll test the route handler directly by importing the router
// and extracting the POST /auth/logout handler
import router from '../routes/auth.js';

// Extract the logout handler from the router stack
function getLogoutHandler() {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === '/auth/logout' && l.route?.methods?.post,
  );
  if (!layer) throw new Error('POST /auth/logout route not found');
  // The handler is the last function in the route stack
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    user: undefined,
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
  _clearedCookies: string[];
} {
  const res: any = {
    _json: null,
    _statusCode: 200,
    _clearedCookies: [],
  };
  res.status = vi.fn((code: number) => {
    res._statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res._json = data;
    return res;
  });
  res.clearCookie = vi.fn((name: string) => {
    res._clearedCookies.push(name);
    return res;
  });
  return res;
}

describe('POST /auth/logout', () => {
  let handler: (req: Request, res: Response) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.systemLog.create.mockResolvedValue({
      id: 'log-1',
      category: 'auth',
      action: 'logout',
      details: {},
      userId: null,
      timestamp: new Date(),
    });
    handler = getLogoutHandler();
  });

  it('returns success when no user is authenticated (idempotent)', () => {
    const req = createMockReq({ user: undefined });
    const res = createMockRes();

    handler(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith('solo.sid', { path: '/' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
  });

  it('destroys session and clears cookie when user is authenticated', async () => {
    const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
    const logoutFn = vi.fn((cb: (err?: Error) => void) => cb());
    const req = createMockReq({
      user: { id: 'user-1' } as Express.User,
      logout: logoutFn as any,
      session: { destroy: destroyFn } as unknown as Request['session'],
    });
    const res = createMockRes();

    handler(req, res);

    // Wait for async operations
    await vi.waitFor(() => {
      expect(res.json).toHaveBeenCalled();
    });

    expect(logoutFn).toHaveBeenCalled();
    expect(destroyFn).toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith('solo.sid', { path: '/' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
  });

  it('returns 500 when req.logout fails', async () => {
    const logoutError = new Error('Logout failed');
    const logoutFn = vi.fn((cb: (err?: Error) => void) => cb(logoutError));
    const req = createMockReq({
      user: { id: 'user-1' } as Express.User,
      logout: logoutFn as any,
    });
    const res = createMockRes();

    handler(req, res);

    await vi.waitFor(() => {
      expect(res.json).toHaveBeenCalled();
    });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'LOGOUT_FAILED', message: 'Failed to log out' },
    });
  });

  it('still returns success when session.destroy fails', async () => {
    const destroyError = new Error('Destroy failed');
    const destroyFn = vi.fn((cb: (err?: Error) => void) => cb(destroyError));
    const logoutFn = vi.fn((cb: (err?: Error) => void) => cb());
    const req = createMockReq({
      user: { id: 'user-1' } as Express.User,
      logout: logoutFn as any,
      session: { destroy: destroyFn } as unknown as Request['session'],
    });
    const res = createMockRes();

    handler(req, res);

    await vi.waitFor(() => {
      expect(res.json).toHaveBeenCalled();
    });

    expect(res.clearCookie).toHaveBeenCalledWith('solo.sid', { path: '/' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
  });

  it('logs the logout event to SystemLog', async () => {
    const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
    const logoutFn = vi.fn((cb: (err?: Error) => void) => cb());
    const req = createMockReq({
      user: { id: 'user-1' } as Express.User,
      logout: logoutFn as any,
      session: { destroy: destroyFn } as unknown as Request['session'],
    });
    const res = createMockRes();

    handler(req, res);

    await vi.waitFor(() => {
      expect(res.json).toHaveBeenCalled();
    });

    // Give the async log a tick to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        category: 'auth',
        action: 'logout',
        details: { reason: 'user_initiated' },
        userId: 'user-1',
      },
    });
  });
});

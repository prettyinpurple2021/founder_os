import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';

// Mock prisma before importing the middleware
vi.mock('../lib/prisma.js', () => ({
  default: {
    session: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma.js';
import { sessionExpiration } from '../middleware/sessionExpiration.js';

const mockedPrisma = prisma as any;

function createMockReq(overrides: Partial<Request> = {}): Request {
  const req = {
    isAuthenticated: vi.fn().mockReturnValue(false),
    user: undefined,
    session: {
      destroy: vi.fn((cb: (err?: Error) => void) => cb()),
    },
    ...overrides,
  } as unknown as Request;
  return req;
}

function createMockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('sessionExpiration middleware', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockNext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
  });

  it('skips when user is not authenticated', () => {
    const req = createMockReq({ isAuthenticated: (() => false) as any });
    const res = createMockRes();

    sessionExpiration(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect(mockedPrisma.session.findFirst).not.toHaveBeenCalled();
  });

  it('skips when req.user is undefined', () => {
    const req = createMockReq({
      isAuthenticated: (() => true) as unknown as Request['isAuthenticated'],
      user: undefined,
    });
    const res = createMockRes();

    sessionExpiration(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect(mockedPrisma.session.findFirst).not.toHaveBeenCalled();
  });

  it('destroys session and returns 401 when no session record exists in DB', async () => {
    const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
    const req = createMockReq({
      isAuthenticated: (() => true) as unknown as Request['isAuthenticated'],
      user: { id: 'user-1' } as Express.User,
      session: { destroy: destroyFn } as unknown as Request['session'],
    });
    const res = createMockRes();

    mockedPrisma.session.findFirst.mockResolvedValue(null);

    sessionExpiration(req, res, mockNext);

    // Wait for promises to resolve
    await vi.waitFor(() => {
      expect(mockNext).toHaveBeenCalled();
    });

    expect(destroyFn).toHaveBeenCalled();
    const error = mockNext.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('Session expired');
    expect(error.context).toEqual({
      reason: 'session_expired',
      redirectTo: '/login',
    });
  });

  it('destroys session and returns 401 when lastActiveAt is older than 24 hours', async () => {
    const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
    const req = createMockReq({
      isAuthenticated: (() => true) as unknown as Request['isAuthenticated'],
      user: { id: 'user-1' } as Express.User,
      session: { destroy: destroyFn } as unknown as Request['session'],
    });
    const res = createMockRes();

    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockedPrisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token: 'token-abc',
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: twentyFiveHoursAgo,
    });

    sessionExpiration(req, res, mockNext);

    await vi.waitFor(() => {
      expect(mockNext).toHaveBeenCalled();
    });

    expect(destroyFn).toHaveBeenCalled();
    const error = mockNext.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
    expect(error.context?.reason).toBe('session_expired');
    expect(error.context?.redirectTo).toBe('/login');
  });

  it('updates lastActiveAt and calls next() when session is active', async () => {
    const req = createMockReq({
      isAuthenticated: (() => true) as unknown as Request['isAuthenticated'],
      user: { id: 'user-1' } as Express.User,
    });
    const res = createMockRes();

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    mockedPrisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token: 'token-abc',
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: oneHourAgo,
    });
    mockedPrisma.session.update.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token: 'token-abc',
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: new Date(),
    });

    sessionExpiration(req, res, mockNext);

    await vi.waitFor(() => {
      expect(mockNext).toHaveBeenCalled();
    });

    // next() called without error
    expect(mockNext).toHaveBeenCalledWith();
    expect(mockedPrisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastActiveAt: expect.any(Date) },
    });
  });

  it('passes database errors to next()', async () => {
    const req = createMockReq({
      isAuthenticated: (() => true) as unknown as Request['isAuthenticated'],
      user: { id: 'user-1' } as Express.User,
    });
    const res = createMockRes();

    const dbError = new Error('Connection refused');
    mockedPrisma.session.findFirst.mockRejectedValue(dbError);

    sessionExpiration(req, res, mockNext);

    await vi.waitFor(() => {
      expect(mockNext).toHaveBeenCalled();
    });

    expect(mockNext).toHaveBeenCalledWith(dbError);
  });

  it('passes session destroy errors to next()', async () => {
    const destroyError = new Error('Session store failure');
    const destroyFn = vi.fn((cb: (err?: Error) => void) => cb(destroyError));
    const req = createMockReq({
      isAuthenticated: (() => true) as unknown as Request['isAuthenticated'],
      user: { id: 'user-1' } as Express.User,
      session: { destroy: destroyFn } as unknown as Request['session'],
    });
    const res = createMockRes();

    mockedPrisma.session.findFirst.mockResolvedValue(null);

    sessionExpiration(req, res, mockNext);

    await vi.waitFor(() => {
      expect(mockNext).toHaveBeenCalled();
    });

    expect(mockNext).toHaveBeenCalledWith(destroyError);
  });

  it('treats session active at exactly 24 hours as expired', async () => {
    const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
    const req = createMockReq({
      isAuthenticated: (() => true) as unknown as Request['isAuthenticated'],
      user: { id: 'user-1' } as Express.User,
      session: { destroy: destroyFn } as unknown as Request['session'],
    });
    const res = createMockRes();

    // Exactly 24 hours + 1ms ago (just over the boundary)
    const exactlyExpired = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1);
    mockedPrisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token: 'token-abc',
      expiresAt: new Date(Date.now() + 86400000),
      lastActiveAt: exactlyExpired,
    });

    sessionExpiration(req, res, mockNext);

    await vi.waitFor(() => {
      expect(mockNext).toHaveBeenCalled();
    });

    expect(destroyFn).toHaveBeenCalled();
    const error = mockNext.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });
});

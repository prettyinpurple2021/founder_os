import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';

/**
 * Property 14: Session Expiration Enforcement
 * - No API request succeeds with a session whose lastActiveAt is more than 24 hours ago.
 * - Any such request results in a redirect to the login flow.
 * - Sessions with lastActiveAt <= 24 hours ago are accepted (if otherwise valid).
 *
 * Validates: Requirements 9.3, 9.5
 *
 * Feature: solo-founder-launch-os, Property 14: Session Expiration Enforcement
 */

// Mock prisma before importing the middleware
vi.mock('../lib/prisma.js', () => ({
  default: {
    session: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    systemLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import prisma from '../lib/prisma.js';
import { sessionExpiration } from '../middleware/sessionExpiration.js';

const mockedPrisma = prisma as unknown as {
  session: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  systemLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

// --- Constants ---

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// --- Helpers ---

function createMockReq(userId: string, destroyFn?: (cb: (err?: Error) => void) => void): Request {
  return {
    isAuthenticated: () => true,
    user: { id: userId } as Express.User,
    session: {
      destroy: destroyFn || vi.fn((cb: (err?: Error) => void) => cb()),
    },
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function createSessionRecord(userId: string, lastActiveAt: Date) {
  return {
    id: `session-${userId}`,
    userId,
    token: `token-${userId}`,
    expiresAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS),
    lastActiveAt,
  };
}

// --- Arbitraries ---

/** Generates elapsed milliseconds representing sessions inactive > 24 hours (expired) */
const expiredElapsedArb: fc.Arbitrary<number> = fc.integer({
  min: TWENTY_FOUR_HOURS_MS + 1, // just over 24 hours
  max: 90 * 24 * 60 * 60 * 1000, // up to 90 days
});

/** Generates elapsed milliseconds representing sessions inactive <= 24 hours (valid) */
const validElapsedArb: fc.Arbitrary<number> = fc.integer({
  min: 0, // just now
  max: TWENTY_FOUR_HOURS_MS - 1000, // up to 24h minus 1 second (safe margin)
});

/** Generates random user IDs */
const userIdArb: fc.Arbitrary<string> = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
    minLength: 3,
    maxLength: 20,
  })
  .map((s) => `user-${s}`);

describe('Property 14: Session Expiration Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Validates: Requirements 9.3, 9.5
   *
   * For any session with lastActiveAt > 24 hours ago, the middleware MUST:
   * 1. Destroy the session
   * 2. Return a 401 Unauthorized error
   * 3. Include redirect context pointing to /login
   */
  it('no request succeeds with session inactive > 24 hours — always rejected with 401 and redirect', () => {
    fc.assert(
      fc.asyncProperty(userIdArb, expiredElapsedArb, async (userId, elapsedMs) => {
        vi.clearAllMocks();

        const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
        const req = createMockReq(userId, destroyFn);
        const res = createMockRes();
        const next: NextFunction = vi.fn();

        const lastActiveAt = new Date(Date.now() - elapsedMs);
        mockedPrisma.session.findFirst.mockResolvedValue(createSessionRecord(userId, lastActiveAt));

        sessionExpiration(req, res, next);

        await vi.waitFor(() => {
          expect(next).toHaveBeenCalled();
        });

        // PROPERTY: Session is destroyed
        expect(destroyFn).toHaveBeenCalled();

        // PROPERTY: Request is rejected with 401
        const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('UNAUTHORIZED');

        // PROPERTY: Redirect to login flow is indicated
        expect(error.context?.redirectTo).toBe('/login');
        expect(error.context?.reason).toBe('session_expired');

        // PROPERTY: Session update (lastActiveAt refresh) was NOT called
        expect(mockedPrisma.session.update).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.3, 9.5
   *
   * For any session with lastActiveAt <= 24 hours ago, the middleware MUST:
   * 1. Allow the request to proceed (call next() without error)
   * 2. Update lastActiveAt to the current time
   */
  it('requests with session inactive <= 24 hours always succeed', () => {
    fc.assert(
      fc.asyncProperty(userIdArb, validElapsedArb, async (userId, elapsedMs) => {
        vi.clearAllMocks();

        const req = createMockReq(userId);
        const res = createMockRes();
        const next: NextFunction = vi.fn();

        const lastActiveAt = new Date(Date.now() - elapsedMs);
        const session = createSessionRecord(userId, lastActiveAt);
        mockedPrisma.session.findFirst.mockResolvedValue(session);
        mockedPrisma.session.update.mockResolvedValue({
          ...session,
          lastActiveAt: new Date(),
        });

        sessionExpiration(req, res, next);

        await vi.waitFor(() => {
          expect(next).toHaveBeenCalled();
        });

        // PROPERTY: Request proceeds without error
        expect(next).toHaveBeenCalledWith();

        // PROPERTY: lastActiveAt is refreshed
        expect(mockedPrisma.session.update).toHaveBeenCalledWith({
          where: { id: session.id },
          data: { lastActiveAt: expect.any(Date) },
        });
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.5
   *
   * When no session record exists in DB for an authenticated user,
   * the request must be rejected with a redirect to login.
   */
  it('requests with no session record are always rejected with redirect to login', () => {
    fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        vi.clearAllMocks();

        const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
        const req = createMockReq(userId, destroyFn);
        const res = createMockRes();
        const next: NextFunction = vi.fn();

        // No session found in database
        mockedPrisma.session.findFirst.mockResolvedValue(null);

        sessionExpiration(req, res, next);

        await vi.waitFor(() => {
          expect(next).toHaveBeenCalled();
        });

        // PROPERTY: Session is destroyed
        expect(destroyFn).toHaveBeenCalled();

        // PROPERTY: Request is rejected with 401 and redirect
        const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(401);
        expect(error.context?.redirectTo).toBe('/login');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.3
   *
   * The 24-hour boundary is correctly enforced:
   * - Sessions just over 24 hours (24h + small delta) are expired
   * - Sessions just under 24 hours (24h - small delta) are valid
   */
  it('boundary enforcement: sessions just over 24 hours are expired, just under are valid', () => {
    fc.assert(
      fc.asyncProperty(
        userIdArb,
        // Small delta between 1ms and 60 seconds
        fc.integer({ min: 1, max: 60_000 }),
        async (userId, deltaMs) => {
          vi.clearAllMocks();

          // Test expired case: 24h + delta
          const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
          const reqExpired = createMockReq(userId, destroyFn);
          const resExpired = createMockRes();
          const nextExpired: NextFunction = vi.fn();

          const expiredAt = new Date(Date.now() - TWENTY_FOUR_HOURS_MS - deltaMs);
          mockedPrisma.session.findFirst.mockResolvedValue(createSessionRecord(userId, expiredAt));

          sessionExpiration(reqExpired, resExpired, nextExpired);

          await vi.waitFor(() => {
            expect(nextExpired).toHaveBeenCalled();
          });

          // PROPERTY: Just-expired session is rejected
          const expiredError = (nextExpired as ReturnType<typeof vi.fn>).mock
            .calls[0][0] as AppError;
          expect(expiredError).toBeInstanceOf(AppError);
          expect(expiredError.statusCode).toBe(401);

          // Now test valid case: 24h - delta
          vi.clearAllMocks();
          const reqValid = createMockReq(userId);
          const resValid = createMockRes();
          const nextValid: NextFunction = vi.fn();

          const validAt = new Date(Date.now() - TWENTY_FOUR_HOURS_MS + deltaMs);
          const validSession = createSessionRecord(userId, validAt);
          mockedPrisma.session.findFirst.mockResolvedValue(validSession);
          mockedPrisma.session.update.mockResolvedValue({
            ...validSession,
            lastActiveAt: new Date(),
          });

          sessionExpiration(reqValid, resValid, nextValid);

          await vi.waitFor(() => {
            expect(nextValid).toHaveBeenCalled();
          });

          // PROPERTY: Just-valid session is accepted
          expect(nextValid).toHaveBeenCalledWith();
        },
      ),
      { numRuns: 100 },
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { encrypt, decrypt } from '../lib/encryption.js';
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

// Valid 32-byte key as 64 hex characters
const TEST_KEY = 'a'.repeat(64);

/**
 * Validates: Requirements 9.4
 *
 * Property: Token encryption round-trip identity.
 * For any arbitrary string, encrypt(plaintext) followed by decrypt should
 * return the original plaintext. AES-256-GCM guarantees authenticated
 * encryption, so a successful decrypt proves integrity and confidentiality.
 */
describe('Property: Token Encryption Round-Trip (AES-256-GCM)', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('encrypt then decrypt is identity for any string', () => {
    fc.assert(
      fc.property(fc.string(), (plaintext) => {
        const encrypted = encrypt(plaintext);
        const decrypted = decrypt(encrypted);
        return decrypted === plaintext;
      }),
      { numRuns: 200 }
    );
  });

  it('encrypt produces unique ciphertexts for identical plaintexts (random IV)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (plaintext) => {
        const encrypted1 = encrypt(plaintext);
        const encrypted2 = encrypt(plaintext);
        // Different ciphertexts due to random IV
        return encrypted1 !== encrypted2;
      }),
      { numRuns: 100 }
    );
  });

  it('encrypted format is always iv:authTag:ciphertext with hex segments', () => {
    const hexPattern = /^[0-9a-f]+$/;
    fc.assert(
      fc.property(fc.string(), (plaintext) => {
        const encrypted = encrypt(plaintext);
        const parts = encrypted.split(':');
        // Must have exactly 3 parts
        if (parts.length !== 3) return false;
        const [iv, authTag, ciphertext] = parts;
        // IV is 12 bytes = 24 hex chars
        if (iv.length !== 24 || !hexPattern.test(iv)) return false;
        // Auth tag is 16 bytes = 32 hex chars
        if (authTag.length !== 32 || !hexPattern.test(authTag)) return false;
        // Ciphertext is valid hex (can be empty for empty plaintext)
        if (ciphertext.length > 0 && !hexPattern.test(ciphertext)) return false;
        return true;
      }),
      { numRuns: 200 }
    );
  });
});

/**
 * Validates: Requirements 9.3
 *
 * Property: Session expiration boundary at 24 hours of inactivity.
 * Sessions with lastActiveAt > 24 hours ago are expired.
 * Sessions with lastActiveAt <= 24 hours ago are active.
 */
describe('Property: Session Expiration Logic (24h inactivity)', () => {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockReq(userId: string, destroyFn?: any): Request {
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

  it('sessions older than 24 hours are always invalidated', () => {
    fc.assert(
      fc.asyncProperty(
        // Generate elapsed time between 24h+1ms and 30 days
        fc.integer({ min: TWENTY_FOUR_HOURS_MS + 1, max: 30 * 24 * 60 * 60 * 1000 }),
        async (elapsedMs) => {
          vi.clearAllMocks();
          const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
          const req = createMockReq('user-prop', destroyFn);
          const res = createMockRes();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const next: any = vi.fn();

          const lastActiveAt = new Date(Date.now() - elapsedMs);
          mockedPrisma.session.findFirst.mockResolvedValue({
            id: 'session-prop',
            userId: 'user-prop',
            token: 'token-prop',
            expiresAt: new Date(Date.now() + 86400000),
            lastActiveAt,
          });

          sessionExpiration(req, res, next);

          await vi.waitFor(() => {
            expect(next).toHaveBeenCalled();
          });

          // Session should be destroyed
          expect(destroyFn).toHaveBeenCalled();
          // next should be called with an AppError (401)
          const error = next.mock.calls[0][0] as AppError;
          expect(error).toBeInstanceOf(AppError);
          expect(error.statusCode).toBe(401);
          expect(error.code).toBe('UNAUTHORIZED');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('sessions within 24 hours are always kept active', () => {
    fc.assert(
      fc.asyncProperty(
        // Generate elapsed time between 0 and 24h - 1s (safely within bounds)
        fc.integer({ min: 0, max: TWENTY_FOUR_HOURS_MS - 1000 }),
        async (elapsedMs) => {
          vi.clearAllMocks();
          const req = createMockReq('user-prop');
          const res = createMockRes();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const next: any = vi.fn();

          const lastActiveAt = new Date(Date.now() - elapsedMs);
          mockedPrisma.session.findFirst.mockResolvedValue({
            id: 'session-prop',
            userId: 'user-prop',
            token: 'token-prop',
            expiresAt: new Date(Date.now() + 86400000),
            lastActiveAt,
          });
          mockedPrisma.session.update.mockResolvedValue({
            id: 'session-prop',
            userId: 'user-prop',
            token: 'token-prop',
            expiresAt: new Date(Date.now() + 86400000),
            lastActiveAt: new Date(),
          });

          sessionExpiration(req, res, next);

          await vi.waitFor(() => {
            expect(next).toHaveBeenCalled();
          });

          // next should be called without error (session is valid)
          expect(next).toHaveBeenCalledWith();
          // lastActiveAt should be updated
          expect(mockedPrisma.session.update).toHaveBeenCalledWith({
            where: { id: 'session-prop' },
            data: { lastActiveAt: expect.any(Date) },
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Validates: Requirements 9.3, 9.5
 *
 * Property: Auth middleware rejects requests without valid sessions.
 * When no session record exists in the database for an authenticated user,
 * the middleware destroys the session and returns 401 with redirect context.
 */
describe('Property: Auth Middleware Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockRes(): Response {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
  }

  it('unauthenticated requests always pass through without session check', () => {
    fc.assert(
      fc.property(
        fc.string(), // random user id (irrelevant since unauthenticated)
        (userId) => {
          vi.clearAllMocks();
          const req = {
            isAuthenticated: () => false,
            user: undefined,
            session: { destroy: vi.fn() },
          } as unknown as Request;
          const res = createMockRes();
          const next = vi.fn();

          sessionExpiration(req, res, next);

          // Should call next without error and not touch the database
          expect(next).toHaveBeenCalledWith();
          expect(mockedPrisma.session.findFirst).not.toHaveBeenCalled();
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('missing session record always results in 401 with redirect', async () => {
    // Test with various user IDs - all should get rejected when no session in DB
    const userIds = ['user-1', 'user-abc', 'user-uuid-12345'];

    for (const userId of userIds) {
      vi.clearAllMocks();
      const destroyFn = vi.fn((cb: (err?: Error) => void) => cb());
      const req = {
        isAuthenticated: () => true,
        user: { id: userId } as Express.User,
        session: { destroy: destroyFn },
      } as unknown as Request;
      const res = createMockRes();
      const next = vi.fn();

      mockedPrisma.session.findFirst.mockResolvedValue(null);

      sessionExpiration(req, res, next);

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalled();
      });

      expect(destroyFn).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(401);
      expect(error.context?.redirectTo).toBe('/login');
    }
  });
});

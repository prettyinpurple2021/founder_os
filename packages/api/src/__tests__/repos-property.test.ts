import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import fc from 'fast-check';

/**
 * Property 1: Single Repository Invariant
 * For any sequence of connect operations by a single user, at most one repository
 * is connected. Formally: count(repositories WHERE userId = u) <= 1 for all users u.
 *
 * Validates: Requirements 1.3
 */

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    sync: {
      create: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('../lib/encryption.js', () => ({
  getDecryptedToken: vi.fn(() => 'fake-github-token'),
}));

import prisma from '../lib/prisma.js';
import reposRouter from '../routes/repos.js';

// Create a test app that mimics the authenticated state
function createTestApp(user: Express.User) {
  const app = express();
  app.use(express.json());

  // Simulate authentication middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    (req as any).isAuthenticated = () => true;
    next();
  });

  app.use('/api/repos', reposRouter);

  // Error handler
  app.use(
    (
      err: Error & { statusCode?: number; code?: string; message?: string; retryable?: boolean },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message,
          retryable: err.retryable ?? true,
        },
      });
    },
  );

  return app;
}

// Arbitrary for generating random repository metadata
const repoMetadataArb = fc
  .record({
    githubId: fc.integer({ min: 1, max: 999999 }),
    name: fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/),
    owner: fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
  })
  .map(({ githubId, name, owner }) => ({
    githubId,
    name,
    fullName: `${owner}/${name}`,
    owner,
  }));

// Arbitrary for generating a sequence of connect operations (1 to 10 attempts)
const connectSequenceArb = fc.array(repoMetadataArb, { minLength: 1, maxLength: 10 });

describe('Property: Single Repository Invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for any sequence of connect operations by a single user, at most one repository is connected', () => {
    const mockUser = {
      id: 'user-prop-test',
      githubId: 'gh-prop-test',
      username: 'propuser',
      email: 'prop@test.com',
      accessToken: 'encrypted-token',
      syncInterval: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Express.User;

    fc.assert(
      fc.asyncProperty(connectSequenceArb, async (connectOps) => {
        vi.clearAllMocks();

        const app = createTestApp(mockUser);

        // Simulate the in-memory state of the repository table for this user
        let connectedRepo: Record<string, unknown> | null = null;

        // Mock findUnique to return the current connected repo (or null)
        (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockImplementation(() => {
          return Promise.resolve(connectedRepo);
        });

        // Mock create to simulate a successful repository creation
        (prisma.repository.create as ReturnType<typeof vi.fn>).mockImplementation(
          ({ data }: { data: Record<string, unknown> }) => {
            const newRepo = {
              id: `repo-${Date.now()}-${Math.random()}`,
              userId: data.userId,
              githubId: data.githubId,
              name: data.name,
              fullName: data.fullName,
              owner: data.owner,
              connectedAt: new Date(),
            };
            connectedRepo = newRepo;
            return Promise.resolve(newRepo);
          },
        );

        // Mock sync creation
        (prisma.sync.create as ReturnType<typeof vi.fn>).mockImplementation(() => {
          return Promise.resolve({
            id: `sync-${Date.now()}`,
            repositoryId: connectedRepo?.id,
            status: 'PENDING',
            startedAt: new Date(),
          });
        });

        // Execute the sequence of connect operations
        const responses: request.Response[] = [];
        for (const repoData of connectOps) {
          const res = await request(app).post('/api/repos/connect').send(repoData);
          responses.push(res);
        }

        // PROPERTY ASSERTION: At most one repository is connected for the user.
        // The first connect should succeed (201), all subsequent should be rejected (409).
        const successfulConnects = responses.filter((r) => r.status === 201);
        expect(successfulConnects.length).toBeLessThanOrEqual(1);

        // Additionally verify: if there were multiple attempts, subsequent ones got 409
        if (connectOps.length > 1) {
          const rejections = responses.filter((r) => r.status === 409);
          expect(rejections.length).toBe(connectOps.length - 1);
        }

        // The in-memory state should have at most one repository
        // (only the first connect should have created a record)
        if (connectedRepo) {
          expect(connectedRepo).not.toBeNull();
          // Verify it matches the first connect operation's data
          expect((connectedRepo as Record<string, unknown>).githubId).toBe(connectOps[0].githubId);
        }
      }),
      { numRuns: 50 },
    );
  });
});

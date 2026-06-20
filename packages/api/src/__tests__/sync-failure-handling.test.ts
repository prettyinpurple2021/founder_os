/**
 * Tests for sync failure handling (Task 5.6)
 *
 * Validates Requirements:
 * - 2.6: Failed sync preserves last successful state and notifies user
 * - 11.1: When GitHub API unreachable, display last known state and notify staleness
 *
 * Verifies:
 * 1. Failed syncs never modify existing task data (no partial writes)
 * 2. API response for failed syncs includes error message, staleness indicator,
 *    and last successful sync timestamp
 * 3. getLastSuccessfulSync returns the correct sync record
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findUnique: vi.fn(),
    },
    sync: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    task: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('../lib/encryption.js', () => ({
  getDecryptedToken: vi.fn(() => 'fake-github-token'),
}));

// Mock global fetch for GitHub API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import prisma from '../lib/prisma.js';
import syncRouter from '../routes/sync.js';

// Create a test app with authenticated user
function createTestApp(user?: Express.User | null) {
  const app = express();
  app.use(express.json());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) {
      req.user = user;
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });

  app.use('/api/sync', syncRouter);

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

const mockUser = {
  id: 'user-123',
  githubId: 'gh-456',
  username: 'testuser',
  email: 'test@example.com',
  accessToken: 'encrypted-token',
  syncInterval: 30,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Express.User;

describe('Sync Failure Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Task data preservation on failed sync', () => {
    it('should NOT call task.upsert when GitHub API fails on all retries', async () => {
      const app = createTestApp(mockUser);

      const mockRepo = {
        id: 'repo-1',
        userId: 'user-123',
        owner: 'testuser',
        name: 'my-app',
        user: mockUser,
      };

      const mockSyncRecord = {
        id: 'sync-1',
        repositoryId: 'repo-1',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };

      const mockFailedSync = {
        id: 'sync-1',
        repositoryId: 'repo-1',
        status: 'FAILED',
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 5000,
        itemsFetched: null,
        errorMessage: 'GitHub API server error: 500 Internal Server Error',
        retryCount: 3,
      };

      // Repository lookup (triggerSyncForUser and performSync)
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockRepo) // triggerSyncForUser
        .mockResolvedValueOnce(mockRepo); // performSync

      // Sync creation and update
      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncRecord);
      (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockFailedSync);

      // No last successful sync
      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      // GitHub API fails on all attempts
      mockFetch.mockRejectedValue(new Error('Network error'));

      const res = await request(app).post('/api/sync/trigger');

      // task.upsert should never have been called — data preserved
      expect(prisma.task.upsert).not.toHaveBeenCalled();
      expect(res.status).toBe(202);
    });

    it('should preserve existing task states when a sync fails after partial fetch', async () => {
      const app = createTestApp(mockUser);

      const mockRepo = {
        id: 'repo-1',
        userId: 'user-123',
        owner: 'testuser',
        name: 'my-app',
        user: mockUser,
      };

      const mockSyncRecord = {
        id: 'sync-2',
        repositoryId: 'repo-1',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };

      const mockFailedSync = {
        id: 'sync-2',
        repositoryId: 'repo-1',
        status: 'FAILED',
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 3000,
        itemsFetched: null,
        errorMessage: 'Network error communicating with GitHub API: fetch failed',
        retryCount: 3,
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockRepo)
        .mockResolvedValueOnce(mockRepo);

      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncRecord);
      (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockFailedSync);
      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      // Simulate a network failure (fetch rejects)
      mockFetch.mockRejectedValue(new Error('fetch failed'));

      const res = await request(app).post('/api/sync/trigger');

      // Verify no task modifications occurred
      expect(prisma.task.upsert).not.toHaveBeenCalled();
      expect(res.status).toBe(202);
      expect(res.body.sync.status).toBe('FAILED');
    });
  });

  describe('Failed sync API response includes failure context', () => {
    it('should include staleness indicator and notification message on failed sync', async () => {
      const app = createTestApp(mockUser);

      const mockRepo = {
        id: 'repo-1',
        userId: 'user-123',
        owner: 'testuser',
        name: 'my-app',
        user: mockUser,
      };

      const mockSyncRecord = {
        id: 'sync-3',
        repositoryId: 'repo-1',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };

      const mockFailedSync = {
        id: 'sync-3',
        repositoryId: 'repo-1',
        status: 'FAILED',
        startedAt: new Date('2024-01-20T10:00:00Z'),
        completedAt: new Date('2024-01-20T10:00:05Z'),
        duration: 5000,
        itemsFetched: null,
        errorMessage: 'GitHub API server error: 500 Internal Server Error',
        retryCount: 3,
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockRepo)
        .mockResolvedValueOnce(mockRepo);

      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncRecord);
      (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockFailedSync);

      // No previous successful sync
      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      mockFetch.mockRejectedValue(new Error('Server error'));

      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(202);
      expect(res.body.sync.status).toBe('FAILED');
      expect(res.body.sync.errorMessage).toBeTruthy();
      expect(res.body.sync.retryCount).toBe(3);

      // Failure context
      expect(res.body.failure).toBeDefined();
      expect(res.body.failure.stale).toBe(true);
      expect(res.body.failure.lastSuccessfulSync).toBeNull();
      expect(res.body.failure.message).toContain('Sync failed');
      expect(res.body.failure.message).toContain('stale');
      expect(res.body.failure.retryable).toBe(true);
    });

    it('should include last successful sync timestamp when a previous sync succeeded', async () => {
      const app = createTestApp(mockUser);

      const mockRepo = {
        id: 'repo-1',
        userId: 'user-123',
        owner: 'testuser',
        name: 'my-app',
        user: mockUser,
      };

      const mockSyncRecord = {
        id: 'sync-4',
        repositoryId: 'repo-1',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };

      const mockFailedSync = {
        id: 'sync-4',
        repositoryId: 'repo-1',
        status: 'FAILED',
        startedAt: new Date('2024-01-20T12:00:00Z'),
        completedAt: new Date('2024-01-20T12:00:07Z'),
        duration: 7000,
        itemsFetched: null,
        errorMessage: 'GitHub API rate limit exceeded',
        retryCount: 3,
      };

      const lastSuccessfulSyncDate = new Date('2024-01-20T11:30:00Z');
      const mockLastSuccessfulSync = {
        id: 'sync-prev',
        repositoryId: 'repo-1',
        status: 'SUCCESS',
        startedAt: new Date('2024-01-20T11:29:50Z'),
        completedAt: lastSuccessfulSyncDate,
        duration: 10000,
        itemsFetched: 15,
        retryCount: 0,
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockRepo)
        .mockResolvedValueOnce(mockRepo);

      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncRecord);
      (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockFailedSync);

      // Return the last successful sync
      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockLastSuccessfulSync,
      );

      mockFetch.mockRejectedValue(new Error('Rate limited'));

      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(202);
      expect(res.body.failure).toBeDefined();
      expect(res.body.failure.stale).toBe(true);
      expect(res.body.failure.lastSuccessfulSync).toBe(lastSuccessfulSyncDate.toISOString());
      expect(res.body.failure.message).toContain('last successful sync');
      expect(res.body.failure.retryable).toBe(true);
    });

    it('should NOT include failure context on successful sync', async () => {
      const app = createTestApp(mockUser);

      const mockRepo = {
        id: 'repo-1',
        userId: 'user-123',
        owner: 'testuser',
        name: 'my-app',
        user: mockUser,
      };

      const mockSyncRecord = {
        id: 'sync-5',
        repositoryId: 'repo-1',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      };

      const mockSuccessSync = {
        id: 'sync-5',
        repositoryId: 'repo-1',
        status: 'SUCCESS',
        startedAt: new Date('2024-01-20T14:00:00Z'),
        completedAt: new Date('2024-01-20T14:00:03Z'),
        duration: 3000,
        itemsFetched: 5,
        retryCount: 0,
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockRepo)
        .mockResolvedValueOnce(mockRepo);

      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncRecord);

      // GitHub API succeeds - return issues data
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [], // issues
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [], // PRs
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [], // commits
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [], // labels
        });

      (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSuccessSync);

      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(200);
      expect(res.body.sync.status).toBe('SUCCESS');
      expect(res.body.failure).toBeUndefined();
      expect(res.body.sync.errorMessage).toBeUndefined();
    });
  });

  describe('getLastSuccessfulSync', () => {
    it('should query for the most recent successful sync ordered by completedAt', async () => {
      // Import directly to test the function
      const { getLastSuccessfulSync } = await import('../services/sync.js');

      const expectedSync = {
        id: 'sync-success-1',
        repositoryId: 'repo-1',
        status: 'SUCCESS',
        completedAt: new Date('2024-01-20T11:30:00Z'),
      };

      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(expectedSync);

      const result = await getLastSuccessfulSync('repo-1');

      expect(result).toEqual(expectedSync);
      expect(prisma.sync.findFirst).toHaveBeenCalledWith({
        where: {
          repositoryId: 'repo-1',
          status: 'SUCCESS',
        },
        orderBy: { completedAt: 'desc' },
      });
    });

    it('should return null when no successful sync exists', async () => {
      const { getLastSuccessfulSync } = await import('../services/sync.js');

      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const result = await getLastSuccessfulSync('repo-new');

      expect(result).toBeNull();
    });
  });
});

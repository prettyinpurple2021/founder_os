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
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock the sync service to avoid it pulling in other mocks
vi.mock('../services/sync.js', () => ({
  triggerSyncForUser: vi.fn(),
}));

import prisma from '../lib/prisma.js';
import syncRouter from '../routes/sync.js';

// Create a test app that mimics the authenticated state
function createTestApp(user?: Express.User | null) {
  const app = express();
  app.use(express.json());

  // Simulate authentication middleware
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
      _next: NextFunction
    ) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message,
          retryable: err.retryable ?? true,
        },
      });
    }
  );

  return app;
}

const mockUser = {
  id: 'user-123',
  githubId: 'gh-456',
  username: 'testuser',
  email: 'test@example.com',
  accessToken: 'encrypted-token',
  syncInterval: 30, // 30 minutes
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Express.User;

describe('Sync Status & History Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/sync/status', () => {
    it('should return 401 when user is not authenticated', async () => {
      const app = createTestApp(null);

      const res = await request(app).get('/api/sync/status');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 when user has no connected repository', async () => {
      const app = createTestApp(mockUser);
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/sync/status');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_REPO_CONNECTED');
    });

    it('should return null lastSync and isStale=true when no syncs exist', async () => {
      const app = createTestApp(mockUser);
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/sync/status');
      expect(res.status).toBe(200);
      expect(res.body.lastSync).toBeNull();
      expect(res.body.isStale).toBe(true);
    });

    it('should return last sync data with isStale=false when sync is recent', async () => {
      const app = createTestApp(mockUser);
      const recentDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'sync-1',
        status: 'SUCCESS',
        startedAt: new Date(recentDate.getTime() - 5000),
        completedAt: recentDate,
        duration: 5000,
        itemsFetched: 15,
        errorMessage: null,
      });

      const res = await request(app).get('/api/sync/status');
      expect(res.status).toBe(200);
      expect(res.body.lastSync).not.toBeNull();
      expect(res.body.lastSync.id).toBe('sync-1');
      expect(res.body.lastSync.status).toBe('SUCCESS');
      expect(res.body.lastSync.itemsFetched).toBe(15);
      expect(res.body.lastSync.errorMessage).toBeNull();
      expect(res.body.isStale).toBe(false);
    });

    it('should return isStale=true when last successful sync exceeds syncInterval', async () => {
      const app = createTestApp(mockUser);
      // syncInterval is 30 minutes, last sync was 45 minutes ago
      const oldDate = new Date(Date.now() - 45 * 60 * 1000);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'sync-old',
        status: 'SUCCESS',
        startedAt: new Date(oldDate.getTime() - 3000),
        completedAt: oldDate,
        duration: 3000,
        itemsFetched: 8,
        errorMessage: null,
      });

      const res = await request(app).get('/api/sync/status');
      expect(res.status).toBe(200);
      expect(res.body.isStale).toBe(true);
    });

    it('should return isStale=true when last sync is FAILED (not SUCCESS)', async () => {
      const app = createTestApp(mockUser);
      const recentDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'sync-failed',
        status: 'FAILED',
        startedAt: new Date(recentDate.getTime() - 2000),
        completedAt: recentDate,
        duration: 2000,
        itemsFetched: null,
        errorMessage: 'GitHub API rate limit exceeded',
      });

      const res = await request(app).get('/api/sync/status');
      expect(res.status).toBe(200);
      expect(res.body.lastSync.status).toBe('FAILED');
      expect(res.body.lastSync.errorMessage).toBe('GitHub API rate limit exceeded');
      // isStale should be true since the last sync was not SUCCESS
      expect(res.body.isStale).toBe(true);
    });
  });

  describe('GET /api/sync/history', () => {
    it('should return 401 when user is not authenticated', async () => {
      const app = createTestApp(null);

      const res = await request(app).get('/api/sync/history');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 when user has no connected repository', async () => {
      const app = createTestApp(mockUser);
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/sync/history');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_REPO_CONNECTED');
    });

    it('should return sync history with default pagination', async () => {
      const app = createTestApp(mockUser);
      const syncs = [
        {
          id: 'sync-2',
          status: 'SUCCESS',
          startedAt: new Date('2024-01-16T12:00:00Z'),
          completedAt: new Date('2024-01-16T12:01:00Z'),
          duration: 60000,
          itemsFetched: 20,
          errorMessage: null,
          retryCount: 0,
        },
        {
          id: 'sync-1',
          status: 'FAILED',
          startedAt: new Date('2024-01-15T12:00:00Z'),
          completedAt: new Date('2024-01-15T12:00:30Z'),
          duration: 30000,
          itemsFetched: null,
          errorMessage: 'Connection timeout',
          retryCount: 3,
        },
      ];

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(syncs);
      (prisma.sync.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);

      const res = await request(app).get('/api/sync/history');
      expect(res.status).toBe(200);
      expect(res.body.syncs).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.syncs[0].id).toBe('sync-2');
      expect(res.body.syncs[0].retryCount).toBe(0);
      expect(res.body.syncs[1].id).toBe('sync-1');
      expect(res.body.syncs[1].errorMessage).toBe('Connection timeout');
      expect(res.body.syncs[1].retryCount).toBe(3);
    });

    it('should respect limit and offset query params', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 'sync-3',
          status: 'SUCCESS',
          startedAt: new Date('2024-01-14T12:00:00Z'),
          completedAt: new Date('2024-01-14T12:01:00Z'),
          duration: 60000,
          itemsFetched: 5,
          errorMessage: null,
          retryCount: 0,
        },
      ]);
      (prisma.sync.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);

      const res = await request(app).get('/api/sync/history?limit=1&offset=2');
      expect(res.status).toBe(200);
      expect(res.body.syncs).toHaveLength(1);
      expect(res.body.total).toBe(5);

      // Verify that prisma was called with correct pagination
      expect(prisma.sync.findMany).toHaveBeenCalledWith({
        where: { repositoryId: 'repo-1' },
        orderBy: { startedAt: 'desc' },
        take: 1,
        skip: 2,
      });
    });

    it('should cap limit at 100', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (prisma.sync.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

      await request(app).get('/api/sync/history?limit=500');

      expect(prisma.sync.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });

    it('should use default limit=20 when not provided', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (prisma.sync.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

      await request(app).get('/api/sync/history');

      expect(prisma.sync.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 0 })
      );
    });

    it('should handle invalid pagination params gracefully', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (prisma.sync.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

      await request(app).get('/api/sync/history?limit=abc&offset=-5');

      // Invalid limit falls back to default 20; negative offset becomes 0
      expect(prisma.sync.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 0 })
      );
    });

    it('should return empty array when no syncs exist', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'repo-1',
        userId: 'user-123',
      });
      (prisma.sync.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (prisma.sync.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

      const res = await request(app).get('/api/sync/history');
      expect(res.status).toBe(200);
      expect(res.body.syncs).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });
});

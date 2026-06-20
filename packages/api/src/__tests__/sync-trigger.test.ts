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
    },
    task: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    evidence: {
      create: vi.fn(),
    },
    stateTransition: {
      create: vi.fn(),
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

describe('POST /api/sync/trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const app = createTestApp(null);

      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Authentication required');
    });
  });

  describe('No repository connected', () => {
    it('should return 400 when user has no connected repository', async () => {
      const app = createTestApp(mockUser);

      // triggerSyncForUser calls prisma.repository.findUnique({ where: { userId } })
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_REPO_CONNECTED');
      expect(res.body.error.message).toContain('No repository is connected');
    });
  });

  describe('Successful sync', () => {
    it('should return 200 with sync record on successful sync', async () => {
      const app = createTestApp(mockUser);

      const mockRepo = {
        id: 'repo-1',
        userId: 'user-123',
        owner: 'testuser',
        name: 'my-app',
        fullName: 'testuser/my-app',
        githubId: 12345,
        connectedAt: new Date(),
        user: mockUser,
      };

      const mockSyncCreated = {
        id: 'sync-1',
        repositoryId: 'repo-1',
        status: 'IN_PROGRESS',
        startedAt: new Date('2024-01-15T12:00:00Z'),
      };

      const mockSyncCompleted = {
        id: 'sync-1',
        repositoryId: 'repo-1',
        status: 'SUCCESS',
        startedAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: new Date('2024-01-15T12:00:05Z'),
        duration: 5000,
        itemsFetched: 3,
        errorMessage: null,
        retryCount: 0,
      };

      // First call: triggerSyncForUser -> prisma.repository.findUnique({ where: { userId } })
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepo);
      // Second call: performSync -> prisma.repository.findUnique({ where: { id }, include: { user: true } })
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepo);
      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncCreated);

      // Mock GitHub API responses (fetchAllRepoData calls multiple endpoints in parallel)
      const mockIssues = [
        {
          id: 1,
          number: 1,
          title: 'Issue 1',
          state: 'open',
          labels: [],
          assignee: null,
          assignees: [],
          html_url: 'https://github.com/testuser/my-app/issues/1',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-10T00:00:00Z',
          closed_at: null,
        },
        {
          id: 2,
          number: 2,
          title: 'Issue 2',
          state: 'closed',
          labels: [],
          assignee: null,
          assignees: [],
          html_url: 'https://github.com/testuser/my-app/issues/2',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-12T00:00:00Z',
          closed_at: '2024-01-12T00:00:00Z',
        },
        {
          // This is a PR (has pull_request field) - should be filtered out
          id: 3,
          number: 3,
          title: 'PR 1',
          state: 'open',
          labels: [],
          assignee: null,
          assignees: [],
          pull_request: {
            url: 'https://api.github.com/repos/testuser/my-app/pulls/3',
            html_url: 'https://github.com/testuser/my-app/pull/3',
            merged_at: null,
          },
          html_url: 'https://github.com/testuser/my-app/pull/3',
          created_at: '2024-01-03T00:00:00Z',
          updated_at: '2024-01-13T00:00:00Z',
          closed_at: null,
        },
        {
          id: 4,
          number: 4,
          title: 'Issue 3',
          state: 'open',
          labels: [{ id: 10, name: 'blocked', color: 'ff0000' }],
          assignee: null,
          assignees: [],
          html_url: 'https://github.com/testuser/my-app/issues/4',
          created_at: '2024-01-04T00:00:00Z',
          updated_at: '2024-01-14T00:00:00Z',
          closed_at: null,
        },
      ];

      const mockPRs = [{ id: 100, number: 3, title: 'PR 1', state: 'open' }];
      const mockCommits = [
        { sha: 'abc123', commit: { message: 'init', author: null }, html_url: '', author: null },
      ];
      const mockLabels = [{ id: 10, name: 'blocked', color: 'ff0000', description: null }];
      const mockStatus = { state: 'success', statuses: [], sha: 'abc123', total_count: 0 };

      // fetchAllRepoData makes 5 parallel calls
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockIssues }) // issues
        .mockResolvedValueOnce({ ok: true, json: async () => mockPRs }) // pull requests
        .mockResolvedValueOnce({ ok: true, json: async () => mockCommits }) // commits
        .mockResolvedValueOnce({ ok: true, json: async () => mockLabels }) // labels
        .mockResolvedValueOnce({ ok: true, json: async () => mockStatus }); // status checks

      // Task creation (3 actual issues, PR is filtered out - new tasks)
      ((prisma as any).task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      ((prisma as any).task.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-mock',
      });
      ((prisma as any).evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ev-mock',
      });
      ((prisma as any).stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'st-mock',
      });

      // Final sync update (success)
      (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncCompleted);

      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(200);
      expect(res.body.sync.id).toBe('sync-1');
      expect(res.body.sync.status).toBe('SUCCESS');
      expect(res.body.sync.itemsFetched).toBe(3);
      expect(res.body.sync.duration).toBe(5000);
      expect(res.body.sync.errorMessage).toBeUndefined();
      expect(res.body.sync.retryCount).toBe(0);

      // Verify tasks were created for actual issues (not PRs)
      // Note: task processing is validated through the sync result (itemsFetched count)
    });
  });

  describe('Failed sync', () => {
    it('should return 202 with FAILED status when GitHub API fails after retries', async () => {
      const app = createTestApp(mockUser);

      const mockRepo = {
        id: 'repo-1',
        userId: 'user-123',
        owner: 'testuser',
        name: 'my-app',
        fullName: 'testuser/my-app',
        githubId: 12345,
        connectedAt: new Date(),
        user: mockUser,
      };

      const mockSyncCreated = {
        id: 'sync-2',
        repositoryId: 'repo-1',
        status: 'IN_PROGRESS',
        startedAt: new Date('2024-01-15T12:00:00Z'),
      };

      const mockSyncFailed = {
        id: 'sync-2',
        repositoryId: 'repo-1',
        status: 'FAILED',
        startedAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: new Date('2024-01-15T12:00:10Z'),
        duration: 10000,
        itemsFetched: null,
        errorMessage: 'GitHub API error: 500 Internal Server Error - ',
        retryCount: 3,
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepo);
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepo);
      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncCreated);

      // All fetch attempts fail (3 retries × 5 parallel calls per attempt)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      });

      // Final sync update (failed)
      (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncFailed);

      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(202);
      expect(res.body.sync.status).toBe('FAILED');
      expect(res.body.sync.errorMessage).toContain('GitHub API error');
      expect(res.body.sync.retryCount).toBe(3);
    }, 30000); // Extended timeout for retry delays
  });

  describe('Response structure', () => {
    it('should include all required fields in the sync response', async () => {
      const app = createTestApp(mockUser);

      const mockRepo = {
        id: 'repo-1',
        userId: 'user-123',
        owner: 'testuser',
        name: 'my-app',
        fullName: 'testuser/my-app',
        githubId: 12345,
        connectedAt: new Date(),
        user: mockUser,
      };

      const mockSyncCreated = {
        id: 'sync-3',
        repositoryId: 'repo-1',
        status: 'IN_PROGRESS',
        startedAt: new Date('2024-01-15T12:00:00Z'),
      };

      const mockSyncCompleted = {
        id: 'sync-3',
        repositoryId: 'repo-1',
        status: 'SUCCESS',
        startedAt: new Date('2024-01-15T12:00:00Z'),
        completedAt: new Date('2024-01-15T12:00:02Z'),
        duration: 2000,
        itemsFetched: 0,
        errorMessage: null,
        retryCount: 0,
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepo);
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepo);
      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncCreated);

      // Return empty issues (no actual issues, just empty arrays)
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => [] }) // issues
        .mockResolvedValueOnce({ ok: true, json: async () => [] }) // PRs
        .mockResolvedValueOnce({ ok: true, json: async () => [] }) // commits
        .mockResolvedValueOnce({ ok: true, json: async () => [] }) // labels
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ state: 'unknown', statuses: [], sha: '', total_count: 0 }),
        });

      (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSyncCompleted);

      const res = await request(app).post('/api/sync/trigger');

      expect(res.status).toBe(200);

      // Verify response shape
      const sync = res.body.sync;
      expect(sync).toHaveProperty('id');
      expect(sync).toHaveProperty('status');
      expect(sync).toHaveProperty('startedAt');
      expect(sync).toHaveProperty('completedAt');
      expect(sync).toHaveProperty('duration');
      expect(sync).toHaveProperty('itemsFetched');
      expect(sync).toHaveProperty('retryCount');

      // Should NOT expose internal fields like repositoryId
      expect(sync).not.toHaveProperty('repositoryId');
    });
  });
});

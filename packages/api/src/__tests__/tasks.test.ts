import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma.js';
import tasksRouter from '../routes/tasks.js';

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

  app.use('/api/tasks', tasksRouter);

  // Error handler
  app.use((err: Error & { statusCode?: number; code?: string; message?: string; retryable?: boolean }, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message,
        retryable: err.retryable ?? true,
      },
    });
  });

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

const mockRepository = {
  id: 'repo-1',
  userId: 'user-123',
  githubId: 12345,
  name: 'my-app',
  fullName: 'testuser/my-app',
  owner: 'testuser',
  connectedAt: new Date('2024-01-15T00:00:00Z'),
};

describe('Tasks Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const app = createTestApp(null);

      const res = await request(app).get('/api/tasks');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for evidence endpoint when not authenticated', async () => {
      const app = createTestApp(null);

      const res = await request(app).get('/api/tasks/task-1/evidence');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/tasks', () => {
    it('should return tasks for the connected repository', async () => {
      const app = createTestApp(mockUser);

      const mockTasks = [
        {
          id: 'task-1',
          githubIssueId: 1,
          title: 'Build landing page',
          state: 'IN_PROGRESS',
          blockerReason: null,
          lastInferredAt: new Date('2024-01-16T12:00:00Z'),
        },
        {
          id: 'task-2',
          githubIssueId: 2,
          title: 'Set up CI/CD',
          state: 'NOT_STARTED',
          blockerReason: null,
          lastInferredAt: null,
        },
      ];

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);
      (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockTasks);
      (prisma.task.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);

      const res = await request(app).get('/api/tasks');

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.tasks[0].title).toBe('Build landing page');
      expect(res.body.tasks[0].state).toBe('IN_PROGRESS');
    });

    it('should filter tasks by state when state query param is provided', async () => {
      const app = createTestApp(mockUser);

      const filteredTasks = [
        {
          id: 'task-1',
          githubIssueId: 1,
          title: 'Build landing page',
          state: 'IN_PROGRESS',
          blockerReason: null,
          lastInferredAt: new Date('2024-01-16T12:00:00Z'),
        },
      ];

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);
      (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(filteredTasks);
      (prisma.task.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

      const res = await request(app).get('/api/tasks?state=IN_PROGRESS');

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.tasks[0].state).toBe('IN_PROGRESS');
    });

    it('should return 400 for invalid state filter', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);

      const res = await request(app).get('/api/tasks?state=INVALID_STATE');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toContain('Invalid state filter');
    });

    it('should respect limit and offset query params', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);
      (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (prisma.task.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

      const res = await request(app).get('/api/tasks?limit=10&offset=20');

      expect(res.status).toBe(200);
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        })
      );
    });

    it('should cap limit at 100', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);
      (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (prisma.task.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

      const res = await request(app).get('/api/tasks?limit=500');

      expect(res.status).toBe(200);
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('should default limit to 50 and offset to 0', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);
      (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (prisma.task.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

      const res = await request(app).get('/api/tasks');

      expect(res.status).toBe(200);
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        })
      );
    });

    it('should return 404 when no repository is connected', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/tasks');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/tasks/:id/evidence', () => {
    it('should return evidence and state history for a task', async () => {
      const app = createTestApp(mockUser);

      const mockTask = {
        id: 'task-1',
        repositoryId: 'repo-1',
        evidence: [
          {
            id: 'ev-1',
            type: 'PR',
            url: 'https://github.com/testuser/my-app/pull/1',
            metadata: { number: 1, title: 'Feature PR' },
            fetchedAt: new Date('2024-01-16T12:00:00Z'),
          },
          {
            id: 'ev-2',
            type: 'COMMIT',
            url: 'https://github.com/testuser/my-app/commit/abc123',
            metadata: { sha: 'abc123', message: 'feat: add feature' },
            fetchedAt: new Date('2024-01-16T11:00:00Z'),
          },
        ],
        stateHistory: [
          {
            id: 'st-1',
            previousState: 'NOT_STARTED',
            newState: 'IN_PROGRESS',
            evidenceIds: ['ev-1', 'ev-2'],
            timestamp: new Date('2024-01-16T12:00:00Z'),
          },
        ],
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);
      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockTask);

      const res = await request(app).get('/api/tasks/task-1/evidence');

      expect(res.status).toBe(200);
      expect(res.body.evidence).toHaveLength(2);
      expect(res.body.evidence[0].type).toBe('PR');
      expect(res.body.evidence[0].url).toBe('https://github.com/testuser/my-app/pull/1');
      expect(res.body.stateHistory).toHaveLength(1);
      expect(res.body.stateHistory[0].previousState).toBe('NOT_STARTED');
      expect(res.body.stateHistory[0].newState).toBe('IN_PROGRESS');
      expect(res.body.stateHistory[0].evidenceIds).toEqual(['ev-1', 'ev-2']);
    });

    it('should return 404 when task is not found', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);
      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/tasks/nonexistent-task/evidence');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Task not found');
    });

    it('should return 404 when no repository is connected', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/tasks/task-1/evidence');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('No repository is currently connected');
    });

    it('should not return task belonging to a different repository', async () => {
      const app = createTestApp(mockUser);

      // The repository findUnique returns the user's repo
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRepository);
      // But findFirst returns null because the task doesn't match the repo
      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/tasks/other-user-task/evidence');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');

      // Verify that findFirst was called with the correct repo filter
      expect(prisma.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'other-user-task',
            repositoryId: 'repo-1',
          },
        })
      );
    });
  });
});

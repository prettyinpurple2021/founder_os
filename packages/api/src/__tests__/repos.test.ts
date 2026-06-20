import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

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

// Mock global fetch for GitHub API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import prisma from '../lib/prisma.js';
import reposRouter from '../routes/repos.js';

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

  app.use('/api/repos', reposRouter);

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

describe('Repos Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const app = createTestApp(null);

      const res = await request(app).get('/api/repos/available');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/repos/available', () => {
    it('should return a list of GitHub repositories', async () => {
      const app = createTestApp(mockUser);

      const githubRepos = [
        {
          id: 1,
          name: 'my-app',
          full_name: 'testuser/my-app',
          owner: { login: 'testuser' },
          private: false,
          description: 'A test app',
          html_url: 'https://github.com/testuser/my-app',
          language: 'TypeScript',
          pushed_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'another-repo',
          full_name: 'testuser/another-repo',
          owner: { login: 'testuser' },
          private: true,
          description: null,
          html_url: 'https://github.com/testuser/another-repo',
          language: null,
          pushed_at: null,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => githubRepos,
      });

      const res = await request(app).get('/api/repos/available');

      expect(res.status).toBe(200);
      expect(res.body.repositories).toHaveLength(2);
      expect(res.body.repositories[0]).toEqual({
        githubId: 1,
        name: 'my-app',
        fullName: 'testuser/my-app',
        owner: 'testuser',
        private: false,
        description: 'A test app',
        url: 'https://github.com/testuser/my-app',
        language: 'TypeScript',
        pushedAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should return 401 when GitHub token is invalid', async () => {
      const app = createTestApp(mockUser);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const res = await request(app).get('/api/repos/available');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 502 on GitHub API errors', async () => {
      const app = createTestApp(mockUser);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const res = await request(app).get('/api/repos/available');

      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('GITHUB_API_ERROR');
      expect(res.body.error.retryable).toBe(true);
    });
  });

  describe('POST /api/repos/connect', () => {
    it('should connect a repository and trigger initial sync', async () => {
      const app = createTestApp(mockUser);

      const createdRepo = {
        id: 'repo-1',
        userId: 'user-123',
        githubId: 12345,
        name: 'my-app',
        fullName: 'testuser/my-app',
        owner: 'testuser',
        connectedAt: new Date('2024-01-15T00:00:00Z'),
      };

      const createdSync = {
        id: 'sync-1',
        repositoryId: 'repo-1',
        status: 'PENDING',
        startedAt: new Date('2024-01-15T00:00:01Z'),
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      (prisma.repository.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createdRepo);
      (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createdSync);

      const res = await request(app)
        .post('/api/repos/connect')
        .send({
          githubId: 12345,
          name: 'my-app',
          fullName: 'testuser/my-app',
          owner: 'testuser',
        });

      expect(res.status).toBe(201);
      expect(res.body.repository.fullName).toBe('testuser/my-app');
      expect(res.body.repository.githubId).toBe(12345);
      expect(res.body.initialSync.status).toBe('PENDING');
    });

    it('should return 409 when a repository is already connected', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'existing-repo',
        userId: 'user-123',
        fullName: 'testuser/old-repo',
      });

      const res = await request(app)
        .post('/api/repos/connect')
        .send({
          githubId: 99999,
          name: 'new-repo',
          fullName: 'testuser/new-repo',
          owner: 'testuser',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('REPO_ALREADY_CONNECTED');
    });

    it('should return 400 when required fields are missing', async () => {
      const app = createTestApp(mockUser);

      const res = await request(app)
        .post('/api/repos/connect')
        .send({ githubId: 123 });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when githubId is not a number', async () => {
      const app = createTestApp(mockUser);

      const res = await request(app)
        .post('/api/repos/connect')
        .send({
          githubId: 'not-a-number',
          name: 'repo',
          fullName: 'user/repo',
          owner: 'user',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle Prisma unique constraint violation (P2002)', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      (prisma.repository.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: 'P2002' });

      const res = await request(app)
        .post('/api/repos/connect')
        .send({
          githubId: 12345,
          name: 'my-app',
          fullName: 'testuser/my-app',
          owner: 'testuser',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('REPO_ALREADY_CONNECTED');
    });
  });

  describe('DELETE /api/repos/disconnect', () => {
    it('should disconnect an existing repository', async () => {
      const app = createTestApp(mockUser);

      const existingRepo = {
        id: 'repo-1',
        userId: 'user-123',
        fullName: 'testuser/my-app',
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(existingRepo);
      (prisma.repository.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(existingRepo);

      const res = await request(app).delete('/api/repos/disconnect');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Repository disconnected successfully');
      expect(res.body.disconnectedRepo.fullName).toBe('testuser/my-app');
    });

    it('should return 404 when no repository is connected', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).delete('/api/repos/disconnect');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/repos/current', () => {
    it('should return the current connected repository with last sync info', async () => {
      const app = createTestApp(mockUser);

      const repo = {
        id: 'repo-1',
        userId: 'user-123',
        githubId: 12345,
        name: 'my-app',
        fullName: 'testuser/my-app',
        owner: 'testuser',
        connectedAt: new Date('2024-01-15T00:00:00Z'),
        syncs: [
          {
            id: 'sync-1',
            status: 'SUCCESS',
            startedAt: new Date('2024-01-16T12:00:00Z'),
            completedAt: new Date('2024-01-16T12:01:00Z'),
          },
        ],
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(repo);

      const res = await request(app).get('/api/repos/current');

      expect(res.status).toBe(200);
      expect(res.body.repository.fullName).toBe('testuser/my-app');
      expect(res.body.repository.lastSync).not.toBeNull();
      expect(res.body.repository.lastSync.status).toBe('SUCCESS');
    });

    it('should return repository with null lastSync when no syncs exist', async () => {
      const app = createTestApp(mockUser);

      const repo = {
        id: 'repo-1',
        userId: 'user-123',
        githubId: 12345,
        name: 'my-app',
        fullName: 'testuser/my-app',
        owner: 'testuser',
        connectedAt: new Date('2024-01-15T00:00:00Z'),
        syncs: [],
      };

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(repo);

      const res = await request(app).get('/api/repos/current');

      expect(res.status).toBe(200);
      expect(res.body.repository.fullName).toBe('testuser/my-app');
      expect(res.body.repository.lastSync).toBeNull();
    });

    it('should return 404 when no repository is connected', async () => {
      const app = createTestApp(mockUser);

      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/repos/current');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});

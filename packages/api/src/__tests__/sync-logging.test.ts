import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma - factory must not reference external variables
vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findUnique: vi.fn(),
    },
    sync: {
      create: vi.fn(),
      update: vi.fn(),
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

vi.mock('../lib/encryption.js', () => ({
  getDecryptedToken: vi.fn(() => 'fake-github-token'),
}));

vi.mock('../services/github.js', () => ({
  fetchAllRepoData: vi.fn(),
}));

import prisma from '../lib/prisma.js';
import { performSync } from '../services/sync.js';
import { fetchAllRepoData } from '../services/github.js';

const mockFetchAllRepoData = fetchAllRepoData as ReturnType<typeof vi.fn>;
const mockSyncCreate = prisma.sync.create as ReturnType<typeof vi.fn>;
const mockSyncUpdate = prisma.sync.update as ReturnType<typeof vi.fn>;
const mockRepoFindUnique = prisma.repository.findUnique as ReturnType<typeof vi.fn>;
const mockTaskFindFirst = (prisma as any).task.findFirst as ReturnType<typeof vi.fn>;
const mockTaskCreate = (prisma as any).task.create as ReturnType<typeof vi.fn>;

const mockRepository = {
  id: 'repo-123',
  userId: 'user-456',
  owner: 'testuser',
  name: 'my-project',
  fullName: 'testuser/my-project',
  githubId: 9999,
  connectedAt: new Date('2024-01-01'),
  user: {
    id: 'user-456',
    githubId: 'gh-789',
    username: 'testuser',
    email: 'test@example.com',
    accessToken: 'encrypted-token',
    syncInterval: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe('Sync Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Default mocks for evidence and state transition creation
    ((prisma as any).evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ev-mock' });
    ((prisma as any).stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'st-mock' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Successful Sync', () => {
    it('should store startedAt timestamp when sync record is created', async () => {
      const now = new Date('2024-06-15T10:00:00.000Z');
      vi.setSystemTime(now);

      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: now,
      });
      mockFetchAllRepoData.mockResolvedValue({
        issues: [],
        pullRequests: [],
        commits: [],
        labels: [],
        statusChecks: [],
      });
      mockSyncUpdate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'SUCCESS',
        startedAt: now,
        completedAt: now,
        duration: 0,
        itemsFetched: 0,
        retryCount: 0,
      });

      await performSync('repo-123');

      // Verify sync record created with startedAt
      expect(mockSyncCreate).toHaveBeenCalledWith({
        data: {
          repositoryId: 'repo-123',
          status: 'IN_PROGRESS',
          startedAt: expect.any(Date),
        },
      });

      const createCall = mockSyncCreate.mock.calls[0][0];
      expect(createCall.data.startedAt).toBeInstanceOf(Date);
    });

    it('should store duration in milliseconds on successful sync', async () => {
      const startTime = new Date('2024-06-15T10:00:00.000Z');
      vi.setSystemTime(startTime);

      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: startTime,
      });

      // Simulate fetching takes time
      mockFetchAllRepoData.mockImplementation(async () => {
        vi.advanceTimersByTime(1500);
        return {
          issues: [],
          pullRequests: [],
          commits: [],
          labels: [],
          statusChecks: [],
        };
      });

      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      await performSync('repo-123');

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            duration: 1500,
          }),
        })
      );
    });

    it('should store itemsFetched count on successful sync', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      // Return 3 real issues (no PRs)
      mockFetchAllRepoData.mockResolvedValue({
        issues: [
          { number: 1, title: 'Issue 1', state: 'open', labels: [], assignees: [] },
          { number: 2, title: 'Issue 2', state: 'open', labels: [], assignees: [] },
          { number: 3, title: 'Issue 3', state: 'closed', labels: [], assignees: [] },
        ],
        pullRequests: [],
        commits: [],
        labels: [],
        statusChecks: [],
      });
      mockTaskFindFirst.mockResolvedValue(null); mockTaskCreate.mockResolvedValue({ id: "task-mock" });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      await performSync('repo-123');

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemsFetched: 3,
          }),
        })
      );
    });

    it('should exclude pull requests from itemsFetched count', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      // GitHub issues endpoint returns PRs too
      mockFetchAllRepoData.mockResolvedValue({
        issues: [
          { number: 1, title: 'Issue 1', state: 'open', labels: [], assignees: [] },
          { number: 2, title: 'PR 1', state: 'open', labels: [], assignees: [], pull_request: { url: 'https://...' } },
          { number: 3, title: 'Issue 2', state: 'open', labels: [], assignees: [] },
        ],
        pullRequests: [],
        commits: [],
        labels: [],
        statusChecks: [],
      });
      mockTaskFindFirst.mockResolvedValue(null); mockTaskCreate.mockResolvedValue({ id: "task-mock" });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      await performSync('repo-123');

      // Only 2 real issues counted
      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemsFetched: 2,
          }),
        })
      );
    });

    it('should store SUCCESS status and completedAt on successful sync', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });
      mockFetchAllRepoData.mockResolvedValue({
        issues: [],
        pullRequests: [],
        commits: [],
        labels: [],
        statusChecks: [],
      });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      await performSync('repo-123');

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCESS',
            completedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should store retryCount of 0 when sync succeeds on first attempt', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });
      mockFetchAllRepoData.mockResolvedValue({
        issues: [],
        pullRequests: [],
        commits: [],
        labels: [],
        statusChecks: [],
      });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      await performSync('repo-123');

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            retryCount: 0,
          }),
        })
      );
    });

    it('should record all required fields together for a successful sync', async () => {
      const startTime = new Date('2024-06-15T10:00:00.000Z');
      vi.setSystemTime(startTime);

      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: startTime,
      });

      mockFetchAllRepoData.mockImplementation(async () => {
        vi.advanceTimersByTime(2000);
        return {
          issues: [
            { number: 1, title: 'Issue 1', state: 'open', labels: [], assignees: [] },
            { number: 2, title: 'Issue 2', state: 'open', labels: [], assignees: [] },
          ],
          pullRequests: [],
          commits: [],
          labels: [],
          statusChecks: [],
        };
      });
      mockTaskFindFirst.mockResolvedValue(null); mockTaskCreate.mockResolvedValue({ id: "task-mock" });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      await performSync('repo-123');

      const updateCall = mockSyncUpdate.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'sync-1' });
      expect(updateCall.data).toEqual({
        status: 'SUCCESS',
        completedAt: expect.any(Date),
        duration: 2000,
        itemsFetched: 2,
        retryCount: 0,
      });
    });
  });

  describe('Failed Sync', () => {
    it('should store FAILED status after all retries are exhausted', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      mockFetchAllRepoData.mockRejectedValue(new Error('GitHub API unavailable'));
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(1000); // first retry delay
      await vi.advanceTimersByTimeAsync(2000); // second retry delay
      await syncPromise;

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
          }),
        })
      );
    });

    it('should store errorMessage on failed sync', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      mockFetchAllRepoData.mockRejectedValue(new Error('Rate limit exceeded'));
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await syncPromise;

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorMessage: 'Rate limit exceeded',
          }),
        })
      );
    });

    it('should store completedAt and duration on failed sync', async () => {
      const startTime = new Date('2024-06-15T10:00:00.000Z');
      vi.setSystemTime(startTime);

      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: startTime,
      });

      mockFetchAllRepoData.mockImplementation(async () => {
        vi.advanceTimersByTime(500);
        throw new Error('Connection timeout');
      });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await syncPromise;

      const updateCall = mockSyncUpdate.mock.calls[0][0];
      expect(updateCall.data.completedAt).toBeInstanceOf(Date);
      expect(updateCall.data.duration).toBeGreaterThan(0);
    });

    it('should store retryCount equal to MAX_RETRIES (3) on exhausted retries', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      mockFetchAllRepoData.mockRejectedValue(new Error('API error'));
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await syncPromise;

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            retryCount: 3,
          }),
        })
      );
    });

    it('should record all required fields together for a failed sync', async () => {
      const startTime = new Date('2024-06-15T10:00:00.000Z');
      vi.setSystemTime(startTime);

      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: startTime,
      });

      const errorMsg = 'GitHub server returned 503';
      mockFetchAllRepoData.mockImplementation(async () => {
        vi.advanceTimersByTime(300);
        throw new Error(errorMsg);
      });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await syncPromise;

      const updateCall = mockSyncUpdate.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'sync-1' });
      expect(updateCall.data).toEqual({
        status: 'FAILED',
        completedAt: expect.any(Date),
        duration: expect.any(Number),
        errorMessage: errorMsg,
        retryCount: 3,
      });
      expect(updateCall.data.duration).toBeGreaterThan(0);
    });

    it('should store fallback error message when error is not an Error instance', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      // Throw a non-Error value
      mockFetchAllRepoData.mockRejectedValue('string error');
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await syncPromise;

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorMessage: 'string error',
          }),
        })
      );
    });
  });

  describe('Partial Failure (Success after retries)', () => {
    it('should store retryCount reflecting the number of failed attempts before success', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });

      // Fail first 2 attempts, succeed on 3rd
      let attempt = 0;
      mockFetchAllRepoData.mockImplementation(async () => {
        attempt++;
        if (attempt < 3) {
          throw new Error('Temporary error');
        }
        return {
          issues: [{ number: 1, title: 'Issue 1', state: 'open', labels: [], assignees: [] }],
          pullRequests: [],
          commits: [],
          labels: [],
          statusChecks: [],
        };
      });
      mockTaskFindFirst.mockResolvedValue(null); mockTaskCreate.mockResolvedValue({ id: "task-mock" });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(1000); // first retry delay
      await vi.advanceTimersByTimeAsync(2000); // second retry delay
      await syncPromise;

      // retryCount = attempt - 1 = 3 - 1 = 2
      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCESS',
            retryCount: 2,
            itemsFetched: 1,
          }),
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should throw error when repository is not found', async () => {
      mockRepoFindUnique.mockResolvedValue(null);

      await expect(performSync('nonexistent-repo')).rejects.toThrow(
        'Repository not found: nonexistent-repo'
      );

      // No sync record should be created
      expect(mockSyncCreate).not.toHaveBeenCalled();
    });

    it('should handle zero items fetched correctly', async () => {
      mockRepoFindUnique.mockResolvedValue(mockRepository);
      mockSyncCreate.mockResolvedValue({
        id: 'sync-1',
        repositoryId: 'repo-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      });
      mockFetchAllRepoData.mockResolvedValue({
        issues: [],
        pullRequests: [],
        commits: [],
        labels: [],
        statusChecks: [],
      });
      mockSyncUpdate.mockImplementation(async (args: any) => ({
        id: 'sync-1',
        ...args.data,
      }));

      await performSync('repo-123');

      expect(mockSyncUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemsFetched: 0,
          }),
        })
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Sync Service Retry Logic Tests
 *
 * Validates the exponential backoff retry behavior:
 * - attempt 1: immediate
 * - attempt 2: wait 1s (BASE_DELAY_MS * 2^0)
 * - attempt 3: wait 2s (BASE_DELAY_MS * 2^1)
 * - If all fail: mark sync as failed, retryCount=3, errorMessage set
 *
 * Validates: Requirements 2.5, 11.2
 */

// Mock prisma
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

// Mock encryption
vi.mock('../lib/encryption.js', () => ({
  getDecryptedToken: vi.fn(() => 'fake-github-token'),
}));

// Mock GitHub service
vi.mock('../services/github.js', () => ({
  fetchAllRepoData: vi.fn(),
}));

import prisma from '../lib/prisma.js';
import { fetchAllRepoData } from '../services/github.js';
import { performSync } from '../services/sync.js';

const mockRepository = {
  id: 'repo-123',
  userId: 'user-456',
  owner: 'testowner',
  name: 'testrepo',
  fullName: 'testowner/testrepo',
  githubId: 12345,
  connectedAt: new Date(),
  user: {
    id: 'user-456',
    githubId: 'gh-456',
    username: 'testuser',
    email: 'test@example.com',
    accessToken: 'encrypted-token',
    syncInterval: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const mockSyncRecord = {
  id: 'sync-789',
  repositoryId: 'repo-123',
  status: 'IN_PROGRESS',
  startedAt: new Date(),
};

describe('Sync Retry Logic', () => {
  let delayTimings: number[] = [];
  let originalSetTimeout: typeof setTimeout;

  beforeEach(() => {
    vi.clearAllMocks();
    delayTimings = [];

    // Use fake timers to track delay calls without actually waiting
    vi.useFakeTimers();

    // Mock repository lookup
    (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockRepository);

    // Mock sync record creation
    (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockSyncRecord);

    // Mock sync record update
    (prisma.sync.update as ReturnType<typeof vi.fn>).mockImplementation(({ data }) => {
      return Promise.resolve({ ...mockSyncRecord, ...data });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Retry count never exceeds 3', () => {
    it('calls fetchAllRepoData at most 3 times when it keeps failing', async () => {
      const apiError = new Error('GitHub API server error');

      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockRejectedValue(apiError);

      // Run the sync (fake timers will auto-advance)
      const syncPromise = performSync('repo-123');

      // Advance timers past all backoff delays (1s + 2s = 3s total)
      await vi.advanceTimersByTimeAsync(10000);

      const result = await syncPromise;

      // fetchAllRepoData should have been called exactly 3 times (MAX_RETRIES)
      expect(fetchAllRepoData).toHaveBeenCalledTimes(3);

      // The sync should be marked as FAILED
      expect(result.status).toBe('FAILED');
    });

    it('never retries more than 3 times regardless of error type', async () => {
      const errors = [
        new Error('Network timeout'),
        new Error('Rate limit exceeded'),
        new Error('Server 500 error'),
      ];

      let callCount = 0;
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const error = errors[callCount % errors.length];
        callCount++;
        return Promise.reject(error);
      });

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(10000);
      await syncPromise;

      expect(fetchAllRepoData).toHaveBeenCalledTimes(3);
    });
  });

  describe('Backoff delays follow the formula: BASE_DELAY_MS * 2^(attempt-1)', () => {
    it('waits 1s after first failure and 2s after second failure', async () => {
      // Track setTimeout calls to verify delay timing
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const apiError = new Error('GitHub API error');
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockRejectedValue(apiError);

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(10000);
      await syncPromise;

      // Filter setTimeout calls for the backoff delays (look for 1000ms and 2000ms)
      const delayCalls = setTimeoutSpy.mock.calls
        .map((call) => call[1])
        .filter((ms): ms is number => typeof ms === 'number' && ms >= 1000);

      // Should have exactly 2 delay calls (between attempt 1→2 and attempt 2→3)
      expect(delayCalls).toHaveLength(2);
      // First delay: BASE_DELAY_MS * 2^(1-1) = 1000 * 1 = 1000ms
      expect(delayCalls[0]).toBe(1000);
      // Second delay: BASE_DELAY_MS * 2^(2-1) = 1000 * 2 = 2000ms
      expect(delayCalls[1]).toBe(2000);

      setTimeoutSpy.mockRestore();
    });

    it('first attempt is immediate (no delay before attempt 1)', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      // Succeed on first attempt
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockResolvedValue({
        issues: [],
        pullRequests: [],
        commits: [],
        labels: [],
        statusChecks: [],
      });

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(100);
      await syncPromise;

      // No backoff delays should have been set (only 1 successful attempt)
      const delayCalls = setTimeoutSpy.mock.calls
        .map((call) => call[1])
        .filter((ms): ms is number => typeof ms === 'number' && ms >= 1000);

      expect(delayCalls).toHaveLength(0);
      expect(fetchAllRepoData).toHaveBeenCalledTimes(1);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('Successful retry on second attempt stops retrying', () => {
    it('stops after second attempt succeeds', async () => {
      let callCount = 0;
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Temporary failure'));
        }
        // Second attempt succeeds
        return Promise.resolve({
          issues: [
            {
              id: 1,
              number: 1,
              title: 'Test Issue',
              state: 'open',
              labels: [],
              assignee: null,
              assignees: [],
              html_url: 'https://github.com/test/test/issues/1',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              closed_at: null,
            },
          ],
          pullRequests: [],
          commits: [],
          labels: [],
          statusChecks: [],
        });
      });

      // Mock task findFirst + create for new tasks
      ((prisma as any).task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      ((prisma as any).task.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'task-mock' });
      ((prisma as any).evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ev-mock' });
      ((prisma as any).stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'st-mock' });

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await syncPromise;

      // Should have called fetchAllRepoData exactly 2 times (failed once, succeeded on retry)
      expect(fetchAllRepoData).toHaveBeenCalledTimes(2);

      // The sync should be successful
      expect(result.status).toBe('SUCCESS');

      // retryCount should be 1 (one retry was needed)
      expect(result.retryCount).toBe(1);
    });

    it('stops after third attempt succeeds', async () => {
      let callCount = 0;
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Temporary failure'));
        }
        // Third attempt succeeds
        return Promise.resolve({
          issues: [],
          pullRequests: [],
          commits: [],
          labels: [],
          statusChecks: [],
        });
      });

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(10000);
      const result = await syncPromise;

      // Should have called fetchAllRepoData exactly 3 times
      expect(fetchAllRepoData).toHaveBeenCalledTimes(3);

      // The sync should be successful
      expect(result.status).toBe('SUCCESS');

      // retryCount should be 2 (two retries were needed)
      expect(result.retryCount).toBe(2);
    });
  });

  describe('Final failed sync has retryCount=3 and error message', () => {
    it('marks sync as FAILED with retryCount=3 and stores error message', async () => {
      const apiError = new Error('GitHub API rate limit exceeded');
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockRejectedValue(apiError);

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(10000);
      const result = await syncPromise;

      // Verify the sync record was updated to FAILED
      expect(result.status).toBe('FAILED');
      expect(result.retryCount).toBe(3);
      expect(result.errorMessage).toBe('GitHub API rate limit exceeded');
    });

    it('sets retryCount to MAX_RETRIES (3) on total failure', async () => {
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused')
      );

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(10000);
      const result = await syncPromise;

      expect(prisma.sync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sync-789' },
          data: expect.objectContaining({
            status: 'FAILED',
            retryCount: 3,
            errorMessage: 'Connection refused',
          }),
        })
      );
    });

    it('includes duration in the failed sync record', async () => {
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Server error')
      );

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(10000);
      await syncPromise;

      expect(prisma.sync.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            completedAt: expect.any(Date),
            duration: expect.any(Number),
          }),
        })
      );
    });

    it('handles non-Error thrown values gracefully', async () => {
      (fetchAllRepoData as ReturnType<typeof vi.fn>).mockRejectedValue('string error');

      const syncPromise = performSync('repo-123');
      await vi.advanceTimersByTimeAsync(10000);
      const result = await syncPromise;

      expect(result.status).toBe('FAILED');
      expect(result.retryCount).toBe(3);
      expect(result.errorMessage).toBe('string error');
    });
  });

  describe('Repository not found', () => {
    it('throws an error when repository does not exist', async () => {
      (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(performSync('non-existent-repo')).rejects.toThrow(
        'Repository not found: non-existent-repo'
      );
    });
  });
});

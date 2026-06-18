/**
 * Tests for the automatic sync scheduler.
 * Validates: Requirements 2.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-cron
vi.mock('node-cron', () => {
  const mockTask = {
    stop: vi.fn(),
  };
  return {
    schedule: vi.fn(() => mockTask),
    __mockTask: mockTask,
  };
});

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findMany: vi.fn(),
    },
  },
}));

// Mock sync service - use the full path from the service's perspective
vi.mock('../services/sync.js', () => ({
  performSync: vi.fn(),
}));

import * as cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { performSync } from '../services/sync.js';
import {
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
} from '../services/scheduler.js';

describe('Scheduler Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure scheduler is stopped before each test
    stopScheduler();
  });

  afterEach(() => {
    stopScheduler();
  });

  describe('startScheduler', () => {
    it('should schedule a cron job that runs every minute', () => {
      startScheduler();

      expect(cron.schedule).toHaveBeenCalledWith(
        '* * * * *',
        expect.any(Function)
      );
    });

    it('should mark scheduler as running after start', () => {
      expect(isSchedulerRunning()).toBe(false);
      startScheduler();
      expect(isSchedulerRunning()).toBe(true);
    });

    it('should not create duplicate schedulers if called twice', () => {
      startScheduler();
      startScheduler();

      // schedule should only be called once
      expect(cron.schedule).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopScheduler', () => {
    it('should stop the cron task and mark as not running', () => {
      startScheduler();
      expect(isSchedulerRunning()).toBe(true);

      stopScheduler();
      expect(isSchedulerRunning()).toBe(false);
    });

    it('should be safe to call when not running', () => {
      expect(() => stopScheduler()).not.toThrow();
    });
  });

  describe('scheduled sync execution', () => {
    it('should sync repositories whose interval has elapsed', async () => {
      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);

      vi.mocked(prisma.repository.findMany).mockResolvedValue([
        {
          id: 'repo-1',
          userId: 'user-1',
          owner: 'owner',
          name: 'repo',
          fullName: 'owner/repo',
          githubId: 123,
          connectedAt: new Date(),
          user: { syncInterval: 30 },
          syncs: [{ completedAt: thirtyOneMinutesAgo }],
        } as any,
      ]);

      vi.mocked(performSync).mockResolvedValue({} as any);

      // Start the scheduler and capture the callback
      startScheduler();
      const cronCallback = vi.mocked(cron.schedule).mock.calls[0][1] as Function;

      // Execute the cron callback
      await cronCallback();

      // Wait for async operations (performSync is fire-and-forget)
      await new Promise((r) => setTimeout(r, 50));

      expect(performSync).toHaveBeenCalledWith('repo-1');
    });

    it('should skip repositories whose interval has NOT elapsed', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      vi.mocked(prisma.repository.findMany).mockResolvedValue([
        {
          id: 'repo-1',
          userId: 'user-1',
          owner: 'owner',
          name: 'repo',
          fullName: 'owner/repo',
          githubId: 123,
          connectedAt: new Date(),
          user: { syncInterval: 30 },
          syncs: [{ completedAt: fiveMinutesAgo }],
        } as any,
      ]);

      startScheduler();
      const cronCallback = vi.mocked(cron.schedule).mock.calls[0][1] as Function;

      await cronCallback();
      await new Promise((r) => setTimeout(r, 50));

      expect(performSync).not.toHaveBeenCalled();
    });

    it('should sync repositories that have never been synced', async () => {
      vi.mocked(prisma.repository.findMany).mockResolvedValue([
        {
          id: 'repo-1',
          userId: 'user-1',
          owner: 'owner',
          name: 'repo',
          fullName: 'owner/repo',
          githubId: 123,
          connectedAt: new Date(),
          user: { syncInterval: 30 },
          syncs: [], // no previous syncs
        } as any,
      ]);

      vi.mocked(performSync).mockResolvedValue({} as any);

      startScheduler();
      const cronCallback = vi.mocked(cron.schedule).mock.calls[0][1] as Function;

      await cronCallback();
      await new Promise((r) => setTimeout(r, 50));

      expect(performSync).toHaveBeenCalledWith('repo-1');
    });

    it('should respect per-user configurable sync intervals', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      vi.mocked(prisma.repository.findMany).mockResolvedValue([
        {
          id: 'repo-short',
          userId: 'user-short',
          owner: 'owner',
          name: 'short-interval',
          fullName: 'owner/short-interval',
          githubId: 1,
          connectedAt: new Date(),
          user: { syncInterval: 5 }, // 5-minute interval → should sync (10 > 5)
          syncs: [{ completedAt: tenMinutesAgo }],
        } as any,
        {
          id: 'repo-long',
          userId: 'user-long',
          owner: 'owner',
          name: 'long-interval',
          fullName: 'owner/long-interval',
          githubId: 2,
          connectedAt: new Date(),
          user: { syncInterval: 60 }, // 60-minute interval → should NOT sync (10 < 60)
          syncs: [{ completedAt: tenMinutesAgo }],
        } as any,
      ]);

      vi.mocked(performSync).mockResolvedValue({} as any);

      startScheduler();
      const cronCallback = vi.mocked(cron.schedule).mock.calls[0][1] as Function;

      await cronCallback();
      await new Promise((r) => setTimeout(r, 50));

      expect(performSync).toHaveBeenCalledWith('repo-short');
      expect(performSync).not.toHaveBeenCalledWith('repo-long');
    });

    it('should handle sync errors gracefully without stopping the scheduler', async () => {
      vi.mocked(prisma.repository.findMany).mockResolvedValue([
        {
          id: 'repo-1',
          userId: 'user-1',
          owner: 'owner',
          name: 'repo',
          fullName: 'owner/repo',
          githubId: 123,
          connectedAt: new Date(),
          user: { syncInterval: 30 },
          syncs: [], // never synced
        } as any,
      ]);

      vi.mocked(performSync).mockRejectedValue(new Error('Network error'));

      startScheduler();
      const cronCallback = vi.mocked(cron.schedule).mock.calls[0][1] as Function;

      // Should not throw even when performSync fails
      await cronCallback();
      await new Promise((r) => setTimeout(r, 50));

      expect(isSchedulerRunning()).toBe(true);
    });

    it('should handle database query errors gracefully', async () => {
      vi.mocked(prisma.repository.findMany).mockRejectedValue(
        new Error('DB connection lost')
      );

      startScheduler();
      const cronCallback = vi.mocked(cron.schedule).mock.calls[0][1] as Function;

      // Should not throw even when prisma fails
      await cronCallback();
      await new Promise((r) => setTimeout(r, 50));

      expect(isSchedulerRunning()).toBe(true);
    });

    it('should default to 30 minutes if user syncInterval is falsy', async () => {
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);

      vi.mocked(prisma.repository.findMany).mockResolvedValue([
        {
          id: 'repo-1',
          userId: 'user-1',
          owner: 'owner',
          name: 'repo',
          fullName: 'owner/repo',
          githubId: 123,
          connectedAt: new Date(),
          user: { syncInterval: 0 }, // falsy → should default to 30
          syncs: [{ completedAt: twentyMinutesAgo }],
        } as any,
      ]);

      startScheduler();
      const cronCallback = vi.mocked(cron.schedule).mock.calls[0][1] as Function;

      await cronCallback();
      await new Promise((r) => setTimeout(r, 50));

      // 20 min ago < 30 min default interval → should NOT sync
      expect(performSync).not.toHaveBeenCalled();
    });
  });
});

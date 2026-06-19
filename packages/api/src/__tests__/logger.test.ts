import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {
    systemLog: {
      create: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma.js';
import { log, logSync, logStateChange, logContent, logAuth, logError } from '../services/logger.js';

const mockedPrisma = prisma as any;

describe('Structured Logging Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.systemLog.create.mockResolvedValue({ id: 'log-1' });
  });

  describe('log()', () => {
    it('creates a SystemLog entry with correct category, action, details, and userId', async () => {
      await log({
        category: 'sync',
        action: 'repo_synced',
        details: { repoId: 'repo-123', commits: 5 },
        userId: 'user-1',
      });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'sync',
          action: 'repo_synced',
          details: { repoId: 'repo-123', commits: 5 },
          userId: 'user-1',
        },
      });
    });

    it('stores details as JSON object', async () => {
      const details = { nested: { key: 'value' }, array: [1, 2, 3], flag: true };

      await log({
        category: 'content',
        action: 'draft_created',
        details,
        userId: 'user-2',
      });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'content',
          action: 'draft_created',
          details: { nested: { key: 'value' }, array: [1, 2, 3], flag: true },
          userId: 'user-2',
        },
      });
    });

    it('sets userId to null when not provided', async () => {
      await log({
        category: 'error',
        action: 'unhandled_exception',
        details: { message: 'something failed' },
      });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'error',
          action: 'unhandled_exception',
          details: { message: 'something failed' },
          userId: null,
        },
      });
    });

    it('handles errors gracefully without throwing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockedPrisma.systemLog.create.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        log({
          category: 'sync',
          action: 'repo_synced',
          details: { repoId: 'repo-1' },
          userId: 'user-1',
        })
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[logger] Failed to write log entry:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('convenience helpers', () => {
    it('logSync passes category "sync" with userId', async () => {
      await logSync('user-1', 'repo_synced', { repoId: 'repo-123' });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'sync',
          action: 'repo_synced',
          details: { repoId: 'repo-123' },
          userId: 'user-1',
        },
      });
    });

    it('logStateChange passes category "state_change" with userId', async () => {
      await logStateChange('user-2', 'task_completed', { taskId: 'task-1' });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'state_change',
          action: 'task_completed',
          details: { taskId: 'task-1' },
          userId: 'user-2',
        },
      });
    });

    it('logContent passes category "content" with userId', async () => {
      await logContent('user-3', 'draft_approved', { draftId: 'draft-1' });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'content',
          action: 'draft_approved',
          details: { draftId: 'draft-1' },
          userId: 'user-3',
        },
      });
    });

    it('logAuth passes category "auth" and allows undefined userId', async () => {
      await logAuth(undefined, 'login_failed', { reason: 'invalid_token' });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'auth',
          action: 'login_failed',
          details: { reason: 'invalid_token' },
          userId: null,
        },
      });
    });

    it('logAuth passes userId when provided', async () => {
      await logAuth('user-4', 'login_success', { provider: 'github' });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'auth',
          action: 'login_success',
          details: { provider: 'github' },
          userId: 'user-4',
        },
      });
    });

    it('logError passes category "error" and allows undefined userId', async () => {
      await logError(undefined, 'unhandled_exception', { stack: 'Error at line 1' });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'error',
          action: 'unhandled_exception',
          details: { stack: 'Error at line 1' },
          userId: null,
        },
      });
    });

    it('logError passes userId when provided', async () => {
      await logError('user-5', 'sync_failed', { error: 'timeout' });

      expect(mockedPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'error',
          action: 'sync_failed',
          details: { error: 'timeout' },
          userId: 'user-5',
        },
      });
    });
  });
});

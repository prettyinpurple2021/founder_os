import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createNotification,
  getUnreadNotifications,
  getAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  buildResponseNotification,
} from '../services/notification.js';

// Mock Prisma
vi.mock('../lib/prisma.js', () => {
  return {
    default: {
      systemLog: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

import prisma from '../lib/prisma.js';

const mockPrisma = prisma as unknown as {
  systemLog: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createNotification', () => {
    it('creates a notification with all required fields', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      mockPrisma.systemLog.create.mockResolvedValue({
        id: 'notif-1',
        category: 'notification',
        action: 'operation_failed:sync',
        details: {
          title: 'Sync failed',
          message: 'GitHub API is unreachable after 3 retries.',
          severity: 'error',
          retryable: true,
          actionHint: 'Try again later.',
          operation: 'sync',
          read: false,
        },
        userId: 'user-1',
        timestamp: now,
      });

      const result = await createNotification({
        userId: 'user-1',
        operation: 'sync',
        title: 'Sync failed',
        message: 'GitHub API is unreachable after 3 retries.',
        retryable: true,
        actionHint: 'Try again later.',
      });

      expect(result.id).toBe('notif-1');
      expect(result.title).toBe('Sync failed');
      expect(result.message).toBe('GitHub API is unreachable after 3 retries.');
      expect(result.severity).toBe('error');
      expect(result.retryable).toBe(true);
      expect(result.actionHint).toBe('Try again later.');
      expect(result.operation).toBe('sync');
      expect(result.read).toBe(false);
      expect(result.timestamp).toBe('2024-01-15T10:00:00.000Z');
    });

    it('stores notification in SystemLog with category "notification"', async () => {
      mockPrisma.systemLog.create.mockResolvedValue({
        id: 'notif-2',
        category: 'notification',
        action: 'operation_failed:content_generation',
        details: {},
        userId: 'user-2',
        timestamp: new Date(),
      });

      await createNotification({
        userId: 'user-2',
        operation: 'content_generation',
        title: 'Content generation failed',
        message: 'LLM API timed out.',
        severity: 'warning',
        retryable: true,
      });

      expect(mockPrisma.systemLog.create).toHaveBeenCalledWith({
        data: {
          category: 'notification',
          action: 'operation_failed:content_generation',
          details: {
            title: 'Content generation failed',
            message: 'LLM API timed out.',
            severity: 'warning',
            retryable: true,
            actionHint: null,
            operation: 'content_generation',
            read: false,
          },
          userId: 'user-2',
        },
      });
    });

    it('defaults severity to "error" when not provided', async () => {
      mockPrisma.systemLog.create.mockResolvedValue({
        id: 'notif-3',
        category: 'notification',
        action: 'operation_failed:sync',
        details: {},
        userId: 'user-1',
        timestamp: new Date(),
      });

      await createNotification({
        userId: 'user-1',
        operation: 'sync',
        title: 'Sync failed',
        message: 'Connection refused.',
      });

      expect(mockPrisma.systemLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: expect.objectContaining({
              severity: 'error',
              retryable: true,
            }),
          }),
        }),
      );
    });

    it('returns a transient notification when database write fails', async () => {
      mockPrisma.systemLog.create.mockRejectedValue(new Error('DB connection failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await createNotification({
        userId: 'user-1',
        operation: 'sync',
        title: 'Sync failed',
        message: 'Network error.',
      });

      expect(result.id).toMatch(/^transient-/);
      expect(result.title).toBe('Sync failed');
      expect(result.message).toBe('Network error.');
      expect(result.severity).toBe('error');
    });
  });

  describe('getUnreadNotifications', () => {
    it('returns only unread notifications ordered by timestamp desc', async () => {
      const mockLogs = [
        {
          id: 'notif-a',
          details: {
            title: 'Sync failed',
            message: 'Error A',
            severity: 'error',
            retryable: true,
            operation: 'sync',
            read: false,
          },
          timestamp: new Date('2024-01-15T12:00:00Z'),
        },
        {
          id: 'notif-b',
          details: {
            title: 'Content generation failed',
            message: 'Error B',
            severity: 'warning',
            retryable: false,
            operation: 'content_generation',
            read: false,
          },
          timestamp: new Date('2024-01-15T11:00:00Z'),
        },
      ];

      mockPrisma.systemLog.findMany.mockResolvedValue(mockLogs);

      const result = await getUnreadNotifications('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('notif-a');
      expect(result[0].read).toBe(false);
      expect(result[1].id).toBe('notif-b');
      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          category: 'notification',
          details: {
            path: ['read'],
            equals: false,
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });
    });

    it('respects the limit parameter', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      await getUnreadNotifications('user-1', 5);

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('getAllNotifications', () => {
    it('returns both read and unread notifications', async () => {
      const mockLogs = [
        {
          id: 'notif-1',
          details: {
            title: 'Sync failed',
            message: 'Error',
            severity: 'error',
            retryable: true,
            operation: 'sync',
            read: true,
          },
          timestamp: new Date('2024-01-15T12:00:00Z'),
        },
        {
          id: 'notif-2',
          details: {
            title: 'Content failed',
            message: 'Timeout',
            severity: 'error',
            retryable: true,
            operation: 'content_generation',
            read: false,
          },
          timestamp: new Date('2024-01-15T11:00:00Z'),
        },
      ];

      mockPrisma.systemLog.findMany.mockResolvedValue(mockLogs);

      const result = await getAllNotifications('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].read).toBe(true);
      expect(result[1].read).toBe(false);
      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          category: 'notification',
        },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });
    });
  });

  describe('markNotificationRead', () => {
    it('marks an existing notification as read', async () => {
      mockPrisma.systemLog.findFirst.mockResolvedValue({
        id: 'notif-1',
        details: { title: 'Sync failed', message: 'Error', read: false, severity: 'error' },
        userId: 'user-1',
        category: 'notification',
      });
      mockPrisma.systemLog.update.mockResolvedValue({});

      const result = await markNotificationRead('notif-1', 'user-1');

      expect(result).toBe(true);
      expect(mockPrisma.systemLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          details: { title: 'Sync failed', message: 'Error', read: true, severity: 'error' },
        },
      });
    });

    it('returns false when notification does not exist', async () => {
      mockPrisma.systemLog.findFirst.mockResolvedValue(null);

      const result = await markNotificationRead('notif-999', 'user-1');

      expect(result).toBe(false);
      expect(mockPrisma.systemLog.update).not.toHaveBeenCalled();
    });

    it('returns false when notification belongs to another user', async () => {
      mockPrisma.systemLog.findFirst.mockResolvedValue(null); // Query filters by userId

      const result = await markNotificationRead('notif-1', 'user-other');

      expect(result).toBe(false);
    });
  });

  describe('markAllNotificationsRead', () => {
    it('marks all unread notifications as read and returns count', async () => {
      const unread = [
        { id: 'notif-1', details: { read: false, title: 'A' } },
        { id: 'notif-2', details: { read: false, title: 'B' } },
      ];
      mockPrisma.systemLog.findMany.mockResolvedValue(unread);
      mockPrisma.systemLog.update.mockResolvedValue({});

      const result = await markAllNotificationsRead('user-1');

      expect(result).toBe(2);
      expect(mockPrisma.systemLog.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.systemLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { details: { read: true, title: 'A' } },
      });
      expect(mockPrisma.systemLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-2' },
        data: { details: { read: true, title: 'B' } },
      });
    });

    it('returns 0 when no unread notifications exist', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      const result = await markAllNotificationsRead('user-1');

      expect(result).toBe(0);
      expect(mockPrisma.systemLog.update).not.toHaveBeenCalled();
    });
  });

  describe('buildResponseNotification', () => {
    it('builds a notification payload for API responses', () => {
      const notification = buildResponseNotification(
        'sync',
        'GitHub API returned 503 after 3 retries.',
        true,
        'Try again in a few minutes.',
      );

      expect(notification.title).toBe('Sync failed');
      expect(notification.message).toBe('GitHub API returned 503 after 3 retries.');
      expect(notification.severity).toBe('error');
      expect(notification.retryable).toBe(true);
      expect(notification.actionHint).toBe('Try again in a few minutes.');
      expect(notification.operation).toBe('sync');
      expect(notification.timestamp).toBeDefined();
    });

    it('formats operation names with underscores into readable titles', () => {
      const notification = buildResponseNotification(
        'content_generation',
        'LLM API timed out.',
        false,
      );

      expect(notification.title).toBe('Content generation failed');
    });

    it('handles single-word operation names', () => {
      const notification = buildResponseNotification('sync', 'Failed', true);

      expect(notification.title).toBe('Sync failed');
    });

    it('includes a timestamp', () => {
      const before = new Date().toISOString();
      const notification = buildResponseNotification('sync', 'Failed', true);
      const after = new Date().toISOString();

      expect(notification.timestamp >= before).toBe(true);
      expect(notification.timestamp <= after).toBe(true);
    });
  });
});

describe('Error Handler Notification Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes notification field in 500 error responses', async () => {
    // Import fresh to avoid stale mocks
    const { errorHandler } = await import('../middleware/errorHandler.js');
    const { internalError } = await import('../errors/AppError.js');

    const err = internalError('Database connection lost');
    const req = { method: 'POST', path: '/api/sync/trigger', user: { id: 'user-1' } } as any;
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.notification).toBeDefined();
    expect(body.notification.title).toContain('failed');
    expect(body.notification.message).toBe('Database connection lost');
    expect(body.notification.retryable).toBe(true);
    expect(body.notification.severity).toBe('error');
    expect(body.notification.actionHint).toBeDefined();
    expect(body.notification.operation).toBeDefined();
    expect(body.notification.timestamp).toBeDefined();
  });

  it('includes notification field in 503 error responses', async () => {
    const { errorHandler } = await import('../middleware/errorHandler.js');
    const { serviceUnavailable } = await import('../errors/AppError.js');

    const err = serviceUnavailable('GitHub API is down');
    const req = { method: 'POST', path: '/api/sync/trigger', user: { id: 'user-1' } } as any;
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.notification).toBeDefined();
    expect(body.notification.message).toBe('GitHub API is down');
    expect(body.notification.retryable).toBe(true);
  });

  it('does NOT include notification field in 4xx error responses', async () => {
    const { errorHandler } = await import('../middleware/errorHandler.js');
    const { badRequest } = await import('../errors/AppError.js');

    const err = badRequest('Missing required field');
    const req = { method: 'POST', path: '/api/repos/connect' } as any;
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.notification).toBeUndefined();
  });

  it('includes notification for unknown errors (generic 500)', async () => {
    const { errorHandler } = await import('../middleware/errorHandler.js');

    const err = new TypeError('Cannot read property of undefined');
    const req = { method: 'GET', path: '/api/dashboard', user: { id: 'user-2' } } as any;
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.notification).toBeDefined();
    expect(body.notification.severity).toBe('error');
    expect(body.notification.retryable).toBe(true);
    expect(body.notification.actionHint).toBeDefined();
  });

  it('uses operationName from AppError context when available', async () => {
    const { errorHandler } = await import('../middleware/errorHandler.js');
    const { AppError } = await import('../errors/AppError.js');

    const err = new AppError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'LLM API timeout',
      statusCode: 503,
      retryable: true,
      context: { operationName: 'content_generation' },
    });
    const req = { method: 'POST', path: '/api/content/generate', user: { id: 'user-1' } } as any;
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.notification.operation).toBe('content_generation');
    expect(body.notification.title).toBe('Content generation failed');
  });
});

// --- Helpers ---

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

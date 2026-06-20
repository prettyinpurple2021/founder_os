/**
 * Tests for the Stale Data Indicator middleware
 *
 * Validates: Requirements 11.1 — IF the GitHub API is unreachable, THEN THE System
 * SHALL display the last known state and notify the User that data may be stale.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import {
  getStalenessInfo,
  buildStalenessMessage,
  withStaleness,
  staleDataIndicator,
  StalenessInfo,
} from '../middleware/staleDataIndicator.js';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    sync: {
      findFirst: vi.fn(),
    },
    repository: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma.js';

const mockSyncFindFirst = prisma.sync.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockRepoFindUnique = prisma.repository.findUnique as unknown as ReturnType<typeof vi.fn>;

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    isAuthenticated: () => true,
    user: { id: 'user-1', syncInterval: 30 },
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: Partial<Response> = {
    locals: {},
  };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('buildStalenessMessage', () => {
  it('returns message with timestamp when lastSuccessfulSync is provided', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    const message = buildStalenessMessage(date);

    expect(message).toBe('Data may be stale. Last successful sync: 2024-01-15T10:30:00.000Z');
  });

  it('returns message without timestamp when lastSuccessfulSync is null', () => {
    const message = buildStalenessMessage(null);

    expect(message).toBe('Data may be stale. No successful sync has been recorded yet.');
  });
});

describe('withStaleness', () => {
  it('merges staleness fields when data is stale', () => {
    const data = { tasks: [], total: 0 };
    const staleness: StalenessInfo = {
      isStale: true,
      lastSuccessfulSync: new Date('2024-01-15T10:30:00.000Z'),
      stalenessMessage: 'Data may be stale. Last successful sync: 2024-01-15T10:30:00.000Z',
    };

    const result = withStaleness(data, staleness);

    expect(result).toEqual({
      tasks: [],
      total: 0,
      isStale: true,
      lastSuccessfulSync: new Date('2024-01-15T10:30:00.000Z'),
      stalenessMessage: 'Data may be stale. Last successful sync: 2024-01-15T10:30:00.000Z',
    });
  });

  it('only adds isStale: false when data is fresh', () => {
    const data = { tasks: [{ id: '1' }], total: 1 };
    const staleness: StalenessInfo = {
      isStale: false,
      lastSuccessfulSync: new Date('2024-01-15T10:30:00.000Z'),
      stalenessMessage: null,
    };

    const result = withStaleness(data, staleness);

    expect(result).toEqual({
      tasks: [{ id: '1' }],
      total: 1,
      isStale: false,
    });
    expect(result).not.toHaveProperty('lastSuccessfulSync');
    expect(result).not.toHaveProperty('stalenessMessage');
  });

  it('includes null lastSuccessfulSync when stale with no history', () => {
    const data = { dashboard: {} };
    const staleness: StalenessInfo = {
      isStale: true,
      lastSuccessfulSync: null,
      stalenessMessage: 'Data may be stale. No successful sync has been recorded yet.',
    };

    const result = withStaleness(data, staleness);

    expect(result.isStale).toBe(true);
    expect(result.lastSuccessfulSync).toBeNull();
    expect(result.stalenessMessage).toBe(
      'Data may be stale. No successful sync has been recorded yet.',
    );
  });
});

describe('getStalenessInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stale with null timestamp when no syncs exist', async () => {
    mockSyncFindFirst.mockResolvedValue(null);

    const result = await getStalenessInfo('repo-1');

    expect(result.isStale).toBe(true);
    expect(result.lastSuccessfulSync).toBeNull();
    expect(result.stalenessMessage).toBe(
      'Data may be stale. No successful sync has been recorded yet.',
    );
  });

  it('returns stale with last successful timestamp when most recent sync failed', async () => {
    const successDate = new Date('2024-01-15T10:30:00.000Z');

    // First call: most recent sync (failed)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-2',
      repositoryId: 'repo-1',
      status: 'FAILED',
      startedAt: new Date('2024-01-15T11:00:00.000Z'),
      completedAt: new Date('2024-01-15T11:00:05.000Z'),
      duration: 5000,
      itemsFetched: null,
      errorMessage: 'Network error',
      retryCount: 3,
    });

    // Second call: last successful sync
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'SUCCESS',
      startedAt: new Date('2024-01-15T10:29:00.000Z'),
      completedAt: successDate,
      duration: 3000,
      itemsFetched: 10,
      errorMessage: null,
      retryCount: 0,
    });

    const result = await getStalenessInfo('repo-1');

    expect(result.isStale).toBe(true);
    expect(result.lastSuccessfulSync).toEqual(successDate);
    expect(result.stalenessMessage).toBe(
      `Data may be stale. Last successful sync: ${successDate.toISOString()}`,
    );
  });

  it('returns not stale when most recent sync succeeded', async () => {
    const successDate = new Date('2024-01-15T10:30:00.000Z');

    // First call: most recent sync (success)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'SUCCESS',
      startedAt: new Date('2024-01-15T10:29:00.000Z'),
      completedAt: successDate,
      duration: 3000,
      itemsFetched: 10,
      errorMessage: null,
      retryCount: 0,
    });

    // Second call: last successful sync (same one)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'SUCCESS',
      startedAt: new Date('2024-01-15T10:29:00.000Z'),
      completedAt: successDate,
      duration: 3000,
      itemsFetched: 10,
      errorMessage: null,
      retryCount: 0,
    });

    const result = await getStalenessInfo('repo-1');

    expect(result.isStale).toBe(false);
    expect(result.lastSuccessfulSync).toEqual(successDate);
    expect(result.stalenessMessage).toBeNull();
  });

  it('returns not stale when sync is in progress but a previous success exists', async () => {
    const successDate = new Date('2024-01-15T10:30:00.000Z');

    // First call: most recent sync (in progress)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-2',
      repositoryId: 'repo-1',
      status: 'IN_PROGRESS',
      startedAt: new Date('2024-01-15T11:00:00.000Z'),
      completedAt: null,
      duration: null,
      itemsFetched: null,
      errorMessage: null,
      retryCount: 0,
    });

    // Second call: last successful sync
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'SUCCESS',
      startedAt: new Date('2024-01-15T10:29:00.000Z'),
      completedAt: successDate,
      duration: 3000,
      itemsFetched: 10,
      errorMessage: null,
      retryCount: 0,
    });

    const result = await getStalenessInfo('repo-1');

    expect(result.isStale).toBe(false);
    expect(result.lastSuccessfulSync).toEqual(successDate);
    expect(result.stalenessMessage).toBeNull();
  });

  it('returns stale when sync is in progress but no previous success exists', async () => {
    // First call: most recent sync (in progress)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'IN_PROGRESS',
      startedAt: new Date('2024-01-15T11:00:00.000Z'),
      completedAt: null,
      duration: null,
      itemsFetched: null,
      errorMessage: null,
      retryCount: 0,
    });

    // Second call: no successful sync
    mockSyncFindFirst.mockResolvedValueOnce(null);

    const result = await getStalenessInfo('repo-1');

    expect(result.isStale).toBe(true);
    expect(result.lastSuccessfulSync).toBeNull();
    expect(result.stalenessMessage).toBe(
      'Data may be stale. No successful sync has been recorded yet.',
    );
  });

  it('returns stale when most recent sync failed and no successful sync ever occurred', async () => {
    // First call: most recent sync (failed)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'FAILED',
      startedAt: new Date('2024-01-15T11:00:00.000Z'),
      completedAt: new Date('2024-01-15T11:00:05.000Z'),
      duration: 5000,
      itemsFetched: null,
      errorMessage: 'API timeout',
      retryCount: 3,
    });

    // Second call: no successful sync
    mockSyncFindFirst.mockResolvedValueOnce(null);

    const result = await getStalenessInfo('repo-1');

    expect(result.isStale).toBe(true);
    expect(result.lastSuccessfulSync).toBeNull();
    expect(result.stalenessMessage).toBe(
      'Data may be stale. No successful sync has been recorded yet.',
    );
  });
});

describe('staleDataIndicator middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through without staleness when user is not authenticated', async () => {
    const req = createMockReq({
      isAuthenticated: () => false,
      user: undefined,
    } as unknown as Partial<Request>);
    const res = createMockRes();
    const next = vi.fn();

    await staleDataIndicator(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.staleness).toBeUndefined();
  });

  it('passes through without staleness when no repository is connected', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    mockRepoFindUnique.mockResolvedValue(null);

    await staleDataIndicator(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.staleness).toBeUndefined();
  });

  it('attaches staleness info when last sync failed', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    const successDate = new Date('2024-01-15T10:30:00.000Z');

    mockRepoFindUnique.mockResolvedValue({
      id: 'repo-1',
      userId: 'user-1',
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
      githubId: 123,
      connectedAt: new Date(),
    });

    // Most recent sync (failed)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-2',
      repositoryId: 'repo-1',
      status: 'FAILED',
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 5000,
      itemsFetched: null,
      errorMessage: 'Network error',
      retryCount: 3,
    });

    // Last successful sync
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'SUCCESS',
      startedAt: new Date(),
      completedAt: successDate,
      duration: 3000,
      itemsFetched: 10,
      errorMessage: null,
      retryCount: 0,
    });

    await staleDataIndicator(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.staleness).toEqual({
      isStale: true,
      lastSuccessfulSync: successDate,
      stalenessMessage: `Data may be stale. Last successful sync: ${successDate.toISOString()}`,
    });
  });

  it('attaches fresh staleness info when last sync succeeded', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    const successDate = new Date('2024-01-15T10:30:00.000Z');

    mockRepoFindUnique.mockResolvedValue({
      id: 'repo-1',
      userId: 'user-1',
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
      githubId: 123,
      connectedAt: new Date(),
    });

    // Most recent sync (success)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'SUCCESS',
      startedAt: new Date(),
      completedAt: successDate,
      duration: 3000,
      itemsFetched: 10,
      errorMessage: null,
      retryCount: 0,
    });

    // Last successful sync (same)
    mockSyncFindFirst.mockResolvedValueOnce({
      id: 'sync-1',
      repositoryId: 'repo-1',
      status: 'SUCCESS',
      startedAt: new Date(),
      completedAt: successDate,
      duration: 3000,
      itemsFetched: 10,
      errorMessage: null,
      retryCount: 0,
    });

    await staleDataIndicator(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.staleness).toEqual({
      isStale: false,
      lastSuccessfulSync: successDate,
      stalenessMessage: null,
    });
  });

  it('continues without error when prisma throws', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    mockRepoFindUnique.mockRejectedValue(new Error('DB connection failed'));

    await staleDataIndicator(req, res, next);

    // Should still call next without error — graceful degradation
    expect(next).toHaveBeenCalledWith();
    expect(res.locals.staleness).toBeUndefined();
  });
});

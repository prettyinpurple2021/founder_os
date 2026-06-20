/**
 * Unit Tests for the Dashboard Aggregator
 *
 * Tests the getDashboard function which aggregates project status,
 * blockers, next action, recent progress, last sync, and launch readiness.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
    sync: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock the checklist service
vi.mock('../services/checklist.js', () => ({
  getChecklist: vi.fn(),
}));

import prisma from '../lib/prisma.js';
import { getChecklist } from '../services/checklist.js';
import { getDashboard } from '../services/dashboard.js';

const mockPrisma = prisma as unknown as {
  repository: { findUnique: ReturnType<typeof vi.fn> };
  task: { findMany: ReturnType<typeof vi.fn> };
  sync: { findFirst: ReturnType<typeof vi.fn> };
};

const mockGetChecklist = getChecklist as ReturnType<typeof vi.fn>;

// --- Fixtures ---

const MOCK_USER_ID = 'user-123';
const MOCK_REPO_ID = 'repo-456';
const MOCK_REPOSITORY = {
  id: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  owner: 'testuser',
  name: 'my-app',
  fullName: 'testuser/my-app',
  githubId: 12345,
  connectedAt: new Date(),
};

function makeMockTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Test Task',
    state: 'NOT_STARTED',
    blockerReason: null,
    lastInferredAt: null,
    ...overrides,
  };
}

// --- Tests ---

describe('getDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Requirement 8.1: Project Status', () => {
    it('returns aggregated project status with correct counts per state', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([
        makeMockTask({ id: '1', state: 'NOT_STARTED' }),
        makeMockTask({ id: '2', state: 'NOT_STARTED' }),
        makeMockTask({ id: '3', state: 'IN_PROGRESS' }),
        makeMockTask({ id: '4', state: 'BLOCKED', blockerReason: 'Waiting on API' }),
        makeMockTask({ id: '5', state: 'COMPLETED', lastInferredAt: new Date() }),
        makeMockTask({ id: '6', state: 'NEEDS_REVIEW' }),
        makeMockTask({ id: '7', state: 'UNCERTAIN' }),
      ]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result).not.toBeNull();
      expect(result!.projectStatus.total).toBe(7);
      expect(result!.projectStatus.byState.NOT_STARTED).toBe(2);
      expect(result!.projectStatus.byState.IN_PROGRESS).toBe(1);
      expect(result!.projectStatus.byState.BLOCKED).toBe(1);
      expect(result!.projectStatus.byState.COMPLETED).toBe(1);
      expect(result!.projectStatus.byState.NEEDS_REVIEW).toBe(1);
      expect(result!.projectStatus.byState.UNCERTAIN).toBe(1);
    });

    it('returns zero counts for all states when no tasks exist', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result).not.toBeNull();
      expect(result!.projectStatus.total).toBe(0);
      expect(result!.projectStatus.byState.NOT_STARTED).toBe(0);
      expect(result!.projectStatus.byState.IN_PROGRESS).toBe(0);
      expect(result!.projectStatus.byState.BLOCKED).toBe(0);
      expect(result!.projectStatus.byState.COMPLETED).toBe(0);
      expect(result!.projectStatus.byState.NEEDS_REVIEW).toBe(0);
      expect(result!.projectStatus.byState.UNCERTAIN).toBe(0);
    });
  });

  describe('Requirement 8.2: Blockers', () => {
    it('returns blocked tasks with their reasons', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([
        makeMockTask({
          id: '1',
          title: 'Auth Flow',
          state: 'BLOCKED',
          blockerReason: 'Waiting on OAuth setup',
        }),
        makeMockTask({
          id: '2',
          title: 'Deploy',
          state: 'BLOCKED',
          blockerReason: 'Need DNS access',
        }),
        makeMockTask({ id: '3', title: 'Tests', state: 'IN_PROGRESS' }),
      ]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result).not.toBeNull();
      expect(result!.blockers).toHaveLength(2);
      expect(result!.blockers[0]).toEqual({
        taskId: '1',
        title: 'Auth Flow',
        reason: 'Waiting on OAuth setup',
      });
      expect(result!.blockers[1]).toEqual({
        taskId: '2',
        title: 'Deploy',
        reason: 'Need DNS access',
      });
    });

    it('provides default reason when blockerReason is null', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([
        makeMockTask({ id: '1', title: 'Task X', state: 'BLOCKED', blockerReason: null }),
      ]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.blockers[0].reason).toBe('No reason provided');
    });

    it('returns empty blockers array when no tasks are blocked', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([
        makeMockTask({ id: '1', state: 'COMPLETED', lastInferredAt: new Date() }),
        makeMockTask({ id: '2', state: 'IN_PROGRESS' }),
      ]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.blockers).toHaveLength(0);
    });
  });

  describe('Requirement 8.3: Next Action', () => {
    it('returns next action from checklist nextBestAction', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue({
        categories: ['product', 'quality', 'deployment', 'legal/admin', 'marketing', 'content'],
        items: [],
        nextBestAction: {
          id: 'checklist-product',
          category: 'product',
          description: 'Core features complete and critical bugs resolved',
          status: 'incomplete',
          isBlocker: false,
          priority: 1,
        },
        summary: {
          total: 6,
          complete: 2,
          inProgress: 1,
          blocked: 0,
          incomplete: 3,
          readinessPercentage: 33,
        },
      });

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.nextAction).toEqual({
        description: 'Core features complete and critical bugs resolved',
        category: 'product',
        priority: 1,
      });
    });

    it('returns null nextAction when checklist has no next best action', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue({
        categories: [],
        items: [],
        nextBestAction: null,
        summary: {
          total: 6,
          complete: 6,
          inProgress: 0,
          blocked: 0,
          incomplete: 0,
          readinessPercentage: 100,
        },
      });

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.nextAction).toBeNull();
    });

    it('returns null nextAction when checklist is null', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.nextAction).toBeNull();
    });
  });

  describe('Requirement 8.4: Recent Progress', () => {
    it('returns only tasks completed within last 7 days', async () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([
        makeMockTask({
          id: '1',
          title: 'Recent Task',
          state: 'COMPLETED',
          lastInferredAt: threeDaysAgo,
        }),
        makeMockTask({
          id: '2',
          title: 'Older Recent Task',
          state: 'COMPLETED',
          lastInferredAt: sixDaysAgo,
        }),
        makeMockTask({
          id: '3',
          title: 'Old Task',
          state: 'COMPLETED',
          lastInferredAt: tenDaysAgo,
        }),
        makeMockTask({ id: '4', title: 'Active Task', state: 'IN_PROGRESS', lastInferredAt: now }),
      ]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.recentProgress).toHaveLength(2);
      expect(result!.recentProgress[0].taskId).toBe('1'); // most recent first
      expect(result!.recentProgress[1].taskId).toBe('2');
    });

    it('returns tasks ordered by lastInferredAt descending', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([
        makeMockTask({
          id: '1',
          title: 'Five days ago',
          state: 'COMPLETED',
          lastInferredAt: fiveDaysAgo,
        }),
        makeMockTask({
          id: '2',
          title: 'One day ago',
          state: 'COMPLETED',
          lastInferredAt: oneDayAgo,
        }),
        makeMockTask({
          id: '3',
          title: 'Two days ago',
          state: 'COMPLETED',
          lastInferredAt: twoDaysAgo,
        }),
      ]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.recentProgress[0].title).toBe('One day ago');
      expect(result!.recentProgress[1].title).toBe('Two days ago');
      expect(result!.recentProgress[2].title).toBe('Five days ago');
    });

    it('excludes completed tasks with null lastInferredAt', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([
        makeMockTask({ id: '1', title: 'No date', state: 'COMPLETED', lastInferredAt: null }),
      ]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.recentProgress).toHaveLength(0);
    });
  });

  describe('Requirement 8.5: Last Sync', () => {
    it('returns last sync info when sync exists', async () => {
      const syncDate = new Date('2024-01-15T10:00:00Z');
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.sync.findFirst.mockResolvedValue({
        id: 'sync-1',
        repositoryId: MOCK_REPO_ID,
        status: 'SUCCESS',
        startedAt: syncDate,
        completedAt: new Date('2024-01-15T10:01:00Z'),
        duration: 60,
        itemsFetched: 15,
        errorMessage: null,
        retryCount: 0,
      });
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.lastSync).toEqual({
        timestamp: syncDate,
        status: 'SUCCESS',
      });
    });

    it('returns null lastSync when no syncs exist', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.lastSync).toBeNull();
    });
  });

  describe('Launch Readiness', () => {
    it('returns launch readiness percentage and blocker count', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([
        makeMockTask({ id: '1', state: 'BLOCKED', blockerReason: 'Issue 1' }),
        makeMockTask({ id: '2', state: 'BLOCKED', blockerReason: 'Issue 2' }),
        makeMockTask({ id: '3', state: 'COMPLETED', lastInferredAt: new Date() }),
      ]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue({
        categories: [],
        items: [],
        nextBestAction: null,
        summary: {
          total: 6,
          complete: 4,
          inProgress: 1,
          blocked: 1,
          incomplete: 0,
          readinessPercentage: 67,
        },
      });

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.launchReadiness.percentage).toBe(67);
      expect(result!.launchReadiness.blockerCount).toBe(2);
    });

    it('returns 0 percentage when checklist is null', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(MOCK_REPOSITORY);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.sync.findFirst.mockResolvedValue(null);
      mockGetChecklist.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result!.launchReadiness.percentage).toBe(0);
      expect(result!.launchReadiness.blockerCount).toBe(0);
    });
  });

  describe('No Repository Connected', () => {
    it('returns null when no repository is connected', async () => {
      mockPrisma.repository.findUnique.mockResolvedValue(null);

      const result = await getDashboard(MOCK_USER_ID);

      expect(result).toBeNull();
    });
  });
});

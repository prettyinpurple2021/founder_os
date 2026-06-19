import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * State Change Logging Tests (Requirement 10.2)
 *
 * Verifies that logStateChange is called with correct parameters
 * when a task state transition occurs during sync.
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
    systemLog: {
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

vi.mock('../services/logger.js', () => ({
  logSync: vi.fn().mockResolvedValue(undefined),
  logStateChange: vi.fn().mockResolvedValue(undefined),
}));

import prisma from '../lib/prisma.js';
import { upsertTaskFromIssue } from '../services/sync.js';
import { logStateChange } from '../services/logger.js';
import type { GitHubIssue } from '../services/github.js';

const mockLogStateChange = logStateChange as ReturnType<typeof vi.fn>;
const mockTaskFindFirst = prisma.task.findFirst as ReturnType<typeof vi.fn>;
const mockTaskUpdate = prisma.task.update as ReturnType<typeof vi.fn>;
const mockTaskCreate = prisma.task.create as ReturnType<typeof vi.fn>;
const mockEvidenceCreate = (prisma as any).evidence.create as ReturnType<typeof vi.fn>;
const mockStateTransitionCreate = (prisma as any).stateTransition.create as ReturnType<typeof vi.fn>;

describe('State Change Logging (Requirement 10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvidenceCreate.mockResolvedValue({ id: 'ev-001' });
    mockStateTransitionCreate.mockResolvedValue({ id: 'st-001' });
  });

  it('should call logStateChange with correct parameters when a task state changes', async () => {
    // Existing task is IN_PROGRESS
    mockTaskFindFirst.mockResolvedValue({
      id: 'task-123',
      state: 'IN_PROGRESS',
    });

    // Task will be updated to COMPLETED (issue is closed)
    mockTaskUpdate.mockResolvedValue({ id: 'task-123' });

    const closedIssue: GitHubIssue = {
      id: 1001,
      number: 42,
      title: 'Implement user authentication',
      state: 'closed',
      html_url: 'https://github.com/user/repo/issues/42',
      labels: [],
      assignee: null,
      assignees: [],
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-06-15T10:00:00Z',
      closed_at: '2024-06-15T10:00:00Z',
    };

    await upsertTaskFromIssue(
      'repo-abc',
      closedIssue,
      [], // no PRs
      [], // no commits
      'user-456'
    );

    expect(mockLogStateChange).toHaveBeenCalledTimes(1);
    expect(mockLogStateChange).toHaveBeenCalledWith(
      'user-456',
      'task_state_changed',
      {
        taskId: 'task-123',
        previousState: 'IN_PROGRESS',
        newState: 'COMPLETED',
        evidenceIds: ['ev-001'],
        taskTitle: 'Implement user authentication',
      }
    );
  });

  it('should NOT call logStateChange when state does not change', async () => {
    // Existing task is NOT_STARTED
    mockTaskFindFirst.mockResolvedValue({
      id: 'task-789',
      state: 'NOT_STARTED',
    });

    mockTaskUpdate.mockResolvedValue({ id: 'task-789' });

    // Issue with no activity — will be inferred as NOT_STARTED (same state)
    const openIssue: GitHubIssue = {
      id: 1002,
      number: 10,
      title: 'Add dark mode',
      state: 'open',
      html_url: 'https://github.com/user/repo/issues/10',
      labels: [],
      assignee: null,
      assignees: [],
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
      closed_at: null,
    };

    await upsertTaskFromIssue(
      'repo-abc',
      openIssue,
      [], // no PRs
      [], // no commits
      'user-456'
    );

    expect(mockLogStateChange).not.toHaveBeenCalled();
  });

  it('should NOT call logStateChange for a newly created task', async () => {
    // No existing task
    mockTaskFindFirst.mockResolvedValue(null);
    mockTaskCreate.mockResolvedValue({ id: 'task-new' });

    const newIssue: GitHubIssue = {
      id: 1003,
      number: 99,
      title: 'New feature request',
      state: 'open',
      html_url: 'https://github.com/user/repo/issues/99',
      labels: [],
      assignee: null,
      assignees: [],
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
      closed_at: null,
    };

    await upsertTaskFromIssue(
      'repo-abc',
      newIssue,
      [],
      [],
      'user-456'
    );

    // New tasks don't count as a "state change" — they're initial transitions
    expect(mockLogStateChange).not.toHaveBeenCalled();
  });

  it('should use "system" as userId when userId is not provided', async () => {
    mockTaskFindFirst.mockResolvedValue({
      id: 'task-555',
      state: 'NEEDS_REVIEW',
    });
    mockTaskUpdate.mockResolvedValue({ id: 'task-555' });

    const closedIssue: GitHubIssue = {
      id: 1004,
      number: 55,
      title: 'Fix login bug',
      state: 'closed',
      html_url: 'https://github.com/user/repo/issues/55',
      labels: [],
      assignee: null,
      assignees: [],
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-06-15T12:00:00Z',
      closed_at: '2024-06-15T12:00:00Z',
    };

    // Call without userId
    await upsertTaskFromIssue(
      'repo-abc',
      closedIssue,
      [],
      [],
      undefined
    );

    expect(mockLogStateChange).toHaveBeenCalledWith(
      'system',
      'task_state_changed',
      expect.objectContaining({
        taskId: 'task-555',
        previousState: 'NEEDS_REVIEW',
        newState: 'COMPLETED',
      })
    );
  });

  it('should include all evidence IDs when multiple evidence artifacts exist', async () => {
    mockTaskFindFirst.mockResolvedValue({
      id: 'task-multi',
      state: 'IN_PROGRESS',
    });
    mockTaskUpdate.mockResolvedValue({ id: 'task-multi' });

    // Mock evidence creation to return different IDs
    mockEvidenceCreate
      .mockResolvedValueOnce({ id: 'ev-a' })
      .mockResolvedValueOnce({ id: 'ev-b' });

    // A closed issue with a merged PR will produce multiple evidence artifacts
    const closedIssue: GitHubIssue = {
      id: 1005,
      number: 77,
      title: 'Deploy to production',
      state: 'closed',
      html_url: 'https://github.com/user/repo/issues/77',
      labels: [],
      assignee: null,
      assignees: [],
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-06-15T15:00:00Z',
      closed_at: '2024-06-15T15:00:00Z',
    };

    await upsertTaskFromIssue(
      'repo-abc',
      closedIssue,
      [],
      [],
      'user-456'
    );

    expect(mockLogStateChange).toHaveBeenCalledWith(
      'user-456',
      'task_state_changed',
      expect.objectContaining({
        taskId: 'task-multi',
        evidenceIds: ['ev-a'],
      })
    );
  });

  it('should include taskTitle from the issue in the log details', async () => {
    mockTaskFindFirst.mockResolvedValue({
      id: 'task-title-test',
      state: 'NOT_STARTED',
    });
    mockTaskUpdate.mockResolvedValue({ id: 'task-title-test' });

    const issueWithTitle: GitHubIssue = {
      id: 1006,
      number: 88,
      title: 'Integrate payment gateway',
      state: 'closed',
      html_url: 'https://github.com/user/repo/issues/88',
      labels: [],
      assignee: null,
      assignees: [],
      created_at: '2024-06-01T00:00:00Z',
      updated_at: '2024-06-15T18:00:00Z',
      closed_at: '2024-06-15T18:00:00Z',
    };

    await upsertTaskFromIssue(
      'repo-abc',
      issueWithTitle,
      [],
      [],
      'user-456'
    );

    expect(mockLogStateChange).toHaveBeenCalledWith(
      'user-456',
      'task_state_changed',
      expect.objectContaining({
        taskTitle: 'Integrate payment gateway',
      })
    );
  });
});

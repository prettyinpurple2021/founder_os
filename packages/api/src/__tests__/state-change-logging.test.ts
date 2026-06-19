import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * State Change Logging Tests
 *
 * Verifies that every task state transition is logged with the correct schema:
 * - previousState
 * - newState
 * - evidenceIds (array of evidence IDs)
 * - taskId
 * - repositoryId
 *
 * Validates: Requirement 10.2
 */

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
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

// Mock logger
vi.mock('../services/logger.js', () => ({
  logSync: vi.fn().mockResolvedValue(undefined),
  logStateChange: vi.fn().mockResolvedValue(undefined),
  logContent: vi.fn().mockResolvedValue(undefined),
  logAuth: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn().mockResolvedValue(undefined),
  log: vi.fn().mockResolvedValue(undefined),
}));

import prisma from '../lib/prisma.js';
import { logStateChange } from '../services/logger.js';
import { upsertTaskFromIssue } from '../services/sync.js';
import type { GitHubIssue, GitHubPullRequest, GitHubCommit } from '../services/github.js';

const mockLogStateChange = logStateChange as ReturnType<typeof vi.fn>;

function createMockIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: 'Test issue',
    state: 'open',
    html_url: 'https://github.com/user/repo/issues/1',
    labels: [],
    assignees: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    closed_at: null,
    ...overrides,
  } as GitHubIssue;
}

function createMockPR(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 10,
    title: 'Fix issue #1',
    state: 'open',
    html_url: 'https://github.com/user/repo/pull/10',
    head: { ref: 'feature/1-fix', sha: 'abc123' },
    merged: false,
    merged_at: null,
    requested_reviewers: [],
    ...overrides,
  } as GitHubPullRequest;
}

describe('State Change Logging (Requirement 10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call logStateChange with correct schema when state changes', async () => {
    // Existing task is NOT_STARTED
    (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      state: 'NOT_STARTED',
    });

    // Task gets updated
    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
    });

    // Evidence creation
    (prisma.evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ev-1',
    });

    // StateTransition creation
    ((prisma as any).stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'st-1',
    });

    const issue = createMockIssue();
    // Open PR with no reviewers → IN_PROGRESS
    const pr = createMockPR();

    await upsertTaskFromIssue('repo-123', issue, [pr], [], 'user-456');

    // Verify logStateChange was called
    expect(mockLogStateChange).toHaveBeenCalledOnce();
    expect(mockLogStateChange).toHaveBeenCalledWith(
      'user-456',
      'state_transition',
      {
        taskId: 'task-1',
        previousState: 'NOT_STARTED',
        newState: 'IN_PROGRESS',
        evidenceIds: ['ev-1'],
        repositoryId: 'repo-123',
      }
    );
  });

  it('should NOT call logStateChange when state remains the same', async () => {
    // Existing task is NOT_STARTED
    (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-2',
      state: 'NOT_STARTED',
    });

    // Task update (state stays NOT_STARTED — no PRs, no commits, no assignees)
    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-2',
    });

    const issue = createMockIssue();

    await upsertTaskFromIssue('repo-123', issue, [], [], 'user-456');

    // No state change → no log
    expect(mockLogStateChange).not.toHaveBeenCalled();
  });

  it('should NOT call logStateChange for new tasks (initial state)', async () => {
    // No existing task
    (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    // New task created
    (prisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-new',
    });

    // Evidence and transition are created for new tasks
    (prisma.evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ev-new',
    });
    ((prisma as any).stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'st-new',
    });

    const issue = createMockIssue();

    await upsertTaskFromIssue('repo-123', issue, [], [], 'user-456');

    // New task is NOT a state change (isNewTask, not stateChanged)
    expect(mockLogStateChange).not.toHaveBeenCalled();
  });

  it('should include multiple evidence IDs when state change produces multiple artifacts', async () => {
    // Existing task is IN_PROGRESS
    (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-3',
      state: 'IN_PROGRESS',
    });

    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-3',
    });

    // Multiple evidence records created
    let evidenceCounter = 0;
    (prisma.evidence.create as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      evidenceCounter++;
      return { id: `ev-${evidenceCounter}` };
    });

    ((prisma as any).stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'st-3',
    });

    // Issue is closed → COMPLETED (produces issue evidence)
    const issue = createMockIssue({ state: 'closed', closed_at: '2024-06-01T00:00:00Z' });

    await upsertTaskFromIssue('repo-123', issue, [], [], 'user-456');

    expect(mockLogStateChange).toHaveBeenCalledOnce();
    const callArgs = mockLogStateChange.mock.calls[0];
    expect(callArgs[0]).toBe('user-456');
    expect(callArgs[1]).toBe('state_transition');
    expect(callArgs[2]).toEqual({
      taskId: 'task-3',
      previousState: 'IN_PROGRESS',
      newState: 'COMPLETED',
      evidenceIds: expect.any(Array),
      repositoryId: 'repo-123',
    });
    // Evidence IDs should be non-empty
    expect(callArgs[2].evidenceIds.length).toBeGreaterThanOrEqual(1);
  });

  it('should use "system" as userId when no userId is provided', async () => {
    // Existing task
    (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-4',
      state: 'NOT_STARTED',
    });

    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-4',
    });

    (prisma.evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ev-4',
    });

    ((prisma as any).stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'st-4',
    });

    const issue = createMockIssue({ state: 'closed', closed_at: '2024-06-01T00:00:00Z' });

    // No userId provided
    await upsertTaskFromIssue('repo-123', issue, [], []);

    expect(mockLogStateChange).toHaveBeenCalledOnce();
    expect(mockLogStateChange).toHaveBeenCalledWith(
      'system',
      'state_transition',
      expect.objectContaining({
        taskId: 'task-4',
        previousState: 'NOT_STARTED',
        newState: 'COMPLETED',
      })
    );
  });
});

/**
 * Tests for evidence preservation during task state transitions.
 *
 * Validates Requirement 3.8: THE System SHALL preserve the Evidence
 * used to infer each Task_State transition.
 *
 * Tests verify:
 * - Evidence records are created when state changes
 * - StateTransition records are created with correct previous/new state
 * - No transition is created when state remains the same
 * - EvidenceIds in the transition reference valid Evidence records
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before any imports that use it
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

// Mock encryption
vi.mock('../lib/encryption.js', () => ({
  getDecryptedToken: vi.fn(() => 'fake-token'),
}));

import prisma from '../lib/prisma.js';
import { upsertTaskFromIssue } from '../services/sync.js';
import type { GitHubIssue, GitHubPullRequest, GitHubCommit } from '../services/github.js';

// --- Test Helpers ---

function createMockIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 1,
    number: 42,
    title: 'Test Issue',
    state: 'open',
    labels: [],
    assignee: null,
    assignees: [],
    html_url: 'https://github.com/owner/repo/issues/42',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

function createMockPR(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    id: 100,
    number: 10,
    title: 'Fix #42',
    state: 'open',
    merged: false,
    merged_at: null,
    html_url: 'https://github.com/owner/repo/pull/10',
    head: { ref: 'feature/42-test', sha: 'abc123' },
    base: { ref: 'main' },
    requested_reviewers: [],
    labels: [],
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

function createMockCommit(overrides: Partial<GitHubCommit> = {}): GitHubCommit {
  return {
    sha: 'abc123',
    commit: {
      message: 'feat: add feature',
      author: { name: 'dev', date: new Date().toISOString() },
    },
    html_url: 'https://github.com/owner/repo/commit/abc123',
    author: { login: 'dev' },
    ...overrides,
  };
}

describe('Evidence Preservation', () => {
  const repositoryId = 'repo-uuid-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('State change: creates Evidence and StateTransition', () => {
    it('should create Evidence records and a StateTransition when state changes from NOT_STARTED to IN_PROGRESS', async () => {
      const issue = createMockIssue();
      const pr = createMockPR();
      const commit = createMockCommit();

      // Existing task with NOT_STARTED state
      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-1',
        state: 'NOT_STARTED',
      });

      // Upsert returns the task with new state
      (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-1',
        repositoryId,
        githubIssueId: 42,
        title: 'Test Issue',
        state: 'IN_PROGRESS',
      });

      // Evidence creation - return records with IDs
      (prisma.evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'evidence-1',
        taskId: 'task-1',
        type: 'COMMIT',
        url: 'https://github.com/owner/repo/commit/abc123',
        metadata: { reason: 'recent_commit', sha: 'abc123' },
      });

      // StateTransition creation
      (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'transition-1',
        taskId: 'task-1',
        previousState: 'NOT_STARTED',
        newState: 'IN_PROGRESS',
        evidenceIds: ['evidence-1'],
      });

      await upsertTaskFromIssue(repositoryId, issue, [pr], [commit]);

      // Verify Evidence was created
      expect(prisma.evidence.create).toHaveBeenCalled();
      const evidenceCall = (prisma.evidence.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(evidenceCall.data.taskId).toBe('task-1');
      expect(evidenceCall.data.type).toBe('COMMIT');
      expect(evidenceCall.data.url).toContain('github.com');

      // Verify StateTransition was created
      expect(prisma.stateTransition.create).toHaveBeenCalledOnce();
      const transitionCall = (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(transitionCall.data.taskId).toBe('task-1');
      expect(transitionCall.data.previousState).toBe('NOT_STARTED');
      expect(transitionCall.data.newState).toBe('IN_PROGRESS');
      expect(transitionCall.data.evidenceIds).toContain('evidence-1');
    });

    it('should create Evidence records when state changes from IN_PROGRESS to COMPLETED', async () => {
      const issue = createMockIssue({ state: 'closed', closed_at: '2024-01-20T00:00:00Z' });

      // Existing task with IN_PROGRESS state
      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-2',
        state: 'IN_PROGRESS',
      });

      (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-2',
        repositoryId,
        githubIssueId: 42,
        title: 'Test Issue',
        state: 'COMPLETED',
      });

      (prisma.evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'evidence-2',
        taskId: 'task-2',
        type: 'ISSUE',
        url: 'https://github.com/owner/repo/issues/42',
        metadata: { reason: 'issue_closed' },
      });

      (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'transition-2',
        taskId: 'task-2',
        previousState: 'IN_PROGRESS',
        newState: 'COMPLETED',
        evidenceIds: ['evidence-2'],
      });

      await upsertTaskFromIssue(repositoryId, issue, [], []);

      // Verify Evidence was created with ISSUE type (closed issue)
      expect(prisma.evidence.create).toHaveBeenCalledOnce();
      const evidenceCall = (prisma.evidence.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(evidenceCall.data.type).toBe('ISSUE');
      expect(evidenceCall.data.metadata).toHaveProperty('reason', 'issue_closed');

      // Verify StateTransition
      expect(prisma.stateTransition.create).toHaveBeenCalledOnce();
      const transitionCall = (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(transitionCall.data.previousState).toBe('IN_PROGRESS');
      expect(transitionCall.data.newState).toBe('COMPLETED');
    });

    it('should create Evidence records when state changes to BLOCKED (with label)', async () => {
      const issue = createMockIssue({
        labels: [{ id: 1, name: 'blocked', color: 'ff0000' }],
      });

      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-3',
        state: 'IN_PROGRESS',
      });

      (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-3',
        repositoryId,
        githubIssueId: 42,
        title: 'Test Issue',
        state: 'BLOCKED',
      });

      (prisma.evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'evidence-3',
        taskId: 'task-3',
        type: 'LABEL',
        url: 'https://github.com/owner/repo/issues/42',
        metadata: { labelName: 'blocked', labelId: 1 },
      });

      (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'transition-3',
        taskId: 'task-3',
        previousState: 'IN_PROGRESS',
        newState: 'BLOCKED',
        evidenceIds: ['evidence-3'],
      });

      await upsertTaskFromIssue(repositoryId, issue, [], []);

      // Verify LABEL evidence was created
      expect(prisma.evidence.create).toHaveBeenCalledOnce();
      const evidenceCall = (prisma.evidence.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(evidenceCall.data.type).toBe('LABEL');
      expect(evidenceCall.data.metadata).toHaveProperty('labelName', 'blocked');

      // Verify transition correctness
      const transitionCall = (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(transitionCall.data.previousState).toBe('IN_PROGRESS');
      expect(transitionCall.data.newState).toBe('BLOCKED');
    });
  });

  describe('No state change: no transition created', () => {
    it('should NOT create Evidence or StateTransition when state remains the same', async () => {
      const issue = createMockIssue();
      // No PRs, no commits, no assignees → NOT_STARTED

      // Existing task already in NOT_STARTED state
      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-4',
        state: 'NOT_STARTED',
      });

      (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-4',
        repositoryId,
        githubIssueId: 42,
        title: 'Test Issue',
        state: 'NOT_STARTED',
      });

      await upsertTaskFromIssue(repositoryId, issue, [], []);

      // No evidence or transition should be created
      expect(prisma.evidence.create).not.toHaveBeenCalled();
      expect(prisma.stateTransition.create).not.toHaveBeenCalled();
    });

    it('should NOT create transition when task stays IN_PROGRESS', async () => {
      const issue = createMockIssue();
      const pr = createMockPR(); // Open PR without reviewers → IN_PROGRESS
      const commit = createMockCommit();

      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-5',
        state: 'IN_PROGRESS',
      });

      (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-5',
        repositoryId,
        githubIssueId: 42,
        title: 'Test Issue',
        state: 'IN_PROGRESS',
      });

      await upsertTaskFromIssue(repositoryId, issue, [pr], [commit]);

      expect(prisma.evidence.create).not.toHaveBeenCalled();
      expect(prisma.stateTransition.create).not.toHaveBeenCalled();
    });
  });

  describe('New task: creates initial transition', () => {
    it('should create Evidence and StateTransition for a newly created task', async () => {
      const issue = createMockIssue();
      // No PRs, no commits, no assignees → NOT_STARTED

      // No existing task found
      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      (prisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-new',
        repositoryId,
        githubIssueId: 42,
        title: 'Test Issue',
        state: 'NOT_STARTED',
      });

      (prisma.evidence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'evidence-new',
        taskId: 'task-new',
        type: 'ISSUE',
        url: 'https://github.com/owner/repo/issues/42',
        metadata: { reason: 'no_activity' },
      });

      (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'transition-new',
        taskId: 'task-new',
        previousState: 'NOT_STARTED',
        newState: 'NOT_STARTED',
        evidenceIds: ['evidence-new'],
      });

      await upsertTaskFromIssue(repositoryId, issue, [], []);

      // Evidence should be created for the initial state determination
      expect(prisma.evidence.create).toHaveBeenCalled();

      // StateTransition should be created (initial transition)
      expect(prisma.stateTransition.create).toHaveBeenCalledOnce();
      const transitionCall = (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(transitionCall.data.taskId).toBe('task-new');
      // For new tasks, previousState = newState (initial transition)
      expect(transitionCall.data.previousState).toBe('NOT_STARTED');
      expect(transitionCall.data.newState).toBe('NOT_STARTED');
      expect(transitionCall.data.evidenceIds.length).toBeGreaterThan(0);
    });
  });

  describe('EvidenceIds reference valid Evidence records', () => {
    it('should store all evidence IDs in the StateTransition when multiple artifacts are present', async () => {
      // Issue with a closed PR (merged) → COMPLETED, but also has commits to reference
      const issue = createMockIssue();
      const mergedPR = createMockPR({ merged: true, merged_at: '2024-01-20T00:00:00Z' });

      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-6',
        state: 'IN_PROGRESS',
      });

      (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-6',
        repositoryId,
        githubIssueId: 42,
        title: 'Test Issue',
        state: 'COMPLETED',
      });

      // The inference result for COMPLETED via merged PR has one artifact
      (prisma.evidence.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'ev-pr-1',
        taskId: 'task-6',
        type: 'PR',
        url: mergedPR.html_url,
        metadata: { reason: 'pr_merged' },
      });

      (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'transition-6',
        taskId: 'task-6',
        previousState: 'IN_PROGRESS',
        newState: 'COMPLETED',
        evidenceIds: ['ev-pr-1'],
      });

      await upsertTaskFromIssue(repositoryId, issue, [mergedPR], []);

      // Verify evidence was created
      expect(prisma.evidence.create).toHaveBeenCalled();

      // Verify the transition references the correct evidence IDs
      const transitionCall = (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(transitionCall.data.evidenceIds).toEqual(['ev-pr-1']);
      // Each ID in evidenceIds corresponds to an evidence.create call
      expect(transitionCall.data.evidenceIds.length).toBe(
        (prisma.evidence.create as ReturnType<typeof vi.fn>).mock.calls.length
      );
    });

    it('should correctly map multiple evidence artifacts to their IDs in the transition', async () => {
      // Issue in uncertain state with linked PRs → multiple evidence artifacts
      const issue = createMockIssue({
        assignees: [{ login: 'dev' }], // Has assignee but no other clear signals
      });
      // A PR that doesn't match any priority rule perfectly to trigger uncertain
      const pr = createMockPR({
        title: 'unrelated PR',
        head: { ref: 'feature/unrelated', sha: 'xyz789' },
      });

      (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-7',
        state: 'NOT_STARTED',
      });

      (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-7',
        repositoryId,
        githubIssueId: 42,
        title: 'Test Issue',
        state: 'UNCERTAIN',
      });

      // The uncertain rule collects multiple evidence artifacts
      let evidenceCounter = 0;
      (prisma.evidence.create as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        evidenceCounter++;
        return {
          id: `ev-uncertain-${evidenceCounter}`,
          taskId: 'task-7',
          type: 'ISSUE',
          url: issue.html_url,
        };
      });

      (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mockImplementation(
        async (args: { data: { evidenceIds: string[] } }) => ({
          id: 'transition-7',
          ...args.data,
        })
      );

      await upsertTaskFromIssue(repositoryId, issue, [pr], []);

      // State changed from NOT_STARTED to UNCERTAIN
      expect(prisma.stateTransition.create).toHaveBeenCalledOnce();
      const transitionCall = (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mock.calls[0][0];

      // Each evidenceId maps to an evidence.create call
      const numEvidenceCreated = (prisma.evidence.create as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(transitionCall.data.evidenceIds.length).toBe(numEvidenceCreated);
      expect(transitionCall.data.evidenceIds.length).toBeGreaterThan(0);

      // Verify all IDs follow our mock pattern
      for (const id of transitionCall.data.evidenceIds) {
        expect(id).toMatch(/^ev-uncertain-\d+$/);
      }
    });
  });
});

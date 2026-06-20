/**
 * Property 12: Logging Completeness for State Changes
 *
 * For every task state transition, a corresponding system log entry exists with
 * category "state_change" containing the previous state, new state, and evidence
 * references. count(state_transitions) = count(logs WHERE category = 'state_change').
 *
 * Validates: Requirements 10.2
 *
 * This test verifies:
 * 1. For any arbitrary sequence of state transitions (simulated via upsertTaskFromIssue
 *    calls with different GitHub evidence), every time the state changes, logStateChange
 *    is called exactly once with the correct previous state, new state, and evidence IDs.
 * 2. The count of logStateChange calls equals the count of actual state transitions.
 * 3. No log entry is created when state doesn't change (same state → same state).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { GitHubIssue, GitHubPullRequest, GitHubCommit } from '../services/github.js';

// --- Mocks ---

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
    systemLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../lib/encryption.js', () => ({
  getDecryptedToken: vi.fn(() => 'fake-token'),
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
import {
  inferTaskState,
  findLinkedPullRequests,
  findLinkedCommits,
} from '../services/inference.js';

const mockLogStateChange = logStateChange as ReturnType<typeof vi.fn>;
const mockTaskFindFirst = prisma.task.findFirst as ReturnType<typeof vi.fn>;
const mockTaskUpdate = prisma.task.update as ReturnType<typeof vi.fn>;
const mockEvidenceCreate = (prisma as any).evidence.create as ReturnType<typeof vi.fn>;
const mockStateTransitionCreate = (prisma as any).stateTransition.create as ReturnType<
  typeof vi.fn
>;

// --- Arbitraries ---

const TASK_STATES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'NEEDS_REVIEW',
  'COMPLETED',
  'UNCERTAIN',
] as const;

const taskStateArb = fc.constantFrom(...TASK_STATES);

const labelArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  color: fc.hexaString({ minLength: 6, maxLength: 6 }),
});

const assigneeArb = fc.record({
  login: fc.string({ minLength: 1, maxLength: 39 }),
});

const issueArb = fc.record({
  id: fc.integer({ min: 1, max: 1000000 }),
  number: fc.integer({ min: 1, max: 100000 }),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  state: fc.constantFrom('open', 'closed'),
  labels: fc.array(labelArb, { minLength: 0, maxLength: 5 }),
  assignee: fc.option(assigneeArb, { nil: null }),
  assignees: fc.array(assigneeArb, { minLength: 0, maxLength: 3 }),
  html_url: fc.constant('https://github.com/owner/repo/issues/1'),
  created_at: fc.constant('2024-01-01T00:00:00Z'),
  updated_at: fc.constant('2024-06-01T00:00:00Z'),
  closed_at: fc.option(fc.constant('2024-06-15T00:00:00Z'), { nil: null }),
}) as fc.Arbitrary<GitHubIssue>;

const pullRequestArb = fc.record({
  id: fc.integer({ min: 1, max: 1000000 }),
  number: fc.integer({ min: 1, max: 100000 }),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  state: fc.constantFrom('open', 'closed'),
  merged: fc.boolean(),
  merged_at: fc.option(fc.constant('2024-06-10T00:00:00Z'), { nil: null }),
  html_url: fc.constant('https://github.com/owner/repo/pull/2'),
  head: fc.record({
    ref: fc.string({ minLength: 1, maxLength: 60 }),
    sha: fc.hexaString({ minLength: 40, maxLength: 40 }),
  }),
  base: fc.record({
    ref: fc.constant('main'),
  }),
  requested_reviewers: fc.array(assigneeArb, { minLength: 0, maxLength: 3 }),
  labels: fc.array(fc.record({ id: fc.integer({ min: 1 }), name: fc.string({ minLength: 1 }) }), {
    minLength: 0,
    maxLength: 3,
  }),
  created_at: fc.constant('2024-03-01T00:00:00Z'),
  updated_at: fc.constant('2024-06-01T00:00:00Z'),
  closed_at: fc.option(fc.constant('2024-06-05T00:00:00Z'), { nil: null }),
}) as fc.Arbitrary<GitHubPullRequest>;

const commitArb = fc.record({
  sha: fc.hexaString({ minLength: 40, maxLength: 40 }),
  commit: fc.record({
    message: fc.string({ minLength: 1, maxLength: 100 }),
    author: fc.option(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }),
        date: fc.constantFrom(
          new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          '2023-01-01T00:00:00Z',
        ),
      }),
      { nil: null },
    ),
  }),
  html_url: fc.constant('https://github.com/owner/repo/commit/abc123'),
  author: fc.option(assigneeArb, { nil: null }),
}) as fc.Arbitrary<GitHubCommit>;

// --- Tests ---

describe('Property 12: Logging Completeness for State Changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvidenceCreate.mockResolvedValue({ id: 'ev-001' });
    mockStateTransitionCreate.mockResolvedValue({ id: 'st-001' });
  });

  it('logStateChange is called exactly once with correct details for every actual state transition', async () => {
    /**
     * **Validates: Requirements 10.2**
     *
     * For any arbitrary existing task state and any GitHub evidence that causes
     * a state change, logStateChange is called exactly once with the correct
     * previousState, newState, and evidenceIds.
     */
    await fc.assert(
      fc.asyncProperty(
        issueArb,
        fc.array(pullRequestArb, { minLength: 0, maxLength: 3 }),
        fc.array(commitArb, { minLength: 0, maxLength: 5 }),
        taskStateArb,
        async (issue, prs, commits, previousState) => {
          vi.clearAllMocks();

          const taskId = 'task-logging-test';

          // Compute what state the inference engine will produce
          const linkedPRs = findLinkedPullRequests(issue, prs);
          const linkedCommits = findLinkedCommits(issue, linkedPRs, commits);
          const inferredResult = inferTaskState(issue, {
            linkedPullRequests: linkedPRs,
            linkedCommits: linkedCommits,
          });

          // Only test when state actually changes (property is about transitions)
          const stateWillChange = inferredResult.state !== previousState;
          if (!stateWillChange) return;

          // Mock existing task with previousState
          mockTaskFindFirst.mockResolvedValue({
            id: taskId,
            state: previousState,
          });

          mockTaskUpdate.mockResolvedValue({ id: taskId });

          // Track evidence IDs created
          let evidenceCount = 0;
          mockEvidenceCreate.mockImplementation(() => {
            evidenceCount++;
            return Promise.resolve({ id: `ev-${evidenceCount}` });
          });

          mockStateTransitionCreate.mockResolvedValue({ id: 'st-001' });

          // Execute the function
          await upsertTaskFromIssue('repo-1', issue, prs, commits, 'user-123');

          // PROPERTY: logStateChange is called exactly once
          expect(mockLogStateChange).toHaveBeenCalledTimes(1);

          // PROPERTY: logStateChange is called with correct parameters
          const callArgs = mockLogStateChange.mock.calls[0];
          expect(callArgs[0]).toBe('user-123'); // userId
          expect(callArgs[1]).toBe('task_state_changed'); // action
          expect(callArgs[2].taskId).toBe(taskId);
          expect(callArgs[2].previousState).toBe(previousState);
          expect(callArgs[2].newState).toBe(inferredResult.state);
          expect(callArgs[2].evidenceIds).toBeDefined();
          expect(Array.isArray(callArgs[2].evidenceIds)).toBe(true);
          expect(callArgs[2].evidenceIds.length).toBeGreaterThan(0);
          expect(callArgs[2].taskTitle).toBe(issue.title);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('count of logStateChange calls equals count of actual state transitions in a sequence', async () => {
    /**
     * **Validates: Requirements 10.2**
     *
     * For a sequence of upsertTaskFromIssue calls simulating multiple syncs
     * where the task state may or may not change, the total number of
     * logStateChange calls equals exactly the number of actual state transitions.
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of issues representing multiple sync events
        fc.array(issueArb, { minLength: 2, maxLength: 5 }),
        fc.array(pullRequestArb, { minLength: 0, maxLength: 3 }),
        fc.array(commitArb, { minLength: 0, maxLength: 5 }),
        taskStateArb, // initial state for the task
        async (issues, prs, commits, initialState) => {
          vi.clearAllMocks();

          const taskId = 'task-sequence-test';
          let currentState: string = initialState;
          let expectedTransitions = 0;

          for (const issue of issues) {
            // Compute what state the inference engine will produce
            const linkedPRs = findLinkedPullRequests(issue, prs);
            const linkedCommits = findLinkedCommits(issue, linkedPRs, commits);
            const inferredResult = inferTaskState(issue, {
              linkedPullRequests: linkedPRs,
              linkedCommits: linkedCommits,
            });

            const stateWillChange = inferredResult.state !== currentState;

            // Mock existing task with currentState
            mockTaskFindFirst.mockResolvedValue({
              id: taskId,
              state: currentState,
            });

            mockTaskUpdate.mockResolvedValue({ id: taskId });

            let evidenceCount = 0;
            mockEvidenceCreate.mockImplementation(() => {
              evidenceCount++;
              return Promise.resolve({ id: `ev-seq-${evidenceCount}` });
            });

            mockStateTransitionCreate.mockResolvedValue({ id: 'st-seq' });

            // Execute
            await upsertTaskFromIssue('repo-1', issue, prs, commits, 'user-seq');

            if (stateWillChange) {
              expectedTransitions++;
              currentState = inferredResult.state;
            }
          }

          // PROPERTY: count(logStateChange calls) === count(actual state transitions)
          expect(mockLogStateChange).toHaveBeenCalledTimes(expectedTransitions);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('no log entry is created when state does not change (same state → same state)', async () => {
    /**
     * **Validates: Requirements 10.2**
     *
     * When the inferred state equals the current task state,
     * logStateChange must NOT be called.
     */
    await fc.assert(
      fc.asyncProperty(
        issueArb,
        fc.array(pullRequestArb, { minLength: 0, maxLength: 3 }),
        fc.array(commitArb, { minLength: 0, maxLength: 5 }),
        async (issue, prs, commits) => {
          vi.clearAllMocks();

          const taskId = 'task-no-change-test';

          // Compute what state the inference engine will produce
          const linkedPRs = findLinkedPullRequests(issue, prs);
          const linkedCommits = findLinkedCommits(issue, linkedPRs, commits);
          const inferredResult = inferTaskState(issue, {
            linkedPullRequests: linkedPRs,
            linkedCommits: linkedCommits,
          });

          // Set the existing task's state to the SAME state inference will produce
          // This guarantees no state change will occur
          mockTaskFindFirst.mockResolvedValue({
            id: taskId,
            state: inferredResult.state,
          });

          mockTaskUpdate.mockResolvedValue({ id: taskId });
          mockEvidenceCreate.mockResolvedValue({ id: 'ev-noop' });
          mockStateTransitionCreate.mockResolvedValue({ id: 'st-noop' });

          // Execute
          await upsertTaskFromIssue('repo-1', issue, prs, commits, 'user-noop');

          // PROPERTY: logStateChange is never called when state doesn't change
          expect(mockLogStateChange).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 200 },
    );
  });
});

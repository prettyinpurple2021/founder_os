/**
 * Property 5: Evidence Preservation on State Transition
 *
 * Every state transition recorded in the system has a non-empty evidence array
 * referencing valid evidence records.
 *
 * Formally: ∀ transition: transition.evidenceIds.length > 0 ∧
 *           ∀ id ∈ transition.evidenceIds: exists(evidence[id])
 *
 * Validates: Requirements 3.8
 *
 * This test verifies:
 * 1. The inference engine always returns non-empty evidence for any input.
 * 2. When upsertTaskFromIssue is called with a state change, evidence.create is
 *    called at least once and stateTransition.create is called with non-empty evidenceIds.
 * 3. Evidence IDs stored in the transition correspond to evidence records that were created.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { inferTaskState, InferenceContext } from '../services/inference.js';
import type { GitHubIssue, GitHubPullRequest, GitHubCommit } from '../services/github.js';

// --- Arbitraries for GitHub types ---

const TASK_STATES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'NEEDS_REVIEW',
  'COMPLETED',
  'UNCERTAIN',
] as const;

const taskStateArb = fc.constantFrom(...TASK_STATES);

/** Arbitrary for a GitHub label */
const labelArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  color: fc.hexaString({ minLength: 6, maxLength: 6 }),
});

/** Arbitrary for a GitHub assignee */
const assigneeArb = fc.record({
  login: fc.string({ minLength: 1, maxLength: 39 }),
});

/** Arbitrary for a GitHub issue */
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

/** Arbitrary for a GitHub pull request */
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
  labels: fc.array(fc.record({ id: fc.integer({ min: 1 }), name: fc.string({ minLength: 1 }) }), { minLength: 0, maxLength: 3 }),
  created_at: fc.constant('2024-03-01T00:00:00Z'),
  updated_at: fc.constant('2024-06-01T00:00:00Z'),
  closed_at: fc.option(fc.constant('2024-06-05T00:00:00Z'), { nil: null }),
}) as fc.Arbitrary<GitHubPullRequest>;

/** Arbitrary for a GitHub commit with configurable date */
const commitArb = fc.record({
  sha: fc.hexaString({ minLength: 40, maxLength: 40 }),
  commit: fc.record({
    message: fc.string({ minLength: 1, maxLength: 100 }),
    author: fc.option(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }),
        date: fc.constantFrom(
          // Recent date (within 30 days)
          new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          // Old date (more than 30 days)
          '2023-01-01T00:00:00Z',
        ),
      }),
      { nil: null },
    ),
  }),
  html_url: fc.constant('https://github.com/owner/repo/commit/abc123'),
  author: fc.option(assigneeArb, { nil: null }),
}) as fc.Arbitrary<GitHubCommit>;

/** Arbitrary for InferenceContext */
const contextArb = fc.record({
  linkedPullRequests: fc.array(pullRequestArb, { minLength: 0, maxLength: 5 }),
  linkedCommits: fc.array(commitArb, { minLength: 0, maxLength: 10 }),
  issueComments: fc.option(
    fc.array(
      fc.record({
        body: fc.string({ minLength: 0, maxLength: 200 }),
        html_url: fc.constant('https://github.com/owner/repo/issues/1#comment-1'),
      }),
      { minLength: 0, maxLength: 5 },
    ),
    { nil: undefined },
  ),
}) as fc.Arbitrary<InferenceContext>;

// --- Tests ---

describe('Property: Evidence Preservation on State Transition', () => {
  it('inferTaskState always returns non-empty evidence for any arbitrary issue and context', () => {
    fc.assert(
      fc.property(issueArb, contextArb, (issue, context) => {
        const result = inferTaskState(issue, context);

        // PROPERTY: Evidence is always non-empty
        expect(result.evidence).toBeDefined();
        expect(result.evidence.length).toBeGreaterThan(0);

        // Each evidence artifact has required fields
        for (const artifact of result.evidence) {
          expect(artifact.type).toBeDefined();
          expect(['ISSUE', 'PR', 'COMMIT', 'LABEL', 'STATUS_CHECK']).toContain(artifact.type);
          expect(artifact.url).toBeDefined();
          expect(artifact.url.length).toBeGreaterThan(0);
          expect(artifact.metadata).toBeDefined();
          expect(typeof artifact.metadata).toBe('object');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('evidence count is always >= 1 regardless of the inferred state', () => {
    fc.assert(
      fc.property(issueArb, contextArb, (issue, context) => {
        const result = inferTaskState(issue, context);

        // PROPERTY: ∀ inference result: evidence.length > 0
        expect(result.evidence.length).toBeGreaterThanOrEqual(1);

        // The state is always one of the valid TaskState values
        expect(TASK_STATES).toContain(result.state);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Property: Evidence Preservation in upsertTaskFromIssue (mocked Prisma)', () => {
  // Mock prisma for the upsertTaskFromIssue integration
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

  // Must import after mock setup
  let prisma: any;
  let upsertTaskFromIssue: typeof import('../services/sync.js')['upsertTaskFromIssue'];

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import('../lib/prisma.js')).default;
    const syncModule = await import('../services/sync.js');
    upsertTaskFromIssue = syncModule.upsertTaskFromIssue;
  });

  it('when state changes, evidence.create is called at least once and stateTransition.create receives non-empty evidenceIds', async () => {
    await fc.assert(
      fc.asyncProperty(
        issueArb,
        fc.array(pullRequestArb, { minLength: 0, maxLength: 3 }),
        fc.array(commitArb, { minLength: 0, maxLength: 5 }),
        taskStateArb,
        async (issue, prs, commits, previousState) => {
          vi.clearAllMocks();

          const taskId = 'task-uuid-123';

          // Compute what upsertTaskFromIssue will actually infer using the same
          // linking logic it uses internally
          const { findLinkedPullRequests, findLinkedCommits } = await import('../services/inference.js');
          const linkedPRs = findLinkedPullRequests(issue, prs);
          const linkedCommits = findLinkedCommits(issue, linkedPRs, commits);
          const inferredResult = inferTaskState(issue, {
            linkedPullRequests: linkedPRs,
            linkedCommits: linkedCommits,
          });

          // Only test when state actually changes
          const stateWillChange = inferredResult.state !== previousState;

          // Skip this run if state won't change — the property is about transitions
          if (!stateWillChange) return;

          // Mock: task already exists with previousState
          (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: taskId,
            state: previousState,
          });

          // Mock: update returns the task
          (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: taskId,
            repositoryId: 'repo-1',
            githubIssueId: issue.number,
            title: issue.title,
            state: inferredResult.state,
          });

          // Mock: evidence.create returns records with unique IDs
          let evidenceCreateCallCount = 0;
          (prisma.evidence.create as ReturnType<typeof vi.fn>).mockImplementation(() => {
            evidenceCreateCallCount++;
            return Promise.resolve({
              id: `evidence-${evidenceCreateCallCount}`,
              taskId,
              type: 'ISSUE',
              url: 'https://github.com/test',
              metadata: {},
            });
          });

          // Mock: stateTransition.create
          let capturedTransition: any = null;
          (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mockImplementation(
            (args: any) => {
              capturedTransition = args.data;
              return Promise.resolve({ id: 'transition-1', ...args.data });
            },
          );

          // Execute the function
          await upsertTaskFromIssue('repo-1', issue, prs, commits);

          // PROPERTY: evidence.create was called at least once
          expect(prisma.evidence.create).toHaveBeenCalled();
          expect(evidenceCreateCallCount).toBeGreaterThanOrEqual(1);

          // PROPERTY: stateTransition.create was called with non-empty evidenceIds
          expect(prisma.stateTransition.create).toHaveBeenCalled();
          expect(capturedTransition).not.toBeNull();
          expect(capturedTransition.evidenceIds).toBeDefined();
          expect(capturedTransition.evidenceIds.length).toBeGreaterThan(0);

          // PROPERTY: each evidenceId in the transition references a created evidence record
          for (const id of capturedTransition.evidenceIds) {
            expect(id).toMatch(/^evidence-\d+$/);
          }

          // PROPERTY: evidenceIds count matches the number of evidence artifacts
          // from the inference result
          expect(capturedTransition.evidenceIds.length).toBe(inferredResult.evidence.length);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('for new tasks (no existing task), evidence and transition are always created with non-empty evidenceIds', async () => {
    await fc.assert(
      fc.asyncProperty(
        issueArb,
        fc.array(pullRequestArb, { minLength: 0, maxLength: 3 }),
        fc.array(commitArb, { minLength: 0, maxLength: 5 }),
        async (issue, prs, commits) => {
          vi.clearAllMocks();

          const taskId = 'new-task-uuid';

          // Mock: no existing task (new task)
          (prisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

          // Mock: create makes a new task
          (prisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: taskId,
            repositoryId: 'repo-1',
            githubIssueId: issue.number,
            title: issue.title,
            state: 'NOT_STARTED',
          });

          // Mock: evidence.create returns records with unique IDs
          let evidenceCreateCallCount = 0;
          (prisma.evidence.create as ReturnType<typeof vi.fn>).mockImplementation(() => {
            evidenceCreateCallCount++;
            return Promise.resolve({
              id: `ev-${evidenceCreateCallCount}`,
              taskId,
              type: 'ISSUE',
              url: 'https://github.com/test',
              metadata: {},
            });
          });

          // Mock: stateTransition.create
          let capturedTransition: any = null;
          (prisma.stateTransition.create as ReturnType<typeof vi.fn>).mockImplementation(
            (args: any) => {
              capturedTransition = args.data;
              return Promise.resolve({ id: 'transition-new', ...args.data });
            },
          );

          // Execute the function
          await upsertTaskFromIssue('repo-1', issue, prs, commits);

          // PROPERTY: For new tasks, evidence is always created
          expect(prisma.evidence.create).toHaveBeenCalled();
          expect(evidenceCreateCallCount).toBeGreaterThanOrEqual(1);

          // PROPERTY: stateTransition.create is called with non-empty evidenceIds
          expect(prisma.stateTransition.create).toHaveBeenCalled();
          expect(capturedTransition).not.toBeNull();
          expect(capturedTransition.evidenceIds).toBeDefined();
          expect(capturedTransition.evidenceIds.length).toBeGreaterThan(0);

          // PROPERTY: all IDs reference valid created evidence records
          for (const id of capturedTransition.evidenceIds) {
            expect(id).toMatch(/^ev-\d+$/);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

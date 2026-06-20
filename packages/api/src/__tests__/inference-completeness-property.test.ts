import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { inferTaskState, type TaskState, type InferenceContext } from '../services/inference.js';
import type { GitHubIssue, GitHubPullRequest, GitHubCommit } from '../services/github.js';

/**
 * Property 4: Task State Inference Completeness
 *
 * Inference function is total — always produces exactly one TaskState for any evidence input.
 * The function never throws, never returns undefined, and the evidence array is always non-empty.
 *
 * Validates: Requirements 3.1, 3.7
 */

// --- Valid TaskState values ---
const VALID_TASK_STATES: TaskState[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'NEEDS_REVIEW',
  'COMPLETED',
  'UNCERTAIN',
];

// --- Arbitraries ---

/** Arbitrary for GitHub label */
const labelArb = fc.record({
  id: fc.integer({ min: 1, max: 999999 }),
  name: fc.oneof(
    fc.constantFrom('bug', 'feature', 'blocked', 'blocker', 'enhancement', 'help wanted'),
    fc.string({ minLength: 1, maxLength: 30 }),
  ),
  color: fc.hexaString({ minLength: 6, maxLength: 6 }),
});

/** Arbitrary for GitHub user (assignee/reviewer) */
const userArb = fc.record({
  login: fc.string({ minLength: 1, maxLength: 20 }),
});

/** Arbitrary for a GitHub issue */
const issueArb: fc.Arbitrary<GitHubIssue> = fc.record({
  id: fc.integer({ min: 1, max: 999999 }),
  number: fc.integer({ min: 1, max: 9999 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  state: fc.constantFrom('open', 'closed'),
  labels: fc.array(labelArb, { minLength: 0, maxLength: 5 }),
  assignee: fc.option(userArb, { nil: null }),
  assignees: fc.array(userArb, { minLength: 0, maxLength: 3 }),
  pull_request: fc.option(
    fc.record({
      url: fc.constant('https://api.github.com/repos/owner/repo/pulls/1'),
      html_url: fc.constant('https://github.com/owner/repo/pull/1'),
      merged_at: fc.option(
        fc.date().map((d) => d.toISOString()),
        { nil: null },
      ),
    }),
    { nil: undefined },
  ),
  html_url: fc.constant('https://github.com/owner/repo/issues/1'),
  created_at: fc.date().map((d) => d.toISOString()),
  updated_at: fc.date().map((d) => d.toISOString()),
  closed_at: fc.option(
    fc.date().map((d) => d.toISOString()),
    { nil: null },
  ),
});

/** Arbitrary for a GitHub pull request */
const pullRequestArb: fc.Arbitrary<GitHubPullRequest> = fc.record({
  id: fc.integer({ min: 1, max: 999999 }),
  number: fc.integer({ min: 1, max: 9999 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  state: fc.constantFrom('open', 'closed'),
  merged: fc.boolean(),
  merged_at: fc.option(
    fc.date().map((d) => d.toISOString()),
    { nil: null },
  ),
  html_url: fc.constant('https://github.com/owner/repo/pull/1'),
  head: fc.record({
    ref: fc.string({ minLength: 1, maxLength: 50 }),
    sha: fc.hexaString({ minLength: 40, maxLength: 40 }),
  }),
  base: fc.record({
    ref: fc.constantFrom('main', 'master', 'develop'),
  }),
  requested_reviewers: fc.array(userArb, { minLength: 0, maxLength: 3 }),
  labels: fc.array(
    fc.record({ id: fc.integer({ min: 1 }), name: fc.string({ minLength: 1, maxLength: 20 }) }),
    { minLength: 0, maxLength: 3 },
  ),
  created_at: fc.date().map((d) => d.toISOString()),
  updated_at: fc.date().map((d) => d.toISOString()),
  closed_at: fc.option(
    fc.date().map((d) => d.toISOString()),
    { nil: null },
  ),
});

/** Arbitrary for a GitHub commit */
const commitArb: fc.Arbitrary<GitHubCommit> = fc.record({
  sha: fc.hexaString({ minLength: 40, maxLength: 40 }),
  commit: fc.record({
    message: fc.string({ minLength: 1, maxLength: 200 }),
    author: fc.option(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 30 }),
        date: fc.date().map((d) => d.toISOString()),
      }),
      { nil: null },
    ),
  }),
  html_url: fc.constant('https://github.com/owner/repo/commit/abc123'),
  author: fc.option(userArb, { nil: null }),
});

/** Arbitrary for issue comments (used in dependency detection) */
const commentArb = fc.record({
  body: fc.oneof(
    fc.constantFrom(
      'depends on #42',
      'blocked by #10',
      'waiting for approval',
      'after #5 is merged',
      'requires #99',
    ),
    fc.string({ minLength: 0, maxLength: 200 }),
  ),
  html_url: fc.constant('https://github.com/owner/repo/issues/1#issuecomment-1'),
});

/** Arbitrary for InferenceContext */
const contextArb: fc.Arbitrary<InferenceContext> = fc.record({
  linkedPullRequests: fc.array(pullRequestArb, { minLength: 0, maxLength: 5 }),
  linkedCommits: fc.array(commitArb, { minLength: 0, maxLength: 10 }),
  issueComments: fc.option(fc.array(commentArb, { minLength: 0, maxLength: 5 }), {
    nil: undefined,
  }),
});

// --- Property Tests ---

describe('Property 4: Task State Inference Completeness', () => {
  it('inferTaskState always returns exactly one valid TaskState for any evidence input', () => {
    fc.assert(
      fc.property(issueArb, contextArb, (issue, context) => {
        const result = inferTaskState(issue, context);

        // Must return a defined result (not undefined/null)
        expect(result).toBeDefined();
        expect(result).not.toBeNull();

        // Must have exactly one state
        expect(result.state).toBeDefined();
        expect(typeof result.state).toBe('string');

        // State must be one of the valid TaskState enum values
        expect(VALID_TASK_STATES).toContain(result.state);
      }),
      { numRuns: 200 },
    );
  });

  it('inferTaskState evidence array is always non-empty', () => {
    fc.assert(
      fc.property(issueArb, contextArb, (issue, context) => {
        const result = inferTaskState(issue, context);

        // Evidence array must exist and be non-empty
        expect(result.evidence).toBeDefined();
        expect(Array.isArray(result.evidence)).toBe(true);
        expect(result.evidence.length).toBeGreaterThan(0);

        // Each evidence artifact must have required fields
        for (const artifact of result.evidence) {
          expect(artifact.type).toBeDefined();
          expect(artifact.url).toBeDefined();
          expect(typeof artifact.url).toBe('string');
          expect(artifact.metadata).toBeDefined();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('inferTaskState never throws regardless of input', () => {
    fc.assert(
      fc.property(issueArb, contextArb, (issue, context) => {
        // The function must not throw for any arbitrary input
        expect(() => inferTaskState(issue, context)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
});

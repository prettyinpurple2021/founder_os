/**
 * Unit Tests for the Task State Inference Engine
 *
 * Tests each inference rule covering happy paths and edge cases.
 * Rules are evaluated in priority order:
 *   1. Completed
 *   2. Blocked
 *   3. Needs Review
 *   4. In Progress
 *   5. Not Started
 *   6. Uncertain (fallback)
 */

import { describe, it, expect } from 'vitest';
import {
  inferTaskState,
  findLinkedPullRequests,
  findLinkedCommits,
  InferenceContext,
  InferenceResult,
} from '../services/inference.js';
import type { GitHubIssue, GitHubPullRequest, GitHubCommit } from '../services/github.js';

// --- Test Fixtures ---

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 1,
    number: 42,
    title: 'Test issue',
    state: 'open',
    labels: [],
    assignee: null,
    assignees: [],
    html_url: 'https://github.com/user/repo/issues/42',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

function makePR(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    id: 100,
    number: 10,
    title: 'Fix #42',
    state: 'open',
    merged: false,
    merged_at: null,
    html_url: 'https://github.com/user/repo/pull/10',
    head: { ref: 'feature/42-fix', sha: 'abc123' },
    base: { ref: 'main' },
    requested_reviewers: [],
    labels: [],
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

function makeCommit(overrides: Partial<GitHubCommit> = {}): GitHubCommit {
  const now = new Date();
  return {
    sha: 'abc123def456',
    commit: {
      message: 'fix: resolve issue #42',
      author: { name: 'Test User', date: now.toISOString() },
    },
    html_url: 'https://github.com/user/repo/commit/abc123def456',
    author: { login: 'testuser' },
    ...overrides,
  };
}

function emptyContext(): InferenceContext {
  return {
    linkedPullRequests: [],
    linkedCommits: [],
  };
}

// --- Rule 1: Completed ---

describe('Inference Rule 1: Completed', () => {
  it('should return COMPLETED when issue is closed', () => {
    const issue = makeIssue({ state: 'closed', closed_at: '2024-01-20T00:00:00Z' });
    const context = emptyContext();

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('COMPLETED');
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].type).toBe('ISSUE');
    expect(result.evidence[0].metadata.reason).toBe('issue_closed');
  });

  it('should return COMPLETED when a linked PR is merged', () => {
    const issue = makeIssue({ state: 'open' });
    const mergedPR = makePR({ merged: true, merged_at: '2024-01-20T00:00:00Z', state: 'closed' });
    const context: InferenceContext = {
      linkedPullRequests: [mergedPR],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('COMPLETED');
    expect(result.evidence[0].type).toBe('PR');
    expect(result.evidence[0].metadata.reason).toBe('pr_merged');
  });

  it('should prioritize COMPLETED over BLOCKED (closed issue with block label)', () => {
    const issue = makeIssue({
      state: 'closed',
      closed_at: '2024-01-20T00:00:00Z',
      labels: [{ id: 1, name: 'blocked', color: 'red' }],
    });
    const context = emptyContext();

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('COMPLETED');
  });
});

// --- Rule 2: Blocked ---

describe('Inference Rule 2: Blocked', () => {
  it('should return BLOCKED when issue has a "blocked" label', () => {
    const issue = makeIssue({
      labels: [{ id: 1, name: 'blocked', color: 'red' }],
    });
    const context = emptyContext();

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('BLOCKED');
    expect(result.blockerReason).toBe('Label: blocked');
    expect(result.evidence[0].type).toBe('LABEL');
  });

  it('should match label case-insensitively (/block/i)', () => {
    const cases = ['blocked', 'BLOCKED', 'Blocked', 'blocker', 'Blocker', 'blocking'];

    for (const labelName of cases) {
      const issue = makeIssue({
        labels: [{ id: 1, name: labelName, color: 'red' }],
      });
      const result = inferTaskState(issue, emptyContext());
      expect(result.state).toBe('BLOCKED');
      expect(result.blockerReason).toContain(labelName);
    }
  });

  it('should return BLOCKED when a comment contains a dependency indicator', () => {
    const issue = makeIssue();
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [],
      issueComments: [
        { body: 'This depends on #15 being merged first', html_url: 'https://github.com/user/repo/issues/42#issuecomment-1' },
      ],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('BLOCKED');
    expect(result.blockerReason).toContain('Dependency comment');
  });

  it('should detect "blocked by" pattern in comments', () => {
    const issue = makeIssue();
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [],
      issueComments: [
        { body: 'Blocked by the API migration', html_url: 'https://github.com/user/repo/issues/42#issuecomment-2' },
      ],
    };

    const result = inferTaskState(issue, context);
    expect(result.state).toBe('BLOCKED');
  });

  it('should detect "waiting for" pattern in comments', () => {
    const issue = makeIssue();
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [],
      issueComments: [
        { body: 'Waiting for the design team to approve', html_url: 'https://github.com/user/repo/issues/42#issuecomment-3' },
      ],
    };

    const result = inferTaskState(issue, context);
    expect(result.state).toBe('BLOCKED');
  });

  it('should detect "requires #N" pattern in comments', () => {
    const issue = makeIssue();
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [],
      issueComments: [
        { body: 'This requires #20 to be completed', html_url: 'https://github.com/user/repo/issues/42#issuecomment-4' },
      ],
    };

    const result = inferTaskState(issue, context);
    expect(result.state).toBe('BLOCKED');
  });

  it('should record blocker reason from label', () => {
    const issue = makeIssue({
      labels: [{ id: 5, name: 'blocker: external-dependency', color: 'orange' }],
    });

    const result = inferTaskState(issue, emptyContext());

    expect(result.state).toBe('BLOCKED');
    expect(result.blockerReason).toBe('Label: blocker: external-dependency');
  });

  it('should not match labels without "block" substring', () => {
    const issue = makeIssue({
      labels: [{ id: 1, name: 'bug', color: 'red' }, { id: 2, name: 'priority:high', color: 'orange' }],
    });

    const result = inferTaskState(issue, emptyContext());
    expect(result.state).not.toBe('BLOCKED');
  });
});

// --- Rule 3: Needs Review ---

describe('Inference Rule 3: Needs Review', () => {
  it('should return NEEDS_REVIEW when open PR has pending review requests', () => {
    const issue = makeIssue();
    const pr = makePR({
      state: 'open',
      requested_reviewers: [{ login: 'reviewer1' }],
    });
    const context: InferenceContext = {
      linkedPullRequests: [pr],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('NEEDS_REVIEW');
    expect(result.evidence[0].type).toBe('PR');
    expect(result.evidence[0].metadata.reason).toBe('pending_review_requests');
    expect(result.evidence[0].metadata.reviewers).toEqual(['reviewer1']);
  });

  it('should return NEEDS_REVIEW with multiple reviewers', () => {
    const issue = makeIssue();
    const pr = makePR({
      state: 'open',
      requested_reviewers: [{ login: 'alice' }, { login: 'bob' }],
    });
    const context: InferenceContext = {
      linkedPullRequests: [pr],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('NEEDS_REVIEW');
    expect(result.evidence[0].metadata.reviewers).toEqual(['alice', 'bob']);
  });

  it('should not return NEEDS_REVIEW for closed PR with review requests', () => {
    const issue = makeIssue();
    const pr = makePR({
      state: 'closed',
      requested_reviewers: [{ login: 'reviewer1' }],
    });
    const context: InferenceContext = {
      linkedPullRequests: [pr],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    // Should not be NEEDS_REVIEW because PR is closed
    expect(result.state).not.toBe('NEEDS_REVIEW');
  });
});

// --- Rule 4: In Progress ---

describe('Inference Rule 4: In Progress', () => {
  it('should return IN_PROGRESS when linked branch has recent commits', () => {
    const issue = makeIssue();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5); // 5 days ago
    const commit = makeCommit({
      commit: { message: 'wip', author: { name: 'dev', date: recentDate.toISOString() } },
    });
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [commit],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('IN_PROGRESS');
    expect(result.evidence[0].type).toBe('COMMIT');
    expect(result.evidence[0].metadata.reason).toBe('recent_commit');
  });

  it('should return IN_PROGRESS when there is an open PR without review requests', () => {
    const issue = makeIssue();
    const pr = makePR({
      state: 'open',
      requested_reviewers: [],
    });
    const context: InferenceContext = {
      linkedPullRequests: [pr],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('IN_PROGRESS');
    expect(result.evidence[0].type).toBe('PR');
    expect(result.evidence[0].metadata.reason).toBe('open_pr_no_reviews');
  });

  it('should not return IN_PROGRESS for commits older than 30 days', () => {
    const issue = makeIssue();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45); // 45 days ago
    const commit = makeCommit({
      commit: { message: 'old work', author: { name: 'dev', date: oldDate.toISOString() } },
    });
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [commit],
    };

    const result = inferTaskState(issue, context);

    // Should not be IN_PROGRESS — falls through to another rule
    expect(result.state).not.toBe('IN_PROGRESS');
  });

  it('should prioritize NEEDS_REVIEW over IN_PROGRESS for open PR with reviewers', () => {
    const issue = makeIssue();
    const pr = makePR({
      state: 'open',
      requested_reviewers: [{ login: 'reviewer1' }],
    });
    const context: InferenceContext = {
      linkedPullRequests: [pr],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    // NEEDS_REVIEW has higher priority than IN_PROGRESS
    expect(result.state).toBe('NEEDS_REVIEW');
  });
});

// --- Rule 5: Not Started ---

describe('Inference Rule 5: Not Started', () => {
  it('should return NOT_STARTED when no linked branch, commits, or assignee', () => {
    const issue = makeIssue({
      assignees: [],
      assignee: null,
    });
    const context = emptyContext();

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('NOT_STARTED');
    expect(result.evidence[0].type).toBe('ISSUE');
    expect(result.evidence[0].metadata.reason).toBe('no_activity');
  });

  it('should not return NOT_STARTED when issue has assignees', () => {
    const issue = makeIssue({
      assignees: [{ login: 'developer1' }],
    });
    const context = emptyContext();

    const result = inferTaskState(issue, context);

    // Has assignee activity so shouldn't be NOT_STARTED
    expect(result.state).not.toBe('NOT_STARTED');
  });

  it('should not return NOT_STARTED when there are linked PRs', () => {
    const issue = makeIssue({ assignees: [] });
    const pr = makePR({ state: 'closed', merged: false });
    const context: InferenceContext = {
      linkedPullRequests: [pr],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).not.toBe('NOT_STARTED');
  });

  it('should not return NOT_STARTED when there are linked commits', () => {
    const issue = makeIssue({ assignees: [] });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45); // Old commit, won't trigger IN_PROGRESS
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [makeCommit({
        commit: { message: 'old work', author: { name: 'dev', date: oldDate.toISOString() } },
      })],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).not.toBe('NOT_STARTED');
  });
});

// --- Rule 6: Uncertain ---

describe('Inference Rule 6: Uncertain (Fallback)', () => {
  it('should return UNCERTAIN when assignees exist but no other indicators match', () => {
    const issue = makeIssue({
      assignees: [{ login: 'developer1' }],
    });
    // Old commits only (no recent ones), no open PRs
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [makeCommit({
        commit: { message: 'old', author: { name: 'dev', date: oldDate.toISOString() } },
      })],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('UNCERTAIN');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0].metadata.reason).toBe('no_confident_match');
  });

  it('should display available evidence in uncertain result', () => {
    const issue = makeIssue({
      assignees: [{ login: 'dev1' }],
      labels: [{ id: 1, name: 'enhancement', color: 'blue' }],
    });
    const closedPR = makePR({ state: 'closed', merged: false });
    const context: InferenceContext = {
      linkedPullRequests: [closedPR],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    expect(result.state).toBe('UNCERTAIN');
    // Should include issue evidence + PR evidence
    expect(result.evidence.length).toBe(2);
    expect(result.evidence[0].metadata.linkedPRCount).toBe(1);
    expect(result.evidence[1].type).toBe('PR');
  });

  it('should always return a result (totality guarantee)', () => {
    // Even with bizarre input, inference should never throw
    const issue = makeIssue({
      state: 'open',
      labels: [],
      assignees: [{ login: 'someone' }],
    });
    const context: InferenceContext = {
      linkedPullRequests: [makePR({ state: 'closed', merged: false, requested_reviewers: [{ login: 'x' }] })],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);

    expect(result).toBeDefined();
    expect(result.state).toBeDefined();
    expect(result.evidence).toBeDefined();
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});

// --- Priority Order Tests ---

describe('Inference Priority Order', () => {
  it('COMPLETED > BLOCKED: closed issue with block label → COMPLETED', () => {
    const issue = makeIssue({
      state: 'closed',
      closed_at: '2024-01-20T00:00:00Z',
      labels: [{ id: 1, name: 'blocked', color: 'red' }],
    });

    const result = inferTaskState(issue, emptyContext());
    expect(result.state).toBe('COMPLETED');
  });

  it('BLOCKED > NEEDS_REVIEW: block label on issue with PR having review requests', () => {
    const issue = makeIssue({
      labels: [{ id: 1, name: 'blocked', color: 'red' }],
    });
    const pr = makePR({ state: 'open', requested_reviewers: [{ login: 'rev' }] });
    const context: InferenceContext = {
      linkedPullRequests: [pr],
      linkedCommits: [],
    };

    const result = inferTaskState(issue, context);
    expect(result.state).toBe('BLOCKED');
  });

  it('NEEDS_REVIEW > IN_PROGRESS: open PR with reviewers beats open PR without', () => {
    const issue = makeIssue();
    const pr = makePR({ state: 'open', requested_reviewers: [{ login: 'rev' }] });
    const context: InferenceContext = {
      linkedPullRequests: [pr],
      linkedCommits: [makeCommit()],
    };

    const result = inferTaskState(issue, context);
    expect(result.state).toBe('NEEDS_REVIEW');
  });

  it('IN_PROGRESS > NOT_STARTED: recent commit overrides no-activity', () => {
    const issue = makeIssue({ assignees: [] });
    const context: InferenceContext = {
      linkedPullRequests: [],
      linkedCommits: [makeCommit()],
    };

    const result = inferTaskState(issue, context);
    expect(result.state).toBe('IN_PROGRESS');
  });
});

// --- Helper Function Tests ---

describe('findLinkedPullRequests', () => {
  it('should find PRs with branch names containing the issue number', () => {
    const issue = makeIssue({ number: 42 });
    const prs: GitHubPullRequest[] = [
      makePR({ number: 10, head: { ref: 'feature/42-login', sha: 'aaa' }, title: 'Add login' }),
      makePR({ number: 11, head: { ref: 'fix/other-thing', sha: 'bbb' }, title: 'Other fix' }),
    ];

    const linked = findLinkedPullRequests(issue, prs);

    expect(linked).toHaveLength(1);
    expect(linked[0].number).toBe(10);
  });

  it('should find PRs with title referencing the issue number', () => {
    const issue = makeIssue({ number: 42 });
    const prs: GitHubPullRequest[] = [
      makePR({ number: 10, head: { ref: 'unrelated-branch', sha: 'aaa' }, title: 'Fix #42 login bug' }),
      makePR({ number: 11, head: { ref: 'other', sha: 'bbb' }, title: 'No reference here' }),
    ];

    const linked = findLinkedPullRequests(issue, prs);

    expect(linked).toHaveLength(1);
    expect(linked[0].number).toBe(10);
  });

  it('should not match partial issue numbers in branch names', () => {
    const issue = makeIssue({ number: 4 });
    const prs: GitHubPullRequest[] = [
      makePR({ number: 10, head: { ref: 'feature/42-login', sha: 'aaa' }, title: 'Add login' }),
    ];

    const linked = findLinkedPullRequests(issue, prs);

    expect(linked).toHaveLength(0);
  });

  it('should return empty array when no PRs match', () => {
    const issue = makeIssue({ number: 99 });
    const prs: GitHubPullRequest[] = [
      makePR({ number: 10, head: { ref: 'feature/1-other', sha: 'aaa' }, title: 'Unrelated' }),
    ];

    const linked = findLinkedPullRequests(issue, prs);

    expect(linked).toHaveLength(0);
  });
});

describe('findLinkedCommits', () => {
  it('should find commits matching linked PR HEAD SHAs', () => {
    const issue = makeIssue({ number: 42 });
    const linkedPRs: GitHubPullRequest[] = [
      makePR({ head: { ref: 'feature/42', sha: 'sha-match-1' } }),
    ];
    const allCommits: GitHubCommit[] = [
      makeCommit({ sha: 'sha-match-1' }),
      makeCommit({ sha: 'sha-no-match' }),
    ];

    const linked = findLinkedCommits(issue, linkedPRs, allCommits);

    expect(linked).toHaveLength(1);
    expect(linked[0].sha).toBe('sha-match-1');
  });

  it('should return empty array when no linked PRs', () => {
    const issue = makeIssue({ number: 42 });
    const allCommits: GitHubCommit[] = [makeCommit()];

    const linked = findLinkedCommits(issue, [], allCommits);

    expect(linked).toHaveLength(0);
  });
});

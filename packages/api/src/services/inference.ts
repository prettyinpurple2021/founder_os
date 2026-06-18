/**
 * Task State Inference Engine
 *
 * Determines task states from GitHub evidence using rule-based inference.
 * Rules are evaluated in priority order:
 *   1. Completed: Issue is closed OR linked PR is merged
 *   2. Blocked: Issue has label matching /block/i OR comment contains dependency indicator
 *   3. Needs Review: Open PR with pending review requests
 *   4. In Progress: Linked branch with commits in last 30 days OR open PR (no review requests)
 *   5. Not Started: No linked branch, no commits, no assignee activity
 *   6. Uncertain: None of the above rules match with confidence
 *
 * Requirements: 3.1-3.7
 */

import type { GitHubIssue, GitHubPullRequest, GitHubCommit } from './github.js';

// --- Types ---

export type TaskState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'NEEDS_REVIEW'
  | 'COMPLETED'
  | 'UNCERTAIN';

export type EvidenceType = 'ISSUE' | 'PR' | 'COMMIT' | 'LABEL' | 'STATUS_CHECK';

export interface EvidenceArtifact {
  type: EvidenceType;
  url: string;
  metadata: Record<string, unknown>;
}

export interface InferenceResult {
  state: TaskState;
  evidence: EvidenceArtifact[];
  blockerReason?: string;
}

/**
 * Context required to infer a task's state.
 * Provides linked PRs, commits, and other data needed for determination.
 */
export interface InferenceContext {
  /** Pull requests linked to this issue (by branch name reference or body mention) */
  linkedPullRequests: GitHubPullRequest[];
  /** Recent commits on branches linked to this issue */
  linkedCommits: GitHubCommit[];
  /** Comments on the issue (for dependency detection) */
  issueComments?: Array<{ body: string; html_url: string }>;
}

// --- Dependency indicator patterns ---

const DEPENDENCY_PATTERNS = [
  /depends\s+on/i,
  /blocked\s+by/i,
  /waiting\s+(for|on)/i,
  /after\s+#\d+/i,
  /requires\s+#\d+/i,
];

// --- Rule implementations ---

/**
 * Rule 1: Completed
 * Issue is closed OR linked PR is merged.
 */
function checkCompleted(
  issue: GitHubIssue,
  context: InferenceContext
): InferenceResult | null {
  const evidence: EvidenceArtifact[] = [];

  // Check if issue is closed
  if (issue.state === 'closed') {
    evidence.push({
      type: 'ISSUE',
      url: issue.html_url,
      metadata: { reason: 'issue_closed', closedAt: issue.closed_at },
    });
    return { state: 'COMPLETED', evidence };
  }

  // Check if any linked PR is merged
  const mergedPR = context.linkedPullRequests.find((pr) => pr.merged);
  if (mergedPR) {
    evidence.push({
      type: 'PR',
      url: mergedPR.html_url,
      metadata: { reason: 'pr_merged', mergedAt: mergedPR.merged_at },
    });
    return { state: 'COMPLETED', evidence };
  }

  return null;
}

/**
 * Rule 2: Blocked
 * Issue has label matching /block/i OR comment contains dependency indicator.
 */
function checkBlocked(
  issue: GitHubIssue,
  context: InferenceContext
): InferenceResult | null {
  const evidence: EvidenceArtifact[] = [];
  let blockerReason: string | undefined;

  // Check labels for block pattern
  const blockingLabel = issue.labels.find((label) => /block/i.test(label.name));
  if (blockingLabel) {
    evidence.push({
      type: 'LABEL',
      url: issue.html_url,
      metadata: { labelName: blockingLabel.name, labelId: blockingLabel.id },
    });
    blockerReason = `Label: ${blockingLabel.name}`;
    return { state: 'BLOCKED', evidence, blockerReason };
  }

  // Check comments for dependency indicators
  if (context.issueComments) {
    for (const comment of context.issueComments) {
      const matchedPattern = DEPENDENCY_PATTERNS.find((pattern) =>
        pattern.test(comment.body)
      );
      if (matchedPattern) {
        evidence.push({
          type: 'ISSUE',
          url: comment.html_url,
          metadata: { reason: 'dependency_comment', pattern: matchedPattern.source },
        });
        blockerReason = `Dependency comment: "${comment.body.slice(0, 100)}"`;
        return { state: 'BLOCKED', evidence, blockerReason };
      }
    }
  }

  return null;
}

/**
 * Rule 3: Needs Review
 * Open PR with pending review requests.
 */
function checkNeedsReview(
  _issue: GitHubIssue,
  context: InferenceContext
): InferenceResult | null {
  const evidence: EvidenceArtifact[] = [];

  const prWithPendingReview = context.linkedPullRequests.find(
    (pr) =>
      pr.state === 'open' &&
      pr.requested_reviewers &&
      pr.requested_reviewers.length > 0
  );

  if (prWithPendingReview) {
    evidence.push({
      type: 'PR',
      url: prWithPendingReview.html_url,
      metadata: {
        reason: 'pending_review_requests',
        reviewers: prWithPendingReview.requested_reviewers.map((r) => r.login),
      },
    });
    return { state: 'NEEDS_REVIEW', evidence };
  }

  return null;
}

/**
 * Rule 4: In Progress
 * Linked branch has recent commits (last 30 days) OR open PR without review requests.
 */
function checkInProgress(
  _issue: GitHubIssue,
  context: InferenceContext
): InferenceResult | null {
  const evidence: EvidenceArtifact[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Check for recent commits on linked branches
  const recentCommit = context.linkedCommits.find((commit) => {
    const commitDate = commit.commit.author?.date
      ? new Date(commit.commit.author.date)
      : null;
    return commitDate && commitDate >= thirtyDaysAgo;
  });

  if (recentCommit) {
    evidence.push({
      type: 'COMMIT',
      url: recentCommit.html_url,
      metadata: {
        reason: 'recent_commit',
        sha: recentCommit.sha,
        date: recentCommit.commit.author?.date,
      },
    });
    return { state: 'IN_PROGRESS', evidence };
  }

  // Check for open PR without review requests
  const openPRNoReviews = context.linkedPullRequests.find(
    (pr) =>
      pr.state === 'open' &&
      (!pr.requested_reviewers || pr.requested_reviewers.length === 0)
  );

  if (openPRNoReviews) {
    evidence.push({
      type: 'PR',
      url: openPRNoReviews.html_url,
      metadata: { reason: 'open_pr_no_reviews' },
    });
    return { state: 'IN_PROGRESS', evidence };
  }

  return null;
}

/**
 * Rule 5: Not Started
 * No linked branch, no commits, no assignee activity.
 */
function checkNotStarted(
  issue: GitHubIssue,
  context: InferenceContext
): InferenceResult | null {
  const hasLinkedPRs = context.linkedPullRequests.length > 0;
  const hasLinkedCommits = context.linkedCommits.length > 0;
  const hasAssignee = issue.assignees && issue.assignees.length > 0;

  if (!hasLinkedPRs && !hasLinkedCommits && !hasAssignee) {
    const evidence: EvidenceArtifact[] = [
      {
        type: 'ISSUE',
        url: issue.html_url,
        metadata: {
          reason: 'no_activity',
          hasLinkedPRs: false,
          hasLinkedCommits: false,
          hasAssignee: false,
        },
      },
    ];
    return { state: 'NOT_STARTED', evidence };
  }

  return null;
}

/**
 * Rule 6: Uncertain (Fallback)
 * None of the above rules match with confidence. Displays available evidence.
 */
function checkUncertain(
  issue: GitHubIssue,
  context: InferenceContext
): InferenceResult {
  const evidence: EvidenceArtifact[] = [
    {
      type: 'ISSUE',
      url: issue.html_url,
      metadata: {
        reason: 'no_confident_match',
        issueState: issue.state,
        labelCount: issue.labels.length,
        assigneeCount: issue.assignees?.length ?? 0,
        linkedPRCount: context.linkedPullRequests.length,
        linkedCommitCount: context.linkedCommits.length,
      },
    },
  ];

  // Add evidence for any linked PRs
  for (const pr of context.linkedPullRequests) {
    evidence.push({
      type: 'PR',
      url: pr.html_url,
      metadata: { state: pr.state, merged: pr.merged },
    });
  }

  return { state: 'UNCERTAIN', evidence };
}

// --- Main inference function ---

/**
 * Infers the task state from GitHub evidence.
 *
 * Evaluates rules in priority order and returns exactly one TaskState
 * plus the evidence used to make the determination.
 *
 * This function is total — it always produces a result, defaulting to
 * "uncertain" when no confident match exists.
 *
 * @param issue - The GitHub issue representing the task
 * @param context - Additional context (linked PRs, commits, comments)
 * @returns InferenceResult with state, evidence, and optional blockerReason
 */
export function inferTaskState(
  issue: GitHubIssue,
  context: InferenceContext
): InferenceResult {
  // Rule 1: Completed (highest priority)
  const completedResult = checkCompleted(issue, context);
  if (completedResult) return completedResult;

  // Rule 2: Blocked
  const blockedResult = checkBlocked(issue, context);
  if (blockedResult) return blockedResult;

  // Rule 3: Needs Review
  const needsReviewResult = checkNeedsReview(issue, context);
  if (needsReviewResult) return needsReviewResult;

  // Rule 4: In Progress
  const inProgressResult = checkInProgress(issue, context);
  if (inProgressResult) return inProgressResult;

  // Rule 5: Not Started
  const notStartedResult = checkNotStarted(issue, context);
  if (notStartedResult) return notStartedResult;

  // Rule 6: Uncertain (fallback — always matches)
  return checkUncertain(issue, context);
}

/**
 * Finds pull requests linked to a specific issue.
 * Links are determined by:
 *   - PR branch name containing the issue number (e.g., "feature/123-add-login")
 *   - PR body mentioning the issue (e.g., "Closes #123", "Fixes #123")
 */
export function findLinkedPullRequests(
  issue: GitHubIssue,
  allPullRequests: GitHubPullRequest[]
): GitHubPullRequest[] {
  const issueNumber = issue.number;

  return allPullRequests.filter((pr) => {
    // Check branch name for issue number reference
    const branchRef = pr.head.ref;
    const branchHasIssueNumber = new RegExp(`(^|[^\\d])${issueNumber}([^\\d]|$)`).test(
      branchRef
    );

    // Check PR title for issue number reference
    const titleRef = new RegExp(`#${issueNumber}\\b`).test(pr.title);

    return branchHasIssueNumber || titleRef;
  });
}

/**
 * Finds commits linked to a specific issue by checking branch names of linked PRs.
 * Commits are "linked" if they are authored on a branch associated with the issue.
 */
export function findLinkedCommits(
  issue: GitHubIssue,
  linkedPRs: GitHubPullRequest[],
  allCommits: GitHubCommit[]
): GitHubCommit[] {
  if (linkedPRs.length === 0) return [];

  // Get the HEAD SHAs of linked PRs as a proxy for linked commits
  const linkedSHAs = new Set(linkedPRs.map((pr) => pr.head.sha));

  return allCommits.filter((commit) => linkedSHAs.has(commit.sha));
}

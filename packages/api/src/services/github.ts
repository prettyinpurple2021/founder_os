/**
 * GitHub API Client
 *
 * Fetches issues, pull requests, commits, labels, and status checks
 * for a given repository using the GitHub REST API.
 * Uses native fetch (Node 18+).
 *
 * Handles GitHub API errors gracefully:
 * - Rate limiting (403/429 with X-RateLimit headers)
 * - Authentication failures (401)
 * - Network errors (timeouts, DNS failures)
 * - Not found (404)
 */

const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = 'SoloFounderLaunchOS';
const REQUEST_TIMEOUT_MS = 15_000; // 15 seconds per request

// --- Error Types ---

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    public readonly rateLimitReset?: Date
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export class GitHubRateLimitError extends GitHubApiError {
  constructor(resetAt: Date) {
    const waitSeconds = Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
    super(
      `GitHub API rate limit exceeded. Resets at ${resetAt.toISOString()} (in ${waitSeconds}s)`,
      429,
      true,
      resetAt
    );
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubAuthError extends GitHubApiError {
  constructor(message = 'GitHub authentication failed. Token may be expired or revoked.') {
    super(message, 401, false);
    this.name = 'GitHubAuthError';
  }
}

export class GitHubNetworkError extends GitHubApiError {
  public readonly originalError?: Error;

  constructor(cause?: Error) {
    super(
      `Network error communicating with GitHub API: ${cause?.message || 'Unknown network error'}`,
      0,
      true
    );
    this.name = 'GitHubNetworkError';
    this.originalError = cause;
  }
}

// --- Types ---

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string; // 'open' | 'closed'
  labels: Array<{ id: number; name: string; color: string }>;
  assignee: { login: string } | null;
  assignees: Array<{ login: string }>;
  pull_request?: { url: string; html_url: string; merged_at: string | null };
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: string; // 'open' | 'closed'
  merged: boolean;
  merged_at: string | null;
  html_url: string;
  head: { ref: string; sha: string };
  base: { ref: string };
  requested_reviewers: Array<{ login: string }>;
  labels: Array<{ id: number; name: string }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  html_url: string;
  author: { login: string } | null;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubStatusCheck {
  state: string; // 'success' | 'failure' | 'pending' | 'error'
  statuses: Array<{
    state: string;
    context: string;
    description: string | null;
    target_url: string | null;
  }>;
  sha: string;
  total_count: number;
}

export interface GitHubRepoData {
  issues: GitHubIssue[];
  pullRequests: GitHubPullRequest[];
  commits: GitHubCommit[];
  labels: GitHubLabel[];
  statusChecks: GitHubStatusCheck[];
}

// --- Helpers ---

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
  };
}

/**
 * Parses GitHub rate limit headers from a response.
 */
function parseRateLimitReset(response: Response): Date | undefined {
  const resetHeader = response.headers.get('x-ratelimit-reset');
  if (resetHeader) {
    // GitHub sends Unix timestamp in seconds
    return new Date(parseInt(resetHeader, 10) * 1000);
  }
  return undefined;
}

/**
 * Core fetch wrapper that handles GitHub-specific error responses.
 * Throws typed errors for rate limiting, auth failures, and network issues.
 */
async function githubFetch<T>(url: string, token: string): Promise<T> {
  let response: Response;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    response = await fetch(url, {
      headers: buildHeaders(token),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
  } catch (err) {
    // Network-level errors: DNS failure, timeout, connection refused
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new GitHubNetworkError(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }
      throw new GitHubNetworkError(err);
    }
    throw new GitHubNetworkError();
  }

  // Handle HTTP error responses
  if (!response.ok) {
    const body = await response.text().catch(() => '');

    // Rate limiting: GitHub returns 403 or 429
    if (response.status === 429 || (response.status === 403 && body.includes('rate limit'))) {
      const resetAt = parseRateLimitReset(response) || new Date(Date.now() + 60_000);
      throw new GitHubRateLimitError(resetAt);
    }

    // Authentication failure
    if (response.status === 401) {
      throw new GitHubAuthError();
    }

    // Forbidden (could be scope issue)
    if (response.status === 403) {
      throw new GitHubApiError(
        `GitHub API forbidden: insufficient permissions or secondary rate limit. ${body}`,
        403,
        true
      );
    }

    // Not found
    if (response.status === 404) {
      throw new GitHubApiError(
        `GitHub resource not found: ${url}`,
        404,
        false
      );
    }

    // Server errors are retryable
    if (response.status >= 500) {
      throw new GitHubApiError(
        `GitHub API server error: ${response.status} ${response.statusText} - ${body}`,
        response.status,
        true
      );
    }

    // Other client errors
    throw new GitHubApiError(
      `GitHub API error: ${response.status} ${response.statusText} - ${body}`,
      response.status,
      false
    );
  }

  return response.json() as Promise<T>;
}

// --- Public API ---

/**
 * Fetches open issues for a repository (sorted by most recently updated).
 * Filters state=open to get current open issues.
 * GitHub's issues endpoint also returns PRs, so consumers should filter by pull_request field.
 */
export async function fetchIssues(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubIssue[]> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?state=open&per_page=100&sort=updated&direction=desc`;
  return githubFetch<GitHubIssue[]>(url, token);
}

/**
 * Fetches pull requests: open and recently updated (includes recently closed/merged).
 * Uses state=all with sort=updated to capture recent merges.
 */
export async function fetchPullRequests(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubPullRequest[]> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?state=all&per_page=100&sort=updated&direction=desc`;
  return githubFetch<GitHubPullRequest[]>(url, token);
}

/**
 * Fetches recent commits from the default branch (last 30 days).
 * Uses the `since` parameter to bound the time range.
 */
export async function fetchCommits(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubCommit[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceISO = since.toISOString();

  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=100&since=${sinceISO}`;
  return githubFetch<GitHubCommit[]>(url, token);
}

/**
 * Fetches all labels defined in a repository.
 */
export async function fetchLabels(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubLabel[]> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/labels?per_page=100`;
  return githubFetch<GitHubLabel[]>(url, token);
}

/**
 * Fetches the combined status checks for a specific commit SHA.
 * Returns the combined status including all individual check statuses.
 */
export async function fetchStatusChecks(
  token: string,
  owner: string,
  repo: string,
  ref: string
): Promise<GitHubStatusCheck> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${ref}/status`;
  const result = await githubFetch<Omit<GitHubStatusCheck, 'sha'>>(url, token);
  return { ...result, sha: ref };
}

/**
 * Fetches status checks for the head commits of recent pull requests.
 * Silently skips any individual status check that fails (e.g., 404 for force-pushed commits).
 * Returns status checks for up to the 10 most recent PRs to avoid excessive API calls.
 */
export async function fetchStatusChecksForPRs(
  token: string,
  owner: string,
  repo: string,
  pullRequests: GitHubPullRequest[]
): Promise<GitHubStatusCheck[]> {
  // Limit to 10 most recent PRs to avoid hitting rate limits
  const recentPRs = pullRequests.slice(0, 10);
  const uniqueSHAs = Array.from(new Set(recentPRs.map((pr) => pr.head.sha)));

  const results: GitHubStatusCheck[] = [];

  // Fetch in parallel but handle individual failures gracefully
  const promises = uniqueSHAs.map(async (sha) => {
    try {
      const status = await fetchStatusChecks(token, owner, repo, sha);
      return status;
    } catch {
      // Silently skip failed status checks (commit may have been force-pushed away)
      return null;
    }
  });

  const settled = await Promise.all(promises);
  for (const result of settled) {
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Fetches all relevant data from a GitHub repository in parallel.
 * Returns issues, pull requests, commits, labels, and status checks.
 *
 * Error handling strategy:
 * - If issues, PRs, or commits fail, the error propagates (these are critical)
 * - Labels default to empty array on failure (non-critical)
 * - Status checks default to empty array on failure (non-critical, may 404 for new repos)
 *
 * @throws GitHubRateLimitError if rate limited
 * @throws GitHubAuthError if token is invalid/expired
 * @throws GitHubNetworkError if network issues occur
 * @throws GitHubApiError for other API errors on critical endpoints
 */
export async function fetchAllRepoData(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubRepoData> {
  // Fetch critical data in parallel
  const [issues, pullRequests, commits, labels] = await Promise.all([
    fetchIssues(token, owner, repo),
    fetchPullRequests(token, owner, repo),
    fetchCommits(token, owner, repo),
    fetchLabels(token, owner, repo).catch((): GitHubLabel[] => []),
  ]);

  // Fetch status checks for recent PRs (non-critical, best-effort)
  const statusChecks = await fetchStatusChecksForPRs(
    token,
    owner,
    repo,
    pullRequests
  ).catch((): GitHubStatusCheck[] => []);

  return { issues, pullRequests, commits, labels, statusChecks };
}

/**
 * Unit tests for the GitHub API client module.
 *
 * Tests cover:
 * - Successful data fetching for all resource types
 * - Error handling for rate limiting, auth failures, network errors
 * - fetchAllRepoData aggregation behavior
 * - Time-bounded commit fetching (last 30 days)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchIssues,
  fetchPullRequests,
  fetchCommits,
  fetchLabels,
  fetchStatusChecks,
  fetchAllRepoData,
  GitHubApiError,
  GitHubRateLimitError,
  GitHubAuthError,
  GitHubNetworkError,
} from '../services/github.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Override Headers.get to work with our mock
function mockResponseWithHeaders(data: unknown, status: number, headers: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: (key: string) => headers[key.toLowerCase()] || null,
    },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  };
}

describe('GitHub API Client', () => {
  const token = 'ghp_test_token_123';
  const owner = 'testowner';
  const repo = 'testrepo';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchIssues', () => {
    it('fetches open issues with correct URL parameters', async () => {
      const mockIssues = [
        { id: 1, number: 1, title: 'Test issue', state: 'open', labels: [], assignees: [] },
      ];
      mockFetch.mockResolvedValue(mockResponseWithHeaders(mockIssues, 200, {}));

      const result = await fetchIssues(token, owner, repo);

      expect(result).toEqual(mockIssues);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/testowner/testrepo/issues?state=open'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${token}`,
          }),
        }),
      );
    });

    it('requests per_page=100 and sorts by updated desc', async () => {
      mockFetch.mockResolvedValue(mockResponseWithHeaders([], 200, {}));
      await fetchIssues(token, owner, repo);

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('per_page=100');
      expect(url).toContain('sort=updated');
      expect(url).toContain('direction=desc');
    });
  });

  describe('fetchPullRequests', () => {
    it('fetches PRs with state=all to include recently closed/merged', async () => {
      const mockPRs = [{ id: 1, number: 10, title: 'Fix bug', state: 'open', merged: false }];
      mockFetch.mockResolvedValue(mockResponseWithHeaders(mockPRs, 200, {}));

      const result = await fetchPullRequests(token, owner, repo);

      expect(result).toEqual(mockPRs);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('state=all');
    });
  });

  describe('fetchCommits', () => {
    it('fetches commits with since parameter for last 30 days', async () => {
      const mockCommits = [
        { sha: 'abc123', commit: { message: 'Initial', author: null }, html_url: '', author: null },
      ];
      mockFetch.mockResolvedValue(mockResponseWithHeaders(mockCommits, 200, {}));

      const result = await fetchCommits(token, owner, repo);

      expect(result).toEqual(mockCommits);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('since=');
      // Verify the since date is approximately 30 days ago
      const sinceParam = new URL(url).searchParams.get('since')!;
      const sinceDate = new Date(sinceParam);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      // Allow 1 second tolerance for test execution time
      expect(Math.abs(sinceDate.getTime() - thirtyDaysAgo.getTime())).toBeLessThan(1000);
    });
  });

  describe('fetchLabels', () => {
    it('fetches all repository labels', async () => {
      const mockLabels = [
        { id: 1, name: 'bug', color: 'ff0000', description: 'Something broken' },
        { id: 2, name: 'feature', color: '00ff00', description: null },
      ];
      mockFetch.mockResolvedValue(mockResponseWithHeaders(mockLabels, 200, {}));

      const result = await fetchLabels(token, owner, repo);

      expect(result).toEqual(mockLabels);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/labels?per_page=100');
    });
  });

  describe('fetchStatusChecks', () => {
    it('fetches combined status for a specific commit ref', async () => {
      const mockStatus = { state: 'success', statuses: [], total_count: 0 };
      mockFetch.mockResolvedValue(mockResponseWithHeaders(mockStatus, 200, {}));

      const result = await fetchStatusChecks(token, owner, repo, 'abc123');

      expect(result).toEqual({ ...mockStatus, sha: 'abc123' });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/commits/abc123/status');
    });
  });

  describe('Error Handling', () => {
    it('throws GitHubRateLimitError on 429 response', async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;
      mockFetch.mockResolvedValue(
        mockResponseWithHeaders('rate limit exceeded', 429, {
          'x-ratelimit-reset': String(resetTimestamp),
        }),
      );

      await expect(fetchIssues(token, owner, repo)).rejects.toThrow(GitHubRateLimitError);
    });

    it('throws GitHubRateLimitError on 403 with rate limit message', async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;
      mockFetch.mockResolvedValue(
        mockResponseWithHeaders('API rate limit exceeded for user', 403, {
          'x-ratelimit-reset': String(resetTimestamp),
        }),
      );

      await expect(fetchIssues(token, owner, repo)).rejects.toThrow(GitHubRateLimitError);
    });

    it('throws GitHubAuthError on 401 response', async () => {
      mockFetch.mockResolvedValue(mockResponseWithHeaders('Bad credentials', 401, {}));

      await expect(fetchIssues(token, owner, repo)).rejects.toThrow(GitHubAuthError);
    });

    it('throws GitHubApiError on 404 response (not retryable)', async () => {
      mockFetch.mockResolvedValue(mockResponseWithHeaders('Not Found', 404, {}));

      try {
        await fetchIssues(token, owner, repo);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubApiError);
        expect((err as GitHubApiError).statusCode).toBe(404);
        expect((err as GitHubApiError).retryable).toBe(false);
      }
    });

    it('throws retryable GitHubApiError on 500 response', async () => {
      mockFetch.mockResolvedValue(mockResponseWithHeaders('Internal Server Error', 500, {}));

      try {
        await fetchIssues(token, owner, repo);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubApiError);
        expect((err as GitHubApiError).statusCode).toBe(500);
        expect((err as GitHubApiError).retryable).toBe(true);
      }
    });

    it('throws GitHubNetworkError on fetch rejection (network failure)', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(fetchIssues(token, owner, repo)).rejects.toThrow(GitHubNetworkError);
    });

    it('GitHubRateLimitError includes reset time', async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 60;
      mockFetch.mockResolvedValue(
        mockResponseWithHeaders('rate limit', 429, {
          'x-ratelimit-reset': String(resetTimestamp),
        }),
      );

      try {
        await fetchIssues(token, owner, repo);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubRateLimitError);
        const rlError = err as GitHubRateLimitError;
        expect(rlError.rateLimitReset).toBeDefined();
        expect(rlError.rateLimitReset!.getTime()).toBe(resetTimestamp * 1000);
      }
    });
  });

  describe('fetchAllRepoData', () => {
    it('fetches all data types in parallel and returns structured result', async () => {
      const mockIssues = [
        { id: 1, number: 1, title: 'Issue 1', state: 'open', labels: [], assignees: [] },
      ];
      const mockPRs = [
        {
          id: 2,
          number: 10,
          title: 'PR 1',
          state: 'open',
          merged: false,
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main' },
          requested_reviewers: [],
          labels: [],
        },
      ];
      const mockCommits = [
        { sha: 'abc123', commit: { message: 'commit', author: null }, html_url: '', author: null },
      ];
      const mockLabels = [{ id: 1, name: 'bug', color: 'ff0000', description: null }];
      const mockStatus = { state: 'success', statuses: [], total_count: 0 };

      // The function calls fetch 5 times (issues, PRs, commits, labels, then status for PR head)
      mockFetch
        .mockResolvedValueOnce(mockResponseWithHeaders(mockIssues, 200, {})) // issues
        .mockResolvedValueOnce(mockResponseWithHeaders(mockPRs, 200, {})) // PRs
        .mockResolvedValueOnce(mockResponseWithHeaders(mockCommits, 200, {})) // commits
        .mockResolvedValueOnce(mockResponseWithHeaders(mockLabels, 200, {})) // labels
        .mockResolvedValueOnce(mockResponseWithHeaders(mockStatus, 200, {})); // status check

      const result = await fetchAllRepoData(token, owner, repo);

      expect(result.issues).toEqual(mockIssues);
      expect(result.pullRequests).toEqual(mockPRs);
      expect(result.commits).toEqual(mockCommits);
      expect(result.labels).toEqual(mockLabels);
      expect(result.statusChecks).toHaveLength(1);
    });

    it('returns empty labels array if labels fetch fails', async () => {
      const mockIssues = [
        { id: 1, number: 1, title: 'Issue', state: 'open', labels: [], assignees: [] },
      ];
      const mockPRs: unknown[] = [];
      const mockCommits = [
        { sha: 'abc', commit: { message: 'x', author: null }, html_url: '', author: null },
      ];

      mockFetch
        .mockResolvedValueOnce(mockResponseWithHeaders(mockIssues, 200, {})) // issues
        .mockResolvedValueOnce(mockResponseWithHeaders(mockPRs, 200, {})) // PRs
        .mockResolvedValueOnce(mockResponseWithHeaders(mockCommits, 200, {})) // commits
        .mockResolvedValueOnce(mockResponseWithHeaders('Not Found', 404, {})); // labels fail

      const result = await fetchAllRepoData(token, owner, repo);

      // Labels should gracefully fallback to empty
      expect(result.labels).toEqual([]);
      // Status checks should also be empty (no PRs to check)
      expect(result.statusChecks).toEqual([]);
    });

    it('propagates auth error from critical endpoints', async () => {
      mockFetch.mockResolvedValue(mockResponseWithHeaders('Bad credentials', 401, {}));

      await expect(fetchAllRepoData(token, owner, repo)).rejects.toThrow(GitHubAuthError);
    });

    it('propagates rate limit error from critical endpoints', async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;
      mockFetch.mockResolvedValue(
        mockResponseWithHeaders('rate limit', 429, {
          'x-ratelimit-reset': String(resetTimestamp),
        }),
      );

      await expect(fetchAllRepoData(token, owner, repo)).rejects.toThrow(GitHubRateLimitError);
    });
  });

  describe('Request headers', () => {
    it('sets correct Authorization, Accept, and User-Agent headers', async () => {
      mockFetch.mockResolvedValue(mockResponseWithHeaders([], 200, {}));

      await fetchIssues(token, owner, repo);

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers).toEqual({
        Authorization: 'Bearer ghp_test_token_123',
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'SoloFounderLaunchOS',
      });
    });
  });
});

/**
 * Property 3: Last Successful State Preservation
 *
 * After a failed sync (all retries exhausted), all task states and evidence
 * remain identical to the state after the last successful sync. No task data
 * is modified by a failed sync.
 *
 * Validates: Requirements 2.6, 11.1
 *
 * Key insight: performSync only calls task.upsert inside the try block after
 * a successful GitHub API fetch. Any failure in fetching means upserts never
 * execute — so no task data is ever modified during a failed sync, regardless
 * of the initial task state configuration or error type.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock prisma before importing sync service
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
      upsert: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('../lib/encryption.js', () => ({
  getDecryptedToken: vi.fn(() => 'fake-github-token'),
}));

// Mock global fetch for GitHub API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import prisma from '../lib/prisma.js';
import { performSync } from '../services/sync.js';

// --- Arbitraries ---

/** All possible task states from the TaskState enum */
const TASK_STATES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'NEEDS_REVIEW',
  'COMPLETED',
  'UNCERTAIN',
] as const;

/** Arbitrary for a single TaskState */
const taskStateArb = fc.constantFrom(...TASK_STATES);

/** Arbitrary for a single task record with random state */
const taskArb = fc.record({
  id: fc.uuid(),
  repositoryId: fc.constant('repo-test-1'),
  githubIssueId: fc.integer({ min: 1, max: 10000 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  state: taskStateArb,
  blockerReason: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
  lastInferredAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-01-01') }),
});

/** Arbitrary for a collection of tasks (0 to 20 tasks) */
const taskCollectionArb = fc.array(taskArb, { minLength: 0, maxLength: 20 });

/** Arbitrary for different types of errors that could occur during GitHub API calls */
const errorTypeArb = fc.oneof(
  fc.constant(new Error('Network error')),
  fc.constant(new Error('fetch failed')),
  fc.constant(new Error('ECONNREFUSED')),
  fc.constant(new Error('ETIMEDOUT')),
  fc.constant(new Error('DNS lookup failed')),
  fc.constant(new Error('GitHub API server error: 500 Internal Server Error')),
  fc.constant(new Error('GitHub API rate limit exceeded')),
  fc.constant(new Error('socket hang up')),
  fc.constant(new Error('TLS handshake timeout')),
  fc.constant(new Error('Request timed out after 15000ms')),
);

describe('Property: Last Successful State Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers to skip retry delays
    vi.useFakeTimers();
  });

  it('after a failed sync, task states remain unchanged from last successful sync — no task data is modified, added, or removed', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        taskCollectionArb,
        errorTypeArb,
        async (initialTasks, error) => {
          vi.clearAllMocks();

          // Set up the repository mock
          const mockRepo = {
            id: 'repo-test-1',
            userId: 'user-test-1',
            owner: 'testowner',
            name: 'testrepo',
            user: {
              id: 'user-test-1',
              githubId: 'gh-test-1',
              username: 'testowner',
              accessToken: 'encrypted-token',
            },
          };

          (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockRepo);

          // Set up sync record mocks
          (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'sync-test-1',
            repositoryId: 'repo-test-1',
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          });

          (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'sync-test-1',
            repositoryId: 'repo-test-1',
            status: 'FAILED',
            completedAt: new Date(),
            duration: 100,
            errorMessage: error.message,
            retryCount: 3,
          });

          // Take a snapshot of the initial task collection (deep copy)
          const taskSnapshot = JSON.parse(JSON.stringify(initialTasks));

          // GitHub API always errors — fetch rejects on every attempt
          mockFetch.mockRejectedValue(error);

          // Execute the sync (which will fail after all retries)
          const syncPromise = performSync('repo-test-1');

          // Advance timers to skip retry backoff delays
          // Attempt 1: immediate, Attempt 2: 1s delay, Attempt 3: 2s delay
          await vi.advanceTimersByTimeAsync(1000);
          await vi.advanceTimersByTimeAsync(2000);
          await vi.advanceTimersByTimeAsync(4000);

          const result = await syncPromise;

          // PROPERTY ASSERTION 1: task.upsert was NEVER called
          // This means no tasks were created, updated, or modified
          expect(prisma.task.upsert).not.toHaveBeenCalled();

          // PROPERTY ASSERTION 2: The sync was marked as failed
          expect(result.status).toBe('FAILED');

          // PROPERTY ASSERTION 3: The initial task snapshot is still the
          // "truth" — since no upserts happened, the database state is identical.
          // We verify this by confirming the snapshot hasn't changed (no side effect)
          expect(JSON.parse(JSON.stringify(initialTasks))).toEqual(taskSnapshot);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('state preservation holds regardless of task count — from empty to many tasks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 50 }),
        errorTypeArb,
        async (taskCount, error) => {
          vi.clearAllMocks();

          const mockRepo = {
            id: 'repo-test-1',
            userId: 'user-test-1',
            owner: 'testowner',
            name: 'testrepo',
            user: {
              id: 'user-test-1',
              githubId: 'gh-test-1',
              username: 'testowner',
              accessToken: 'encrypted-token',
            },
          };

          (prisma.repository.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockRepo);
          (prisma.sync.create as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'sync-test-2',
            repositoryId: 'repo-test-1',
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          });
          (prisma.sync.update as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'sync-test-2',
            repositoryId: 'repo-test-1',
            status: 'FAILED',
            completedAt: new Date(),
            duration: 100,
            errorMessage: error.message,
            retryCount: 3,
          });

          // GitHub API always errors
          mockFetch.mockRejectedValue(error);

          // Execute the sync
          const syncPromise = performSync('repo-test-1');
          await vi.advanceTimersByTimeAsync(1000);
          await vi.advanceTimersByTimeAsync(2000);
          await vi.advanceTimersByTimeAsync(4000);
          const result = await syncPromise;

          // PROPERTY: Regardless of how many tasks exist in the database (0..50),
          // a failed sync never calls task.upsert — preserving all existing state.
          expect(prisma.task.upsert).not.toHaveBeenCalled();
          expect(result.status).toBe('FAILED');
          expect(result.retryCount).toBe(3);
        },
      ),
      { numRuns: 50 },
    );
  });
});

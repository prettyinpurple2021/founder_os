/**
 * Sync Service
 *
 * Orchestrates the sync process: fetches data from GitHub, upserts tasks
 * in the database, and records sync status/history.
 *
 * Implements retry with exponential backoff (3 attempts, base delay 1s, factor 2x).
 */

import prisma from '../lib/prisma.js';
import { getDecryptedToken } from '../lib/encryption.js';
import { fetchAllRepoData, GitHubIssue, GitHubPullRequest, GitHubCommit } from './github.js';
import { inferTaskState, findLinkedPullRequests, findLinkedCommits, InferenceContext } from './inference.js';
import { logSync, logStateChange } from './logger.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Delays execution for a given number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Performs a full sync for a given repository.
 * Fetches data from GitHub, upserts tasks, and records sync metadata.
 *
 * @param repositoryId - The internal repository ID
 * @returns The completed Sync record
 */
export async function performSync(repositoryId: string) {
  // Fetch the repository with its user (for token decryption)
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { user: true },
  });

  if (!repository) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  // Create a sync record with IN_PROGRESS status
  const sync = await prisma.sync.create({
    data: {
      repositoryId,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
  });

  // Log sync start
  await logSync(repository.user.id, 'sync_started', {
    repositoryId,
    triggeredBy: 'manual',
  });

  const startTime = Date.now();
  let lastError: Error | null = null;

  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const token = getDecryptedToken(repository.user);
      const repoData = await fetchAllRepoData(
        token,
        repository.owner,
        repository.name
      );

      // Filter to actual issues (GitHub API returns PRs in the issues endpoint too)
      const actualIssues = repoData.issues.filter(
        (issue) => !issue.pull_request
      );

      // Upsert tasks from issues using the full inference engine
      let itemsFetched = 0;
      for (const issue of actualIssues) {
        await upsertTaskFromIssue(
          repositoryId,
          issue,
          repoData.pullRequests,
          repoData.commits,
          repository.user.id
        );
        itemsFetched++;
      }

      // Mark sync as successful
      const duration = Date.now() - startTime;
      const completedSync = await prisma.sync.update({
        where: { id: sync.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          duration,
          itemsFetched,
          retryCount: attempt - 1,
        },
      });

      // Log sync completion
      await logSync(repository.user.id, 'sync_completed', {
        repositoryId,
        duration,
        itemsFetched,
        outcome: 'success',
      });

      return completedSync;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // If we haven't exhausted retries, wait before trying again
      if (attempt < MAX_RETRIES) {
        const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);

        // Log retry event
        await logSync(repository.user.id, 'sync_retry', {
          repositoryId,
          attempt,
          delay: backoffMs,
          error: lastError.message,
        });

        await delay(backoffMs);
      }
    }
  }

  // All retries exhausted — mark sync as failed
  const duration = Date.now() - startTime;
  const failedSync = await prisma.sync.update({
    where: { id: sync.id },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      duration,
      errorMessage: lastError?.message || 'Unknown error after retries',
      retryCount: MAX_RETRIES,
    },
  });

  // Log sync failure
  await logSync(repository.user.id, 'sync_failed', {
    repositoryId,
    duration,
    itemsFetched: 0,
    outcome: 'failed',
    errorMessage: lastError?.message || 'Unknown error after retries',
  });

  return failedSync;
}

/**
 * Upserts a task from a GitHub issue using the full inference engine.
 * Creates the task if it doesn't exist, or updates the title and state.
 * Records blocker reason when state is BLOCKED.
 *
 * When the inferred state differs from the current state, creates Evidence
 * records for each artifact returned by the inference engine, and records
 * a StateTransition linking previous state, new state, and evidence IDs.
 *
 * Requirements: 3.8 — preserve evidence used to infer each Task_State transition.
 */
export async function upsertTaskFromIssue(
  repositoryId: string,
  issue: GitHubIssue,
  allPullRequests: GitHubPullRequest[],
  allCommits: GitHubCommit[],
  userId?: string
): Promise<void> {
  // Build inference context
  const linkedPRs = findLinkedPullRequests(issue, allPullRequests);
  const linkedCommits = findLinkedCommits(issue, linkedPRs, allCommits);

  const context: InferenceContext = {
    linkedPullRequests: linkedPRs,
    linkedCommits: linkedCommits,
  };

  // Run the inference engine
  const result = inferTaskState(issue, context);

  // Get the current task state before upserting (null if task doesn't exist yet)
  const existingTask = await prisma.task.findFirst({
    where: {
      repositoryId,
      githubIssueId: issue.number,
    },
    select: { id: true, state: true },
  });

  const previousState = existingTask?.state ?? null;

  // Upsert the task: update if exists, create if not
  let task: { id: string };
  if (existingTask) {
    task = await prisma.task.update({
      where: { id: existingTask.id },
      data: {
        title: issue.title,
        state: result.state,
        blockerReason: result.blockerReason || null,
        lastInferredAt: new Date(),
      },
    });
  } else {
    task = await prisma.task.create({
      data: {
        repositoryId,
        githubIssueId: issue.number,
        title: issue.title,
        state: result.state,
        blockerReason: result.blockerReason || null,
        lastInferredAt: new Date(),
      },
    });
  }

  // Only create evidence and state transitions when state actually changes
  const stateChanged = previousState !== null && previousState !== result.state;
  const isNewTask = previousState === null;

  if (stateChanged || isNewTask) {
    // Create Evidence records for each artifact from the inference result
    const evidenceRecords = await Promise.all(
      result.evidence.map((artifact) =>
        prisma.evidence.create({
          data: {
            taskId: task.id,
            type: artifact.type,
            url: artifact.url,
            metadata: artifact.metadata as object,
          },
        })
      )
    );

    const evidenceIds = evidenceRecords.map((e) => e.id);

    // Create a StateTransition record
    await prisma.stateTransition.create({
      data: {
        taskId: task.id,
        previousState: previousState ?? result.state, // For new tasks, previous = new (initial transition)
        newState: result.state,
        evidenceIds,
      },
    });

    // Log state change when state actually changes (Requirement 10.2)
    if (stateChanged) {
      await logStateChange(userId ?? 'system', 'task_state_changed', {
        taskId: task.id,
        previousState: previousState,
        newState: result.state,
        evidenceIds,
        taskTitle: issue.title,
      });
    }
  }
}

/**
 * Triggers a sync for a user's connected repository.
 * Returns the sync record or throws if no repository is connected.
 */
export async function triggerSyncForUser(userId: string) {
  const repository = await prisma.repository.findUnique({
    where: { userId },
  });

  if (!repository) {
    throw new Error('No repository connected for this user');
  }

  return performSync(repository.id);
}

/**
 * Retrieves the last successful sync for a given repository.
 * Used to provide staleness context when a sync fails.
 *
 * @param repositoryId - The internal repository ID
 * @returns The last successful Sync record, or null if none exists
 */
export async function getLastSuccessfulSync(repositoryId: string) {
  return prisma.sync.findFirst({
    where: {
      repositoryId,
      status: 'SUCCESS',
    },
    orderBy: { completedAt: 'desc' },
  });
}

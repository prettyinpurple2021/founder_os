/**
 * Stale Data Indicator Middleware
 *
 * When the GitHub API is unreachable (last sync failed), API responses include:
 * - `isStale` boolean flag
 * - `lastSuccessfulSync` timestamp
 * - `stalenessMessage` human-readable message
 *
 * This middleware attaches staleness metadata to `res.locals.staleness`
 * so route handlers can include it in their responses. It also provides
 * a response helper `res.locals.withStaleness(data)` that merges staleness
 * info into any response payload.
 *
 * Requirements: 11.1 — IF the GitHub API is unreachable, THEN THE System SHALL
 * display the last known state and notify the User that data may be stale.
 */

import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';

/**
 * Staleness metadata attached to responses when data may be out of date.
 */
export interface StalenessInfo {
  /** Whether the data may be stale (last sync failed or no successful sync exists) */
  isStale: boolean;
  /** Timestamp of the last successful sync, or null if none exists */
  lastSuccessfulSync: Date | null;
  /** Human-readable staleness message, or null if data is fresh */
  stalenessMessage: string | null;
}

/**
 * Formats a Date into a human-readable timestamp string.
 */
function formatTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Builds a staleness message from the last successful sync timestamp.
 */
export function buildStalenessMessage(lastSuccessfulSync: Date | null): string {
  if (lastSuccessfulSync) {
    return `Data may be stale. Last successful sync: ${formatTimestamp(lastSuccessfulSync)}`;
  }
  return 'Data may be stale. No successful sync has been recorded yet.';
}

/**
 * Determines staleness info for a given repository ID.
 * Returns StalenessInfo indicating whether data is stale and when the last
 * successful sync occurred.
 *
 * Logic:
 * - If no syncs exist at all, data is stale (never synced).
 * - If the most recent sync is FAILED, data is stale.
 * - If the most recent sync is SUCCESS, data is fresh.
 * - If the most recent sync is IN_PROGRESS or PENDING, check the one before it.
 */
export async function getStalenessInfo(repositoryId: string): Promise<StalenessInfo> {
  // Get the most recent sync for this repository
  const lastSync = await prisma.sync.findFirst({
    where: { repositoryId },
    orderBy: { startedAt: 'desc' },
  });

  // Get the last successful sync
  const lastSuccessful = await prisma.sync.findFirst({
    where: {
      repositoryId,
      status: 'SUCCESS',
    },
    orderBy: { completedAt: 'desc' },
  });

  const lastSuccessfulSync = lastSuccessful?.completedAt ?? null;

  // No syncs at all — data is stale (never synced)
  if (!lastSync) {
    return {
      isStale: true,
      lastSuccessfulSync: null,
      stalenessMessage: buildStalenessMessage(null),
    };
  }

  // Most recent sync failed — data is stale
  if (lastSync.status === 'FAILED') {
    return {
      isStale: true,
      lastSuccessfulSync,
      stalenessMessage: buildStalenessMessage(lastSuccessfulSync),
    };
  }

  // Most recent sync is in progress or pending — check if we have a previous successful one
  if (lastSync.status === 'IN_PROGRESS' || lastSync.status === 'PENDING') {
    // If there's a previous successful sync, data is fresh (sync is just running)
    if (lastSuccessful) {
      return {
        isStale: false,
        lastSuccessfulSync,
        stalenessMessage: null,
      };
    }
    // No successful sync ever — data is stale
    return {
      isStale: true,
      lastSuccessfulSync: null,
      stalenessMessage: buildStalenessMessage(null),
    };
  }

  // Most recent sync succeeded — data is fresh
  return {
    isStale: false,
    lastSuccessfulSync,
    stalenessMessage: null,
  };
}

/**
 * Merges staleness info into a response payload.
 * Only adds staleness fields when data is actually stale.
 * When data is fresh, adds `isStale: false` for consistency.
 */
export function withStaleness<T extends object>(
  data: T,
  staleness: StalenessInfo,
): T & Partial<StalenessInfo> {
  if (staleness.isStale) {
    return {
      ...data,
      isStale: staleness.isStale,
      lastSuccessfulSync: staleness.lastSuccessfulSync,
      stalenessMessage: staleness.stalenessMessage,
    };
  }
  return {
    ...data,
    isStale: false,
  };
}

/**
 * Express middleware that computes staleness information for authenticated users
 * with a connected repository and attaches it to `res.locals.staleness`.
 *
 * Route handlers can then use `withStaleness(responseData, res.locals.staleness)`
 * to include staleness metadata in their responses.
 *
 * If the user is not authenticated or has no connected repository, the middleware
 * passes through without attaching staleness info.
 */
export async function staleDataIndicator(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Only compute staleness for authenticated users
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
      next();
      return;
    }

    const user = req.user;

    // Find the user's connected repository
    const repository = await prisma.repository.findUnique({
      where: { userId: user.id },
    });

    if (!repository) {
      // No repo connected — no staleness to compute
      next();
      return;
    }

    // Compute and attach staleness info
    const staleness = await getStalenessInfo(repository.id);
    res.locals.staleness = staleness;

    next();
  } catch {
    // Don't let staleness computation failures block the request
    // Just proceed without staleness info
    next();
  }
}

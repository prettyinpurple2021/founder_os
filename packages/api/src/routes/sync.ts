/**
 * Sync Routes
 *
 * POST /api/sync/trigger — Manual sync trigger (requires auth)
 * GET  /api/sync/status  — Last sync status for connected repo
 * GET  /api/sync/history — Paginated sync history for connected repo
 *
 * Failure handling strategy (Requirements 2.6, 11.1):
 * - Failed syncs never modify existing task data (preservation handled in sync service)
 * - Failed sync responses include staleness indicator and last successful sync timestamp
 * - User is notified via the API response with clear failure context
 */

import { Router, Request, Response, NextFunction } from 'express';
import { triggerSyncForUser, getLastSuccessfulSync } from '../services/sync.js';
import { AppError, unauthorized, internalError } from '../errors/AppError.js';
import prisma from '../lib/prisma.js';
import { validate } from '../middleware/validate.js';
import { syncHistoryQuerySchema } from '../validation/schemas.js';

const router = Router();

/**
 * Ensures the user is authenticated before accessing sync routes.
 */
function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    next(unauthorized('Authentication required'));
    return;
  }
  next();
}

router.use(requireAuth);

/**
 * POST /api/sync/trigger
 * Triggers a manual sync for the authenticated user's connected repository.
 * Fetches data from GitHub, upserts tasks, and records sync metadata.
 *
 * On success (200): returns sync record with fetched data info.
 * On failure (202): returns sync record with error details, staleness indicator,
 *   last successful sync timestamp, and a user notification message.
 *   Task data remains unchanged from the last successful sync.
 */
router.post('/trigger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const sync = await triggerSyncForUser(user.id);

    if (sync.status === 'SUCCESS') {
      res.status(200).json({
        sync: {
          id: sync.id,
          status: sync.status,
          startedAt: sync.startedAt,
          completedAt: sync.completedAt,
          duration: sync.duration,
          itemsFetched: sync.itemsFetched,
          retryCount: sync.retryCount,
        },
      });
      return;
    }

    // Failed sync — include staleness context and user notification
    const lastSuccessful = await getLastSuccessfulSync(sync.repositoryId);

    res.status(202).json({
      sync: {
        id: sync.id,
        status: sync.status,
        startedAt: sync.startedAt,
        completedAt: sync.completedAt,
        duration: sync.duration,
        itemsFetched: sync.itemsFetched,
        errorMessage: sync.errorMessage,
        retryCount: sync.retryCount,
      },
      failure: {
        stale: true,
        lastSuccessfulSync: lastSuccessful?.completedAt || null,
        message:
          'Sync failed after all retries. Your task data reflects the last successful sync and may be stale.',
        retryable: true,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'No repository connected for this user') {
      next(
        new AppError({
          code: 'NO_REPO_CONNECTED',
          message: 'No repository is connected. Connect a repository before triggering a sync.',
          statusCode: 400,
          retryable: false,
        }),
      );
      return;
    }
    next(err instanceof AppError ? err : internalError('Failed to trigger sync'));
  }
});

/**
 * GET /api/sync/status
 * Returns the last sync status and timestamp for the user's connected repository.
 * Includes an `isStale` flag indicating if the last successful sync exceeded the user's syncInterval.
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;

    const repository = await prisma.repository.findUnique({
      where: { userId: user.id },
    });

    if (!repository) {
      next(
        new AppError({
          code: 'NO_REPO_CONNECTED',
          message: 'No repository is connected. Connect a repository first.',
          statusCode: 400,
          retryable: false,
        }),
      );
      return;
    }

    // Get the most recent sync for this repository
    const lastSync = await prisma.sync.findFirst({
      where: { repositoryId: repository.id },
      orderBy: { startedAt: 'desc' },
    });

    // Determine if the last successful sync is stale
    let isStale = true; // Default to stale if no successful sync exists
    if (lastSync && lastSync.status === 'SUCCESS' && lastSync.completedAt) {
      const syncIntervalMs = user.syncInterval * 60 * 1000;
      const timeSinceSync = Date.now() - lastSync.completedAt.getTime();
      isStale = timeSinceSync > syncIntervalMs;
    }

    res.status(200).json({
      lastSync: lastSync
        ? {
            id: lastSync.id,
            status: lastSync.status,
            startedAt: lastSync.startedAt,
            completedAt: lastSync.completedAt,
            duration: lastSync.duration,
            itemsFetched: lastSync.itemsFetched,
            errorMessage: lastSync.errorMessage,
          }
        : null,
      isStale,
    });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch sync status'));
  }
});

/**
 * GET /api/sync/history
 * Returns paginated sync history for the user's connected repository.
 * Query params: limit (default 20, max 100), offset (default 0)
 * Ordered by startedAt descending (most recent first).
 */
router.get(
  '/history',
  validate(syncHistoryQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;

      const repository = await prisma.repository.findUnique({
        where: { userId: user.id },
      });

      if (!repository) {
        next(
          new AppError({
            code: 'NO_REPO_CONNECTED',
            message: 'No repository is connected. Connect a repository first.',
            statusCode: 400,
            retryable: false,
          }),
        );
        return;
      }

      // Query params are already validated and typed by the middleware
      const { limit, offset } = req.query as unknown as { limit: number; offset: number };

      const [syncs, total] = await Promise.all([
        prisma.sync.findMany({
          where: { repositoryId: repository.id },
          orderBy: { startedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.sync.count({
          where: { repositoryId: repository.id },
        }),
      ]);

      res.status(200).json({
        syncs: syncs.map((s) => ({
          id: s.id,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          duration: s.duration,
          itemsFetched: s.itemsFetched,
          errorMessage: s.errorMessage,
          retryCount: s.retryCount,
        })),
        total,
      });
    } catch (err) {
      next(err instanceof AppError ? err : internalError('Failed to fetch sync history'));
    }
  },
);

export default router;

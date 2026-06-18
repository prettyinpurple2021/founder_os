import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { AppError, unauthorized, badRequest, notFound, internalError } from '../errors/AppError.js';
import { TaskState } from '../generated/prisma/enums.js';

const router = Router();

/**
 * Ensures the user is authenticated before accessing task routes.
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
 * GET /api/tasks
 * Returns all tasks for the user's connected repository.
 * Query params:
 *   - state: optional filter by TaskState
 *   - limit: number of results (default 50, max 100)
 *   - offset: pagination offset (default 0)
 *
 * Response: { tasks: Array<{ id, githubIssueId, title, state, blockerReason, lastInferredAt }>, total: number }
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;

    // Find the user's connected repository
    const repository = await prisma.repository.findUnique({
      where: { userId: user.id },
    });

    if (!repository) {
      next(notFound('No repository is currently connected'));
      return;
    }

    // Parse query params
    const stateFilter = req.query.state as string | undefined;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    // Validate state filter if provided
    if (stateFilter && !Object.values(TaskState).includes(stateFilter as TaskState)) {
      next(badRequest(`Invalid state filter. Must be one of: ${Object.values(TaskState).join(', ')}`));
      return;
    }

    // Build where clause
    const where: { repositoryId: string; state?: TaskState } = {
      repositoryId: repository.id,
    };

    if (stateFilter) {
      where.state = stateFilter as TaskState;
    }

    // Fetch tasks and total count in parallel
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          githubIssueId: true,
          title: true,
          state: true,
          blockerReason: true,
          lastInferredAt: true,
        },
        orderBy: { githubIssueId: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ]);

    res.json({ tasks, total });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch tasks'));
  }
});

/**
 * GET /api/tasks/:id/evidence
 * Returns evidence and state history for a specific task.
 * Returns 404 if task not found or doesn't belong to user's repo.
 *
 * Response: {
 *   evidence: Array<{ id, type, url, metadata, fetchedAt }>,
 *   stateHistory: Array<{ id, previousState, newState, evidenceIds, timestamp }>
 * }
 */
router.get('/:id/evidence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const taskId = req.params.id;

    // Find the user's connected repository
    const repository = await prisma.repository.findUnique({
      where: { userId: user.id },
    });

    if (!repository) {
      next(notFound('No repository is currently connected'));
      return;
    }

    // Fetch the task and verify it belongs to the user's repository
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        repositoryId: repository.id,
      },
      include: {
        evidence: {
          select: {
            id: true,
            type: true,
            url: true,
            metadata: true,
            fetchedAt: true,
          },
          orderBy: { fetchedAt: 'desc' },
        },
        stateHistory: {
          select: {
            id: true,
            previousState: true,
            newState: true,
            evidenceIds: true,
            timestamp: true,
          },
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!task) {
      next(notFound('Task not found'));
      return;
    }

    res.json({
      evidence: task.evidence,
      stateHistory: task.stateHistory,
    });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch task evidence'));
  }
});

export default router;

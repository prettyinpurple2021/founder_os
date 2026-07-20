import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { getDecryptedToken } from '../lib/encryption.js';
import { AppError, unauthorized, notFound, internalError } from '../errors/AppError.js';
import { validate } from '../middleware/validate.js';
import { connectRepoSchema } from '../validation/schemas.js';
import posthog from '../lib/posthog.js';

const router = Router();

/**
 * Ensures the user is authenticated before accessing repo routes.
 * All routes in this module require a logged-in user.
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
 * GET /api/repos/available
 * Lists the authenticated user's GitHub repositories using their stored access token.
 * Returns a simplified list suitable for the repository selection UI.
 */
router.get('/available', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const token = getDecryptedToken(user);

    // Fetch user's repositories from GitHub API (up to 100, sorted by most recently pushed)
    const response = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=pushed&direction=desc',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'SoloFounderLaunchOS',
        },
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        next(unauthorized('GitHub token is invalid or expired. Please re-authenticate.'));
        return;
      }
      next(
        new AppError({
          code: 'GITHUB_API_ERROR',
          message: `Failed to fetch repositories from GitHub (status ${response.status})`,
          statusCode: 502,
          retryable: true,
        }),
      );
      return;
    }

    const repos = (await response.json()) as Array<{
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
      private: boolean;
      description: string | null;
      html_url: string;
      language: string | null;
      pushed_at: string | null;
    }>;

    // Return a simplified list for the UI
    const available = repos.map((repo) => ({
      githubId: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      private: repo.private,
      description: repo.description,
      url: repo.html_url,
      language: repo.language,
      pushedAt: repo.pushed_at,
    }));

    res.json({ repositories: available });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch available repositories'));
  }
});

/**
 * POST /api/repos/connect
 * Connects a GitHub repository for the authenticated user.
 * Enforces one-repository-per-user constraint at the database level.
 * Stores repo metadata and triggers an initial sync (placeholder).
 *
 * Body: { githubId: number, name: string, fullName: string, owner: string }
 */
router.post(
  '/connect',
  validate(connectRepoSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const { githubId, name, fullName, owner } = req.body;

      // Check if user already has a connected repository
      const existing = await prisma.repository.findUnique({
        where: { userId: user.id },
      });

      if (existing) {
        next(
          new AppError({
            code: 'REPO_ALREADY_CONNECTED',
            message:
              'A repository is already connected. Disconnect the current repository before connecting a new one.',
            statusCode: 409,
            retryable: false,
          }),
        );
        return;
      }

      // Create the repository record
      const repository = await prisma.repository.create({
        data: {
          userId: user.id,
          githubId,
          name,
          fullName,
          owner,
        },
      });

      // Trigger initial sync — create a placeholder sync record with PENDING status
      const sync = await prisma.sync.create({
        data: {
          repositoryId: repository.id,
          status: 'PENDING',
          startedAt: new Date(),
        },
      });

      posthog.capture({
        distinctId: user.id,
        event: 'repository_connected',
        properties: {
          repo_name: repository.name,
          repo_full_name: repository.fullName,
          repo_owner: repository.owner,
          github_id: repository.githubId,
        },
      });

      res.status(201).json({
        repository: {
          id: repository.id,
          githubId: repository.githubId,
          name: repository.name,
          fullName: repository.fullName,
          owner: repository.owner,
          connectedAt: repository.connectedAt,
        },
        initialSync: {
          id: sync.id,
          status: sync.status,
          startedAt: sync.startedAt,
        },
      });
    } catch (err: unknown) {
      // Handle Prisma unique constraint violation (race condition fallback)
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        next(
          new AppError({
            code: 'REPO_ALREADY_CONNECTED',
            message:
              'A repository is already connected. Disconnect the current repository before connecting a new one.',
            statusCode: 409,
            retryable: false,
          }),
        );
        return;
      }
      next(err instanceof AppError ? err : internalError('Failed to connect repository'));
    }
  },
);

/**
 * DELETE /api/repos/disconnect
 * Disconnects the current repository for the authenticated user.
 * Preserves historical data (tasks, syncs, evidence) — only removes the repository record.
 * This effectively stops syncing since there's no longer a connected repo.
 */
router.delete('/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;

    const repository = await prisma.repository.findUnique({
      where: { userId: user.id },
    });

    if (!repository) {
      next(notFound('No repository is currently connected'));
      return;
    }

    // Delete the repository record.
    // Historical data (tasks, syncs, evidence) is preserved via the cascade
    // not being set — those records retain their repositoryId reference.
    // In practice we just remove the repository entry so no new syncs are triggered.
    await prisma.repository.delete({
      where: { id: repository.id },
    });

    posthog.capture({
      distinctId: user.id,
      event: 'repository_disconnected',
      properties: {
        repo_name: repository.name,
        repo_full_name: repository.fullName,
        repo_owner: repository.owner,
      },
    });

    res.json({
      message: 'Repository disconnected successfully',
      disconnectedRepo: {
        id: repository.id,
        fullName: repository.fullName,
        disconnectedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to disconnect repository'));
  }
});

/**
 * GET /api/repos/current
 * Returns the currently connected repository info for the authenticated user.
 * Returns 404 if no repository is connected.
 */
router.get('/current', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;

    const repository = await prisma.repository.findUnique({
      where: { userId: user.id },
      include: {
        syncs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!repository) {
      next(notFound('No repository is currently connected'));
      return;
    }

    const lastSync = repository.syncs[0] || null;

    res.json({
      repository: {
        id: repository.id,
        githubId: repository.githubId,
        name: repository.name,
        fullName: repository.fullName,
        owner: repository.owner,
        connectedAt: repository.connectedAt,
        lastSync: lastSync
          ? {
              id: lastSync.id,
              status: lastSync.status,
              startedAt: lastSync.startedAt,
              completedAt: lastSync.completedAt,
            }
          : null,
      },
    });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch connected repository'));
  }
});

export default router;

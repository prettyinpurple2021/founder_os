import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { unauthorized } from '../errors/AppError.js';
import { logAuth } from '../services/logger.js';

const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Middleware that checks session expiration based on `lastActiveAt`.
 *
 * - Skips if the user is not authenticated (no req.user).
 * - Looks up the most recent Session record for the user.
 * - If no session exists or lastActiveAt is older than 24 hours, destroys the
 *   session and throws a 401 with redirect context.
 * - If the session is still active, updates lastActiveAt to now and calls next().
 */
export function sessionExpiration(req: Request, _res: Response, next: NextFunction): void {
  // Skip if user is not authenticated
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    next();
    return;
  }

  const userId = req.user.id;

  prisma.session
    .findFirst({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    })
    .then((session) => {
      if (!session) {
        // No session record in DB — user needs to re-authenticate
        logAuth(userId, 'session_expired', { lastActiveAt: null, expiredAfterHours: 24 });
        return destroySessionAndReject(req, next);
      }

      const now = Date.now();
      const lastActive = session.lastActiveAt.getTime();
      const elapsed = now - lastActive;

      if (elapsed > SESSION_TIMEOUT_MS) {
        // Session expired due to inactivity
        logAuth(userId, 'session_expired', {
          lastActiveAt: session.lastActiveAt.toISOString(),
          expiredAfterHours: 24,
        });
        return destroySessionAndReject(req, next);
      }

      // Session is active — update lastActiveAt
      return prisma.session
        .update({
          where: { id: session.id },
          data: { lastActiveAt: new Date() },
        })
        .then(() => {
          next();
        });
    })
    .catch((err: unknown) => {
      next(err);
    });
}

/**
 * Destroys the Express session and passes an unauthorized error to next().
 */
function destroySessionAndReject(req: Request, next: NextFunction): void {
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    next(
      unauthorized('Session expired', {
        reason: 'session_expired',
        redirectTo: '/login',
      }),
    );
  });
}

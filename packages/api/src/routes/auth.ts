import { Router, Request, Response, NextFunction } from 'express';
import passport from '../auth/passport.js';
import prisma from '../lib/prisma.js';
import { AppError } from '../errors/AppError.js';
import { logAuth } from '../services/logger.js';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * OAuth error code mapping — translates Passport/GitHub error types
 * to descriptive, user-facing error codes and messages.
 */
const OAUTH_ERROR_MAP: Record<string, { code: string; message: string }> = {
  access_denied: {
    code: 'OAUTH_ACCESS_DENIED',
    message: 'GitHub access was denied. Please authorize the application and try again.',
  },
  temporarily_unavailable: {
    code: 'OAUTH_PROVIDER_UNAVAILABLE',
    message: 'GitHub is temporarily unavailable. Please try again in a few minutes.',
  },
  server_error: {
    code: 'OAUTH_PROVIDER_ERROR',
    message: 'GitHub encountered an error processing the request. Please try again.',
  },
};

const DEFAULT_OAUTH_ERROR = {
  code: 'OAUTH_FAILED',
  message: 'GitHub authentication failed. Please try again.',
};

/**
 * GET /auth/github
 * Initiates the GitHub OAuth flow.
 * Requests 'repo' and 'user:email' scopes to access repositories and email.
 */
router.get(
  '/auth/github',
  passport.authenticate('github', { scope: ['repo', 'user:email'] })
);

/**
 * GET /auth/github/callback
 * Handles the OAuth callback from GitHub.
 * On success, redirects to the frontend dashboard.
 * On failure, redirects to the frontend with a descriptive error and allows retry.
 *
 * Uses a custom callback to capture the specific failure reason from Passport/GitHub
 * and encode it as query parameters for the frontend to display.
 */
router.get('/auth/github/callback', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('github', (err: Error | null, user: Express.User | false, info: { message?: string } | undefined) => {
    // Case 1: An error occurred during the OAuth exchange (network issue, invalid token, etc.)
    if (err) {
      const errorCode = DEFAULT_OAUTH_ERROR.code;
      const errorMessage = err.message || DEFAULT_OAUTH_ERROR.message;
      const encodedMessage = encodeURIComponent(errorMessage);
      logAuth(undefined, 'login_failed', { provider: 'github', error: errorMessage, code: errorCode });
      res.redirect(`${FRONTEND_URL}/login?error=${errorCode}&message=${encodedMessage}&retryable=true`);
      return;
    }

    // Case 2: Authentication failed (user denied access, invalid credentials, etc.)
    if (!user) {
      const infoMessage = info?.message || '';
      const mapped = OAUTH_ERROR_MAP[infoMessage] || DEFAULT_OAUTH_ERROR;
      const encodedMessage = encodeURIComponent(mapped.message);
      logAuth(undefined, 'login_failed', { provider: 'github', error: mapped.message, code: mapped.code });
      res.redirect(`${FRONTEND_URL}/login?error=${mapped.code}&message=${encodedMessage}&retryable=true`);
      return;
    }

    // Case 3: Success — log the user in and redirect to dashboard
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        const encodedMessage = encodeURIComponent('Failed to establish session. Please try again.');
        res.redirect(`${FRONTEND_URL}/login?error=SESSION_INIT_FAILED&message=${encodedMessage}&retryable=true`);
        return;
      }
      // Fire-and-forget auth login log
      const authUser = user as { id: string; username?: string };
      logAuth(authUser.id, 'login', { provider: 'github', username: authUser.username });
      res.redirect(`${FRONTEND_URL}/dashboard`);
    });
  })(req, res, next);
});

/**
 * GET /auth/session
 * Returns the current session validity and user info.
 * If the user is authenticated (session already validated by middleware),
 * returns session details. Otherwise returns { valid: false }.
 */
router.get('/auth/session', async (req: Request, res: Response) => {
  // If the user is not authenticated, return valid: false
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.json({ valid: false });
    return;
  }

  try {
    // Look up the session record to get expiration info
    const session = await prisma.session.findFirst({
      where: { userId: req.user.id },
      orderBy: { lastActiveAt: 'desc' },
    });

    if (!session) {
      res.json({ valid: false });
      return;
    }

    res.json({
      valid: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
      },
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch {
    res.json({ valid: false });
  }
});

/**
 * POST /auth/logout
 * Destroys the current user session and clears the session cookie.
 * Idempotent — returns success even if no active session exists.
 */
router.post('/auth/logout', (req: Request, res: Response) => {
  const userId = req.user?.id ?? null;

  // If no user/session, still return success (idempotent)
  if (!req.user) {
    // Clear cookie regardless and return success
    res.clearCookie('solo.sid', { path: '/' });
    logAuth(userId ?? undefined, 'logout', { reason: 'user_initiated' });
    res.json({ message: 'Logged out successfully' });
    return;
  }

  req.logout((logoutErr) => {
    if (logoutErr) {
      console.error('[auth] Logout error:', logoutErr);
      res.status(500).json({ error: { code: 'LOGOUT_FAILED', message: 'Failed to log out' } });
      return;
    }

    req.session.destroy((destroyErr) => {
      // Clear the session cookie regardless of destroy outcome
      res.clearCookie('solo.sid', { path: '/' });

      if (destroyErr) {
        console.error('[auth] Session destroy error:', destroyErr);
        // Still return success since logout itself succeeded
      }

      // Fire-and-forget auth logout log
      logAuth(userId ?? undefined, 'logout', { reason: 'user_initiated' });

      res.json({ message: 'Logged out successfully' });
    });
  });
});

export default router;

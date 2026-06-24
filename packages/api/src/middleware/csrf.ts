/**
 * CSRF protection middleware using the synchronizer token pattern.
 *
 * Generates a random token per session and stores it server-side.
 * The token is returned to the client in the X-CSRF-Token response header
 * on every GET request so the SPA can read it.
 * State-mutating requests (POST/PUT/DELETE/PATCH) must include the token
 * in the X-CSRF-Token request header; requests with a mismatched or missing
 * token are rejected with 403.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed without a token.
 * Unauthenticated requests with no active session are allowed to pass
 * through (auth endpoints handle their own protection via OAuth state params).
 */

import { randomBytes } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

// Augment express-session SessionData to include the CSRF token field.
declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
  }
}

const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Express middleware that enforces CSRF token validation on state-mutating requests.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Ensure a CSRF token exists in the session.
  // req.session is populated by express-session before this middleware runs.
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString('hex');
  }

  // Always expose the current token so the SPA can cache it.
  if (req.session?.csrfToken) {
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
  }

  // Safe methods do not mutate state — no validation needed.
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // No session yet (unauthenticated first-touch like OAuth callback) — let it through;
  // the OAuth state parameter provides equivalent protection for those endpoints.
  if (!req.session?.csrfToken) {
    next();
    return;
  }

  // Validate the token supplied by the client.
  const providedToken = req.headers[CSRF_HEADER];
  if (!providedToken || typeof providedToken !== 'string') {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Missing CSRF token', retryable: false },
    });
    return;
  }

  if (providedToken !== req.session.csrfToken) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Invalid CSRF token', retryable: false },
    });
    return;
  }

  next();
}

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
  // Public endpoints that intentionally cannot attach custom headers (e.g. sendBeacon)
  // should bypass CSRF enforcement.
  if (req.path.startsWith('/api/errors')) {
    next();
    return;
  }

  // Safe methods do not mutate state — no validation needed.
  if (SAFE_METHODS.has(req.method)) {
    // Mint a token on safe requests so the SPA can cache it before making mutating calls.
    if (req.session && !req.session.csrfToken) {
      req.session.csrfToken = randomBytes(32).toString('hex');
    }

    if (req.session?.csrfToken) {
      res.setHeader('X-CSRF-Token', req.session.csrfToken);
    }

    next();
    return;
  }

  // Ensure an existing session has a CSRF token.
  // For brand-new (unauthenticated) sessions, allow through without enforcing CSRF.
  if (req.session && !req.session.csrfToken) {
    if (req.session.isNew) {
      next();
      return;
    }
    req.session.csrfToken = randomBytes(32).toString('hex');
  }

  if (req.session?.csrfToken) {
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
  }

  // No session yet (unauthenticated first-touch) — let it through.
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

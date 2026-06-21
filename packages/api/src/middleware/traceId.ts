// Requirements: 10.7
// Request tracing middleware. Assigns a unique trace ID (UUID) to each incoming
// request, making it available for structured logging, error tracking, and
// end-to-end request correlation.

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Augment Express Request to include the traceId property.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      traceId: string;
    }
  }
}

/**
 * Middleware that ensures every request carries a trace ID.
 *
 * Behavior:
 * 1. Checks for an existing `x-trace-id` header (set by upstream proxy/load balancer).
 * 2. If absent, generates a new UUID v4.
 * 3. Attaches the trace ID to `req.traceId` for downstream middleware and route handlers.
 * 4. Sets the `x-trace-id` response header so clients can reference it.
 *
 * The trace ID is available for any error tracking integration (e.g., CloudWatch,
 * Sentry, or other APM tools) via `req.traceId`.
 */
export function traceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingTraceId = req.headers['x-trace-id'];
  const traceId =
    typeof existingTraceId === 'string' && existingTraceId.length > 0
      ? existingTraceId
      : randomUUID();

  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);

  next();
}

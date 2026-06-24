/**
 * Frontend Error Reporting Route
 *
 * POST /api/errors - Receives frontend error reports and logs them as
 * structured JSON to stdout (picked up by CloudWatch via ECS log driver).
 *
 * This endpoint does NOT require authentication — errors can happen for
 * unauthenticated users. Rate limiting and payload size limits are applied
 * to prevent abuse.
 *
 * Requirements: 6.7
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { badRequest } from '../errors/AppError.js';

const router = Router();

/** Rate limiter specific to error reporting: 30 reports per minute per IP */
const errorReportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many error reports, please try again later',
        retryable: true,
      },
    });
  },
});

/** Maximum allowed payload size in bytes (16KB) */
const MAX_PAYLOAD_SIZE = 16 * 1024;

interface FrontendErrorPayload {
  message: string;
  stack: string | null;
  source: string | null;
  line: number | null;
  column: number | null;
  userAgent: string;
  url: string;
  timestamp: string;
}

/**
 * Basic shape validation for the error report payload.
 * Returns true if the payload has the expected structure.
 */
function isValidPayload(body: unknown): body is FrontendErrorPayload {
  if (typeof body !== 'object' || body === null) {
    return false;
  }

  const obj = body as Record<string, unknown>;

  return (
    typeof obj.message === 'string' &&
    obj.message.length > 0 &&
    (obj.stack === null || typeof obj.stack === 'string') &&
    (obj.source === null || typeof obj.source === 'string') &&
    (obj.line === null || typeof obj.line === 'number') &&
    (obj.column === null || typeof obj.column === 'number') &&
    typeof obj.userAgent === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.timestamp === 'string'
  );
}

/**
 * POST /api/errors
 *
 * Receives a frontend error report, validates the payload,
 * and writes a structured JSON log entry to stdout for CloudWatch.
 * Returns 204 No Content on success.
 */
router.post('/', errorReportLimiter, (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check payload size (Content-Length header)
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_PAYLOAD_SIZE) {
      throw badRequest('Payload too large');
    }

    const body: unknown = req.body;

    if (!isValidPayload(body)) {
      throw badRequest('Invalid error report payload');
    }

    // Truncate stack trace if excessively long
    const stack = body.stack ? body.stack.slice(0, 4096) : null;

    // Sanitize user-controlled string fields: strip newlines and control characters
    // to prevent log injection attacks when entries are parsed line-by-line.
    // Handles null/undefined inputs by coercing to empty string first.
    const sanitize = (s: string | null | undefined, maxLen: number): string =>
      (s ?? '').replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ').slice(0, maxLen);

    // Write structured JSON log to stdout (CloudWatch picks this up)
    const structuredLog = {
      level: 'error',
      source: 'frontend',
      timestamp: sanitize(body.timestamp, 64),
      message: sanitize(body.message, 1024),
      stack: stack ? sanitize(stack, 4096) : null,
      errorSource: body.source ? sanitize(body.source, 512) : null,
      line: body.line,
      column: body.column,
      userAgent: sanitize(body.userAgent, 512),
      pageUrl: sanitize(body.url, 2048),
      environment: process.env.NODE_ENV || 'development',
      ip: req.ip || req.socket.remoteAddress || 'unknown',
    };

    // Write as single-line JSON for CloudWatch Logs parsing
    process.stdout.write(JSON.stringify(structuredLog) + '\n');

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;

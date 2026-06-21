// Requirements: 6.1, 6.2, 6.3
// Structured error logging middleware for CloudWatch integration.
// Captures unhandled exceptions and rejected promises, writes structured JSON
// error logs to stdout (picked up by CloudWatch via ECS awslogs driver).
// Strips sensitive data before logging.

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Fields that must be stripped from request bodies before logging.
 */
const SENSITIVE_BODY_FIELDS = new Set(['password', 'secret', 'token']);

/**
 * Headers that must never appear in log output.
 */
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie']);

export interface StructuredErrorLog {
  level: 'error';
  timestamp: string;
  traceId: string;
  environment: string;
  message: string;
  stack: string | undefined;
  request: {
    method: string;
    path: string;
    userId: string | undefined;
  };
}

/**
 * Strips sensitive fields from request body recursively (shallow-clone top level only).
 * Returns a sanitized copy — never mutates the original.
 */
function sanitizeBody(body: unknown): unknown {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_BODY_FIELDS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Strips sensitive headers from the request. Returns a sanitized copy.
 */
function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Builds a structured JSON error log entry.
 */
function buildErrorLogEntry(
  err: Error,
  req: Request,
  traceId: string,
): StructuredErrorLog {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  const environment = process.env.NODE_ENV || 'development';

  return {
    level: 'error',
    timestamp: new Date().toISOString(),
    traceId,
    environment,
    message: err.message || 'Unknown error',
    stack: err.stack,
    request: {
      method: req.method,
      path: req.originalUrl || req.path,
      userId: userId || undefined,
    },
  };
}

/**
 * Express error-handling middleware that logs structured JSON errors to stdout.
 * Should be placed BEFORE the existing errorHandler middleware so it logs first,
 * then passes control to the response-formatting handler.
 *
 * Log output is written to process.stdout as a single JSON line, which the
 * ECS awslogs driver forwards to CloudWatch Logs.
 */
export function errorLogger(
  err: Error,
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Generate or reuse trace ID from request
  const traceId =
    (req.headers['x-trace-id'] as string) || (req as Request & { traceId?: string }).traceId || randomUUID();

  const logEntry = buildErrorLogEntry(err, req, traceId);

  // Write structured JSON to stdout as a single line (CloudWatch-compatible)
  process.stdout.write(JSON.stringify(logEntry) + '\n');

  // Pass to next error handler (the existing errorHandler that sends the HTTP response)
  next(err);
}

/**
 * Registers process-level handlers for uncaught exceptions and unhandled
 * promise rejections. These write structured JSON in the same format as the
 * middleware, ensuring CloudWatch captures fatal errors too.
 *
 * Call once at application startup.
 */
export function registerProcessErrorHandlers(): void {
  process.on('uncaughtException', (err: Error) => {
    const logEntry: Omit<StructuredErrorLog, 'request'> & { request: null } = {
      level: 'error',
      timestamp: new Date().toISOString(),
      traceId: randomUUID(),
      environment: process.env.NODE_ENV || 'development',
      message: `Uncaught Exception: ${err.message}`,
      stack: err.stack,
      request: null,
    };

    process.stdout.write(JSON.stringify(logEntry) + '\n');

    // Give the log time to flush, then exit
    setTimeout(() => process.exit(1), 100);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));

    const logEntry: Omit<StructuredErrorLog, 'request'> & { request: null } = {
      level: 'error',
      timestamp: new Date().toISOString(),
      traceId: randomUUID(),
      environment: process.env.NODE_ENV || 'development',
      message: `Unhandled Rejection: ${err.message}`,
      stack: err.stack,
      request: null,
    };

    process.stdout.write(JSON.stringify(logEntry) + '\n');
  });
}

// Exported for testing
export { sanitizeBody, sanitizeHeaders };

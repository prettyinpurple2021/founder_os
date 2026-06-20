import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';
import { logError } from '../services/logger.js';
import { createNotification, buildResponseNotification } from '../services/notification.js';

/**
 * Centralized error-handling middleware.
 * Must be registered LAST in the Express middleware chain.
 *
 * Handles:
 * - AppError instances: returns their structured fields directly
 * - Prisma known request errors (P2002 unique constraint, P2025 not found)
 * - JSON SyntaxError from body parsing
 * - Unknown errors: returns a generic 500 with retryable: true
 *
 * Response format (consistent for ALL errors):
 * {
 *   error: {
 *     code: string,        // Machine-readable error code
 *     message: string,     // Human-readable description
 *     retryable: boolean,  // Whether the client should retry
 *     context?: object     // Additional debugging context (non-sensitive)
 *   }
 * }
 *
 * In production, stack traces are omitted from the context field.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Log the error to console
  console.error('[error]', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    ...(err instanceof AppError && { code: err.code, statusCode: err.statusCode }),
  });

  // Determine status code for logging
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  // Extract user ID for logging and notifications
  const userId = (req as Request & { user?: { id?: string } }).user?.id;

  // Fire-and-forget structured error logging (skip 404s to avoid noise)
  if (statusCode !== 404) {
    if (err instanceof AppError) {
      // Known application errors — log with error code and status
      logError(userId, 'app_error', {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
      });
    } else {
      // Unexpected/unhandled errors — log with full stack trace
      logError(userId, 'unhandled_error', {
        message: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
        path: req.path,
        method: req.method,
      });
    }
  }

  // --- AppError: known, structured errors ---
  if (err instanceof AppError) {
    const context =
      process.env.NODE_ENV === 'production' ? err.context : { ...err.context, stack: err.stack };

    // For session expiration / invalid session errors, clear the session cookie
    if (err.statusCode === 401 && err.context?.redirectTo) {
      res.clearCookie('solo.sid', { path: '/' });
    }

    // For server errors (5xx), include a user notification in the response
    // and store it for in-app retrieval (Requirement 11.3)
    let notification: ReturnType<typeof buildResponseNotification> | undefined;
    if (err.statusCode >= 500) {
      const operation =
        (err.context?.operationName as string) ||
        req.path.replace(/^\/api\//, '').replace(/\//g, '_');
      const actionHint = err.retryable
        ? 'You can retry this operation. If the problem persists, try again later.'
        : 'Please contact support if this problem continues.';

      notification = buildResponseNotification(operation, err.message, err.retryable, actionHint);

      // Persist as in-app notification if we have a user (fire-and-forget)
      if (userId) {
        createNotification({
          userId,
          operation,
          title: notification.title,
          message: err.message,
          severity: 'error',
          retryable: err.retryable,
          actionHint,
        }).catch(() => {}); // Never block the response
      }
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        ...(context && Object.keys(context).length > 0 && { context }),
      },
      ...(notification && { notification }),
    });
    return;
  }

  // --- Prisma known request errors ---
  if (isPrismaKnownError(err)) {
    const { statusCode, code, message } = mapPrismaError(err);
    const context =
      process.env.NODE_ENV === 'production'
        ? undefined
        : { prismaCode: (err as PrismaKnownRequestError).code, stack: err.stack };

    res.status(statusCode).json({
      error: {
        code,
        message,
        retryable: false,
        ...(context && { context }),
      },
    });
    return;
  }

  // --- JSON SyntaxError (malformed request body) ---
  if (err instanceof SyntaxError && 'body' in err) {
    const context = process.env.NODE_ENV === 'production' ? undefined : { stack: err.stack };

    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
        retryable: false,
        ...(context && { context }),
      },
    });
    return;
  }

  // --- Unknown/unhandled error — generic 500 ---
  const context = process.env.NODE_ENV === 'production' ? undefined : { stack: err.stack };

  // Include a user notification for unknown server errors (Requirement 11.3)
  const operation = req.path.replace(/^\/api\//, '').replace(/\//g, '_');
  const unknownNotification = buildResponseNotification(
    operation,
    'An unexpected error occurred. The operation did not complete.',
    true,
    'You can retry this operation. If the problem persists, try again later.',
  );

  // Persist as in-app notification if we have a user (fire-and-forget)
  if (userId) {
    createNotification({
      userId,
      operation,
      title: unknownNotification.title,
      message: unknownNotification.message,
      severity: 'error',
      retryable: true,
      actionHint: unknownNotification.actionHint,
    }).catch(() => {}); // Never block the response
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      retryable: true,
      ...(context && { context }),
    },
    notification: unknownNotification,
  });
}

// --- Prisma error helpers ---

interface PrismaKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
}

function isPrismaKnownError(err: Error): boolean {
  return err.constructor?.name === 'PrismaClientKnownRequestError' && 'code' in err;
}

function mapPrismaError(err: Error): { statusCode: number; code: string; message: string } {
  const prismaErr = err as PrismaKnownRequestError;

  switch (prismaErr.code) {
    case 'P2002':
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'A resource with that identifier already exists',
      };
    case 'P2025':
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      };
    default:
      return {
        statusCode: 500,
        code: 'DATABASE_ERROR',
        message: 'A database error occurred',
      };
  }
}

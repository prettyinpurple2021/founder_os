import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';

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
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error (structured logging will replace this later)
  console.error('[error]', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    ...(err instanceof AppError && { code: err.code, statusCode: err.statusCode }),
  });

  // --- AppError: known, structured errors ---
  if (err instanceof AppError) {
    const context =
      process.env.NODE_ENV === 'production'
        ? err.context
        : { ...err.context, stack: err.stack };

    // For session expiration / invalid session errors, clear the session cookie
    if (err.statusCode === 401 && err.context?.redirectTo) {
      res.clearCookie('solo.sid', { path: '/' });
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        ...(context && Object.keys(context).length > 0 && { context }),
      },
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
    const context =
      process.env.NODE_ENV === 'production'
        ? undefined
        : { stack: err.stack };

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
  const context =
    process.env.NODE_ENV === 'production'
      ? undefined
      : { stack: err.stack };

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      retryable: true,
      ...(context && { context }),
    },
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

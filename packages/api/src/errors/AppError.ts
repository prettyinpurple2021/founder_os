/**
 * Custom application error class with structured error information.
 * Used throughout the API to provide consistent error responses.
 *
 * All API errors follow the format:
 * {
 *   error: {
 *     code: string,        // Machine-readable error code
 *     message: string,     // Human-readable description
 *     retryable: boolean,  // Whether the client should retry
 *     context?: object     // Additional debugging context (non-sensitive)
 *   }
 * }
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(options: {
    code: string;
    message: string;
    statusCode: number;
    retryable: boolean;
    context?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable;
    this.context = options.context;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// --- Error Factory Helpers ---

export function notFound(message = 'Resource not found', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message,
    statusCode: 404,
    retryable: false,
    context,
  });
}

export function badRequest(message = 'Bad request', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'BAD_REQUEST',
    message,
    statusCode: 400,
    retryable: false,
    context,
  });
}

export function validationError(message = 'Validation failed', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'VALIDATION_ERROR',
    message,
    statusCode: 422,
    retryable: false,
    context,
  });
}

export function unauthorized(message = 'Unauthorized', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'UNAUTHORIZED',
    message,
    statusCode: 401,
    retryable: false,
    context,
  });
}

export function forbidden(message = 'Forbidden', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'FORBIDDEN',
    message,
    statusCode: 403,
    retryable: false,
    context,
  });
}

export function conflict(message = 'Resource conflict', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'CONFLICT',
    message,
    statusCode: 409,
    retryable: false,
    context,
  });
}

export function rateLimitExceeded(message = 'Rate limit exceeded', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'RATE_LIMIT_EXCEEDED',
    message,
    statusCode: 429,
    retryable: true,
    context,
  });
}

export function internalError(message = 'Internal server error', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'INTERNAL_ERROR',
    message,
    statusCode: 500,
    retryable: true,
    context,
  });
}

export function serviceUnavailable(message = 'Service unavailable', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'SERVICE_UNAVAILABLE',
    message,
    statusCode: 503,
    retryable: true,
    context,
  });
}

export function authenticationError(message = 'Authentication failed', context?: Record<string, unknown>): AppError {
  return new AppError({
    code: 'AUTH_FAILED',
    message,
    statusCode: 401,
    retryable: true,
    context: { redirectTo: '/login', ...context },
  });
}

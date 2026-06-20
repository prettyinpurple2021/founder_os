// Requirements: 9.1
// Rate limiting middleware to protect API routes from abuse.

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { rateLimitExceeded } from '../errors/AppError.js';

/**
 * Standard rate limit error response handler.
 * Uses the AppError format for consistency with the rest of the API.
 */
function rateLimitHandler(_req: Request, res: Response): void {
  const error = rateLimitExceeded('Too many requests, please try again later');
  res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
  });
}

/**
 * General API rate limiter.
 * 100 requests per 15 minutes per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Auth routes rate limiter (more restrictive).
 * 10 requests per 15 minutes per IP to prevent brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Content generation rate limiter.
 * 20 requests per hour per IP to prevent LLM abuse.
 */
export const contentGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
});

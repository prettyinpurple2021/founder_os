/**
 * Zod validation middleware for Express request bodies, query params, and route params.
 *
 * Requirements: 9.1
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validationError } from '../errors/AppError.js';

type RequestLocation = 'body' | 'query' | 'params';

/**
 * Creates an Express middleware that validates the specified request location
 * against the provided zod schema. On failure, calls next() with a validationError.
 * On success, replaces req[location] with the parsed (typed) data and calls next().
 */
export function validate(schema: z.ZodType, location: RequestLocation = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[location]);

    if (!result.success) {
      const formatted = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      next(
        validationError('Validation failed', {
          errors: formatted,
        })
      );
      return;
    }

    // Replace with parsed data (coerced types, defaults applied)
    if (location === 'body') {
      req.body = result.data;
    } else if (location === 'query') {
      (req as Record<string, unknown>).query = result.data;
    } else {
      req.params = result.data as Record<string, string>;
    }

    next();
  };
}

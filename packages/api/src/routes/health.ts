/**
 * Health Check Route
 *
 * GET /health - Returns service health status including database connectivity.
 * This endpoint is accessible WITHOUT authentication for use by
 * load balancers, orchestrators, and monitoring systems.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AppError, internalError } from '../errors/AppError.js';
import { getHealthStatus } from '../services/health.js';

const router = Router();

/**
 * GET /health
 *
 * Returns HTTP 200 when healthy, HTTP 503 when degraded (DB unreachable).
 * Response shape: { status, timestamp, version, uptime, checks: { database: { status, latencyMs } } }
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Health check failed'));
  }
});

export default router;

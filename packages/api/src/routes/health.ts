/**
 * Health Check Routes
 *
 * GET /health      - Returns service health status including database connectivity.
 *                    Returns HTTP 200 when healthy, HTTP 503 when degraded (DB unreachable).
 *                    Used by the ALB health check to gate traffic routing.
 *
 * GET /health/live - Liveness probe: returns HTTP 200 as long as the server process
 *                    is running, regardless of database connectivity.
 *                    Used by the ECS container health check to determine whether to
 *                    restart the container — prevents spurious circuit-breaker rollbacks
 *                    caused by transient database unavailability at startup.
 *
 * Both endpoints are accessible WITHOUT authentication for use by
 * load balancers, orchestrators, and monitoring systems.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AppError, internalError } from '../errors/AppError.js';
import { getHealthStatus } from '../services/health.js';

const router = Router();

/**
 * GET /health/live
 *
 * Liveness probe used by the ECS container health check.
 * Returns HTTP 200 as long as the server process is running.
 * Does NOT check database connectivity — the ECS circuit breaker should only
 * fire when the container itself crashes, not when a dependency is temporarily
 * unavailable.
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

/**
 * GET /health
 *
 * Full health check used by the ALB target-group health check.
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

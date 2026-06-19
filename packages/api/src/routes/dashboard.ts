/**
 * Dashboard Routes
 *
 * GET /api/dashboard - Returns aggregated dashboard data for the authenticated user.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AppError, unauthorized, notFound, internalError } from '../errors/AppError.js';
import { getDashboard } from '../services/dashboard.js';

const router = Router();

/**
 * Ensures the user is authenticated before accessing dashboard routes.
 */
function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    next(unauthorized('Authentication required'));
    return;
  }
  next();
}

router.use(requireAuth);

/**
 * GET /api/dashboard
 * Returns the aggregated dashboard for the authenticated user.
 *
 * Response: DashboardResponse | 404 if no repository connected
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const dashboard = await getDashboard(user.id);

    if (!dashboard) {
      next(notFound('No repository is currently connected'));
      return;
    }

    res.json(dashboard);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch dashboard'));
  }
});

export default router;

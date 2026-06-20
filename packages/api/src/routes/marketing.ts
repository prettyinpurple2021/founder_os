import { Router, Request, Response, NextFunction } from 'express';
import { AppError, unauthorized, badRequest, internalError } from '../errors/AppError.js';
import {
  getMarketingStatus,
  markAssetComplete,
  markAssetUncomplete,
  getRecommendedAssetIds,
  type MarketingAssetType,
} from '../services/marketing.js';

const router = Router();

/**
 * Ensures the user is authenticated before accessing marketing routes.
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
 * GET /api/marketing/status
 * Returns the marketing readiness status for the authenticated user.
 * Compares completed marketing assets against the recommended set.
 *
 * Response:
 *   recommended: array of all recommended assets
 *   completed: array of completed asset type IDs
 *   missing: array of missing asset type IDs
 *   readinessPercentage: percentage of recommended assets completed
 *
 * Requirements: 5.1
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const status = await getMarketingStatus(user.id);

    res.json(status);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch marketing status'));
  }
});

/**
 * POST /api/marketing/assets/:id/complete
 * Marks a marketing asset as completed for the authenticated user.
 * The :id parameter is the asset TYPE identifier (e.g., 'landing-page-copy'),
 * NOT the database UUID.
 *
 * Uses upsert pattern: if no record exists for user+type, creates one;
 * if already completed, returns it unchanged (idempotent).
 *
 * Response:
 *   { asset: { id, type, status, completedAt } }
 *
 * Requirements: 5.5
 */
router.post('/assets/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const assetType = req.params.id;

    // Validate the asset type is from the recommended set
    const recommendedIds = getRecommendedAssetIds();
    if (!recommendedIds.has(assetType as MarketingAssetType)) {
      next(
        badRequest(
          `Invalid asset type: '${assetType}'. Must be one of: ${[...recommendedIds].join(', ')}`,
        ),
      );
      return;
    }

    const asset = await markAssetComplete(user.id, assetType);

    res.json({ asset });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to mark asset as complete'));
  }
});

/**
 * POST /api/marketing/assets/:id/uncomplete
 * Marks a marketing asset as not completed for the authenticated user.
 * Resets status to 'missing' and clears completedAt.
 *
 * The :id parameter is the asset TYPE identifier (e.g., 'landing-page-copy'),
 * NOT the database UUID.
 *
 * Response:
 *   { asset: { id, type, status, completedAt } }
 *
 * Requirements: 5.5
 */
router.post('/assets/:id/uncomplete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const assetType = req.params.id;

    // Validate the asset type is from the recommended set
    const recommendedIds = getRecommendedAssetIds();
    if (!recommendedIds.has(assetType as MarketingAssetType)) {
      next(
        badRequest(
          `Invalid asset type: '${assetType}'. Must be one of: ${[...recommendedIds].join(', ')}`,
        ),
      );
      return;
    }

    const asset = await markAssetUncomplete(user.id, assetType);

    res.json({ asset });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to mark asset as uncomplete'));
  }
});

export default router;

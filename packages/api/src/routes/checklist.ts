import { Router, Request, Response, NextFunction } from 'express';
import { AppError, unauthorized, badRequest, notFound, internalError } from '../errors/AppError.js';
import { getChecklist, ChecklistItemStatus } from '../services/checklist.js';

const router = Router();

/**
 * Valid checklist item status values for manual override.
 */
const VALID_STATUSES: ChecklistItemStatus[] = ['complete', 'in_progress', 'blocked', 'incomplete'];

/**
 * Ensures the user is authenticated before accessing checklist routes.
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
 * GET /api/checklist
 * Returns the launch readiness checklist for the authenticated user.
 * The checklist is generated fresh on each request from current task states.
 *
 * Response: ChecklistResponse | 404 if no repository connected
 *
 * Requirements: 4.1, 4.2
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const checklist = await getChecklist(user.id);

    if (!checklist) {
      next(notFound('No repository is currently connected'));
      return;
    }

    res.json(checklist);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch checklist'));
  }
});

/**
 * PUT /api/checklist/items/:id
 * Allows manual override of a checklist item status.
 *
 * Body: { status: ChecklistItemStatus }
 * Response: { id: string, status: ChecklistItemStatus }
 *
 * Requirements: 4.1, 4.2
 */
router.put('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      next(badRequest('Status is required'));
      return;
    }

    if (!VALID_STATUSES.includes(status as ChecklistItemStatus)) {
      next(badRequest(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`));
      return;
    }

    // Since the checklist is generated dynamically from task states and not persisted,
    // manual overrides acknowledge the item ID and return the updated status.
    // A future enhancement could persist overrides in the database.
    res.json({ id, status });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to update checklist item'));
  }
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { AppError, unauthorized, notFound, internalError } from '../errors/AppError.js';
import posthog from '../lib/posthog.js';
import { getChecklist } from '../services/checklist.js';
import { validate } from '../middleware/validate.js';
import { updateChecklistItemSchema } from '../validation/schemas.js';

const router = Router();

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
router.put(
  '/items/:id',
  validate(updateChecklistItemSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Since the checklist is generated dynamically from task states and not persisted,
      // manual overrides acknowledge the item ID and return the updated status.
      // A future enhancement could persist overrides in the database.
      posthog.capture({
        distinctId: req.user!.id,
        event: 'checklist_item_updated',
        properties: { item_id: id, new_status: status },
      });

      res.json({ id, status });
    } catch (err) {
      next(err instanceof AppError ? err : internalError('Failed to update checklist item'));
    }
  },
);

export default router;

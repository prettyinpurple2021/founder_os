import { Router, Request, Response, NextFunction } from 'express';
import { AppError, unauthorized, internalError } from '../errors/AppError.js';
import {
  generateDraft,
  editDraft,
  getDraftVersions,
  approveDraft,
  rejectDraft,
  scheduleDraft,
  submitForReview,
  type ContentPlatform,
} from '../services/content.js';
import { validate } from '../middleware/validate.js';
import {
  generateContentSchema,
  editDraftSchema,
  rejectDraftSchema,
  scheduleDraftSchema,
} from '../validation/schemas.js';

const router = Router();

/**
 * Ensures the user is authenticated before accessing content routes.
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
 * POST /api/content/generate
 * Generates a build-in-public content draft from recently completed tasks.
 *
 * Request body:
 *   platform: 'TWITTER' | 'LINKEDIN' | 'BLOG' (required)
 *   timeRangeDays?: number (optional, default 7)
 *
 * Response:
 *   The created ContentDraft with initial version
 *
 * Requirements: 6.1, 6.2
 */
router.post(
  '/generate',
  validate(generateContentSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const { platform, timeRangeDays } = req.body;

      const draft = await generateDraft(user.id, platform as ContentPlatform, timeRangeDays);

      res.status(201).json(draft);
    } catch (err) {
      next(err instanceof AppError ? err : internalError('Failed to generate content draft'));
    }
  },
);

/**
 * PUT /api/content/drafts/:id
 * Edits an existing content draft, creating a new DraftVersion on each edit.
 *
 * Request body:
 *   content: string (required, non-empty)
 *
 * Response:
 *   { draft: { id, platform, status, currentContent, updatedAt }, version: { id, version, content, editedAt } }
 *
 * Requirements: 6.3, 6.4
 */
router.put(
  '/drafts/:id',
  validate(editDraftSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const draftId = req.params.id;
      const { content } = req.body;

      const result = await editDraft(user.id, draftId, content);

      res.json(result);
    } catch (err) {
      next(err instanceof AppError ? err : internalError('Failed to edit draft'));
    }
  },
);

/**
 * GET /api/content/drafts/:id/versions
 * Returns the version history for a specific content draft.
 *
 * Requires authentication. The draft must belong to the authenticated user.
 *
 * Response:
 *   draft: { id, platform, status, currentContent }
 *   versions: [{ id, version, content, editedAt }]
 *
 * Requirements: 6.4
 */
router.get('/drafts/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const draftId = req.params.id;

    const result = await getDraftVersions(user.id, draftId);

    res.json(result);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch draft versions'));
  }
});

/**
 * POST /api/content/drafts/:id/submit
 * Submits a content draft for review, transitioning it to PENDING_APPROVAL.
 *
 * Requires authentication. The draft must belong to the authenticated user.
 * Draft must be in GENERATED or EDITING state.
 *
 * Response:
 *   { draft: { id, platform, status, currentContent, updatedAt } }
 *
 * Requirements: 7.1, 6.6
 */
router.post('/drafts/:id/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const draftId = req.params.id;

    const result = await submitForReview(user.id, draftId);

    res.json(result);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to submit draft for review'));
  }
});

/**
 * POST /api/content/drafts/:id/approve
 * Approves a content draft, transitioning it from PENDING_APPROVAL to APPROVED.
 *
 * Requires authentication. The draft must belong to the authenticated user.
 * Draft must be in PENDING_APPROVAL state.
 *
 * Response:
 *   { draft: { id, platform, status, currentContent, updatedAt } }
 *
 * Requirements: 7.1, 7.3
 */
router.post('/drafts/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const draftId = req.params.id;

    const result = await approveDraft(user.id, draftId);

    res.json(result);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to approve draft'));
  }
});

/**
 * POST /api/content/drafts/:id/reject
 * Rejects a content draft, moving it to REJECTED status while preserving content.
 *
 * Requires authentication. The draft must belong to the authenticated user.
 * Draft must be in PENDING_APPROVAL state.
 *
 * Request body (optional):
 *   reason?: string - Reason for rejection
 *
 * Response:
 *   { draft: { id, platform, status, currentContent, updatedAt } }
 *
 * Requirements: 6.5, 7.4
 */
router.post(
  '/drafts/:id/reject',
  validate(rejectDraftSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const draftId = req.params.id;
      const { reason } = req.body;

      const result = await rejectDraft(user.id, draftId, reason);

      res.json(result);
    } catch (err) {
      next(err instanceof AppError ? err : internalError('Failed to reject draft'));
    }
  },
);

/**
 * POST /api/content/drafts/:id/schedule
 * Schedules an approved draft for publishing or marks it as copied for manual posting.
 *
 * Requires authentication. The draft must belong to the authenticated user.
 * Draft must be in APPROVED state.
 *
 * Request body (optional):
 *   scheduledAt?: string (ISO date, must be in the future)
 *
 * If scheduledAt is provided → status becomes SCHEDULED
 * If scheduledAt is not provided → status becomes COPIED (manual posting)
 *
 * Response:
 *   { draft: { id, platform, status, currentContent, scheduledAt, updatedAt } }
 *
 * Requirements: 7.2
 */
router.post(
  '/drafts/:id/schedule',
  validate(scheduleDraftSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const draftId = req.params.id;
      const { scheduledAt } = req.body;

      const result = await scheduleDraft(user.id, draftId, scheduledAt);

      res.json(result);
    } catch (err) {
      next(err instanceof AppError ? err : internalError('Failed to schedule draft'));
    }
  },
);

export default router;

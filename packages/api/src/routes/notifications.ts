/**
 * Notification Routes
 *
 * GET    /api/notifications         — List notifications for the authenticated user
 * POST   /api/notifications/:id/read — Mark a notification as read
 * POST   /api/notifications/read-all — Mark all notifications as read
 *
 * These endpoints allow the frontend to display in-app notifications
 * about failed operations (Requirement 11.3).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getUnreadNotifications, getAllNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notification.js';
import { AppError, unauthorized, internalError } from '../errors/AppError.js';
import { validate } from '../middleware/validate.js';
import { notificationsQuerySchema } from '../validation/schemas.js';

const router = Router();

/**
 * Ensures the user is authenticated before accessing notification routes.
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
 * GET /api/notifications
 * Returns notifications for the authenticated user.
 * Query params:
 *   - unreadOnly (boolean, default: true) — only return unread notifications
 *   - limit (number, default: 20, max: 100) — max notifications to return
 */
router.get('/', validate(notificationsQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { unreadOnly, limit } = req.query as unknown as { unreadOnly: boolean; limit: number };

    const notifications = unreadOnly
      ? await getUnreadNotifications(user.id, limit)
      : await getAllNotifications(user.id, limit);

    res.status(200).json({
      notifications,
      unreadCount: unreadOnly ? notifications.length : notifications.filter(n => !n.read).length,
    });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to fetch notifications'));
  }
});

/**
 * POST /api/notifications/:id/read
 * Marks a single notification as read/dismissed.
 */
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const updated = await markNotificationRead(id, user.id);

    if (!updated) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Notification not found',
          retryable: false,
        },
      });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to mark notification as read'));
  }
});

/**
 * POST /api/notifications/read-all
 * Marks all notifications as read for the authenticated user.
 */
router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const count = await markAllNotificationsRead(user.id);

    res.status(200).json({ success: true, markedRead: count });
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Failed to mark notifications as read'));
  }
});

export default router;

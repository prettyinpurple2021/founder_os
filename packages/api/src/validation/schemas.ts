/**
 * Zod validation schemas for all API request bodies and query parameters.
 *
 * Requirements: 9.1
 */
import { z } from 'zod';

// --- POST /api/repos/connect ---
export const connectRepoSchema = z.object({
  githubId: z.number({ message: 'githubId must be a number' }),
  name: z.string().min(1, 'name is required'),
  fullName: z.string().min(1, 'fullName is required'),
  owner: z.string().min(1, 'owner is required'),
});

// --- POST /api/content/generate ---
export const generateContentSchema = z.object({
  platform: z.enum(['TWITTER', 'LINKEDIN', 'BLOG'], {
    message: 'platform must be one of: TWITTER, LINKEDIN, BLOG',
  }),
  timeRangeDays: z
    .number()
    .int('timeRangeDays must be a positive integer')
    .positive('timeRangeDays must be a positive integer')
    .optional(),
});

// --- PUT /api/content/drafts/:id ---
export const editDraftSchema = z.object({
  content: z
    .string({ message: 'content is required and must be a non-empty string' })
    .min(1, 'content is required and must be a non-empty string'),
});

// --- POST /api/content/drafts/:id/reject ---
export const rejectDraftSchema = z.object({
  reason: z.string().optional(),
});

// --- POST /api/content/drafts/:id/schedule ---
export const scheduleDraftSchema = z.object({
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be a valid ISO date string' })
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: 'scheduledAt must be in the future',
    })
    .optional(),
});

// --- PUT /api/checklist/items/:id ---
export const updateChecklistItemSchema = z.object({
  status: z.enum(['complete', 'in_progress', 'blocked', 'incomplete'], {
    message: 'status must be one of: complete, in_progress, blocked, incomplete',
  }),
});

// --- GET /api/tasks (query) ---
// Coerces and clamps values to valid ranges (preserves existing behavior)
export const tasksQuerySchema = z.object({
  state: z
    .enum(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'NEEDS_REVIEW', 'COMPLETED', 'UNCERTAIN'], {
      message:
        'Invalid state filter. Must be one of: NOT_STARTED, IN_PROGRESS, BLOCKED, NEEDS_REVIEW, COMPLETED, UNCERTAIN',
    })
    .optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val ?? '', 10);
      if (isNaN(parsed)) return 50;
      return Math.min(Math.max(parsed, 1), 100);
    }),
  offset: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val ?? '', 10);
      if (isNaN(parsed)) return 0;
      return Math.max(parsed, 0);
    }),
});

// --- GET /api/sync/history (query) ---
// Coerces and clamps values to valid ranges (preserves existing behavior)
export const syncHistoryQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val ?? '', 10);
      if (isNaN(parsed)) return 20;
      return Math.min(Math.max(parsed, 1), 100);
    }),
  offset: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val ?? '', 10);
      if (isNaN(parsed)) return 0;
      return Math.max(parsed, 0);
    }),
});

// --- GET /api/notifications (query) ---
// Coerces and clamps values to valid ranges (preserves existing behavior)
export const notificationsQuerySchema = z.object({
  unreadOnly: z
    .string()
    .optional()
    .transform((val) => val !== 'false'),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = parseInt(val ?? '', 10);
      if (isNaN(parsed)) return 20;
      return Math.min(Math.max(parsed, 1), 100);
    }),
});

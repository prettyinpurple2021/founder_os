/**
 * Unit tests for POST /api/content/drafts/:id/schedule endpoint (scheduleDraft service).
 *
 * Validates: Requirements 7.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../lib/prisma.js', () => ({
  default: {
    contentDraft: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    systemLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../services/logger.js', () => ({
  logContent: vi.fn().mockResolvedValue(undefined),
}));

import prisma from '../lib/prisma.js';
import { scheduleDraft } from '../services/content.js';
import { AppError } from '../errors/AppError.js';

describe('scheduleDraft', () => {
  const userId = 'user-123';
  const draftId = 'draft-456';
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // tomorrow

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully schedules a draft with a future date → status SCHEDULED', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'APPROVED',
      currentContent: 'Approved content ready to post',
      scheduledAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      status: 'SCHEDULED',
      scheduledAt: new Date(futureDate),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.contentDraft.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDraft);
    (prisma.systemLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await scheduleDraft(userId, draftId, futureDate);

    expect(result.draft.id).toBe(draftId);
    expect(result.draft.status).toBe('SCHEDULED');
    expect(result.draft.scheduledAt).toEqual(new Date(futureDate));
    expect(result.draft.currentContent).toBe('Approved content ready to post');

    // Verify draft was updated with SCHEDULED status
    expect(prisma.contentDraft.update).toHaveBeenCalledWith({
      where: { id: draftId },
      data: {
        status: 'SCHEDULED',
        scheduledAt: expect.any(Date),
      },
    });
  });

  it('successfully copies a draft without scheduledAt → status COPIED', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'LINKEDIN',
      status: 'APPROVED',
      currentContent: 'Ready to copy and paste',
      scheduledAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      status: 'COPIED',
      scheduledAt: null,
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.contentDraft.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDraft);
    (prisma.systemLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await scheduleDraft(userId, draftId);

    expect(result.draft.id).toBe(draftId);
    expect(result.draft.status).toBe('COPIED');
    expect(result.draft.scheduledAt).toBeNull();

    // Verify draft was updated with COPIED status
    expect(prisma.contentDraft.update).toHaveBeenCalledWith({
      where: { id: draftId },
      data: {
        status: 'COPIED',
        scheduledAt: null,
      },
    });
  });

  it('creates SystemLog for schedule action', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'APPROVED',
      currentContent: 'Content',
      scheduledAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      status: 'SCHEDULED',
      scheduledAt: new Date(futureDate),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.contentDraft.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDraft);
    (prisma.systemLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await scheduleDraft(userId, draftId, futureDate);

    expect(prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        category: 'content',
        action: 'schedule',
        details: {
          draftId,
          platform: 'TWITTER',
          scheduledAt: expect.any(String),
        },
        userId,
      },
    });
  });

  it('creates SystemLog for copy action', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'BLOG',
      status: 'APPROVED',
      currentContent: 'Blog post content',
      scheduledAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      status: 'COPIED',
      scheduledAt: null,
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.contentDraft.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDraft);
    (prisma.systemLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await scheduleDraft(userId, draftId);

    expect(prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        category: 'content',
        action: 'copy',
        details: {
          draftId,
          platform: 'BLOG',
        },
        userId,
      },
    });
  });

  it('returns 404 for non-existent draft', async () => {
    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    try {
      await scheduleDraft(userId, 'nonexistent-id');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(404);
    }
  });

  it('returns 403 for wrong user', async () => {
    const existingDraft = {
      id: draftId,
      userId: 'other-user-999',
      platform: 'TWITTER',
      status: 'APPROVED',
      currentContent: 'Content',
      scheduledAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    try {
      await scheduleDraft(userId, draftId, futureDate);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }
  });

  it('returns 400 when draft is not in APPROVED state', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'EDITING',
      currentContent: 'Content still being edited',
      scheduledAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    try {
      await scheduleDraft(userId, draftId, futureDate);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('Invalid state transition');
    }
  });

  it('returns 400 for past date in scheduledAt', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'APPROVED',
      currentContent: 'Content',
      scheduledAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // yesterday

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    try {
      await scheduleDraft(userId, draftId, pastDate);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('future');
    }
  });
});

/**
 * Unit tests for POST /api/content/drafts/:id/approve endpoint (approveDraft service).
 *
 * Validates: Requirements 7.1, 7.3
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
    $transaction: vi.fn(),
  },
}));

import prisma from '../lib/prisma.js';
import { approveDraft } from '../services/content.js';
import { AppError } from '../errors/AppError.js';

describe('approveDraft', () => {
  const userId = 'user-123';
  const draftId = 'draft-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully approves a draft in PENDING_APPROVAL state', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'PENDING_APPROVAL',
      currentContent: 'My build-in-public post content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      status: 'APPROVED',
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([updatedDraft, {}]);

    const result = await approveDraft(userId, draftId);

    expect(result.draft.id).toBe(draftId);
    expect(result.draft.status).toBe('APPROVED');
    expect(result.draft.platform).toBe('TWITTER');
    expect(result.draft.currentContent).toBe('My build-in-public post content');
    expect(result.draft.updatedAt).toEqual(new Date('2024-01-02T00:00:00.000Z'));

    // Verify transaction was called
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a SystemLog entry for the approval action', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'LINKEDIN',
      status: 'PENDING_APPROVAL',
      currentContent: 'LinkedIn content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      status: 'APPROVED',
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([updatedDraft, {}]);

    await approveDraft(userId, draftId);

    // Verify that $transaction was called with the correct arguments
    const transactionArg = (prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(transactionArg).toHaveLength(2);

    // Verify the systemLog.create call was set up correctly
    expect(prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        category: 'content',
        action: 'approve',
        details: {
          draftId,
          platform: 'LINKEDIN',
          previousStatus: 'PENDING_APPROVAL',
        },
        userId,
      },
    });
  });

  it('returns 404 for non-existent draft', async () => {
    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(approveDraft(userId, 'nonexistent-id')).rejects.toThrow(AppError);

    try {
      await approveDraft(userId, 'nonexistent-id');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(404);
      expect((err as AppError).message).toBe('Draft not found');
    }
  });

  it('returns 403 for wrong user', async () => {
    const existingDraft = {
      id: draftId,
      userId: 'other-user-999',
      platform: 'TWITTER',
      status: 'PENDING_APPROVAL',
      currentContent: 'Some content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(approveDraft(userId, draftId)).rejects.toThrow(AppError);

    try {
      await approveDraft(userId, draftId);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).message).toBe('You do not have access to this draft');
    }
  });

  it('returns 400 when draft is not in PENDING_APPROVAL state (GENERATED)', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'GENERATED',
      currentContent: 'Some content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(approveDraft(userId, draftId)).rejects.toThrow(AppError);

    try {
      await approveDraft(userId, draftId);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('PENDING_APPROVAL');
    }
  });

  it('returns 400 when draft is in EDITING state', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'BLOG',
      status: 'EDITING',
      currentContent: 'Some content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(approveDraft(userId, draftId)).rejects.toThrow(AppError);

    try {
      await approveDraft(userId, draftId);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('returns 400 when draft is already APPROVED', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'APPROVED',
      currentContent: 'Some content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(approveDraft(userId, draftId)).rejects.toThrow(AppError);

    try {
      await approveDraft(userId, draftId);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });
});

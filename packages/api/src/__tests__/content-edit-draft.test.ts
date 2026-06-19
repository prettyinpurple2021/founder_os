/**
 * Unit tests for PUT /api/content/drafts/:id endpoint (editDraft service).
 *
 * Validates: Requirements 6.3, 6.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../lib/prisma.js', () => ({
  default: {
    contentDraft: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    draftVersion: {
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import prisma from '../lib/prisma.js';
import { editDraft } from '../services/content.js';
import { AppError } from '../errors/AppError.js';

describe('editDraft', () => {
  const userId = 'user-123';
  const draftId = 'draft-456';
  const newContent = 'Updated content for build-in-public post';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits a draft and creates a new version with incremented version number', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'GENERATED',
      currentContent: 'Original content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      currentContent: newContent,
      status: 'EDITING',
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    const newVersion = {
      id: 'version-789',
      draftId,
      version: 2,
      content: newContent,
      editedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.draftVersion.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([updatedDraft, newVersion]);

    const result = await editDraft(userId, draftId, newContent);

    expect(result.draft.id).toBe(draftId);
    expect(result.draft.status).toBe('EDITING');
    expect(result.draft.currentContent).toBe(newContent);
    expect(result.version.version).toBe(2);
    expect(result.version.content).toBe(newContent);
    expect(result.version.id).toBe('version-789');

    // Verify transaction was called
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('transitions draft status to EDITING', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'LINKEDIN',
      status: 'GENERATED',
      currentContent: 'Original content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      currentContent: newContent,
      status: 'EDITING',
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    const newVersion = {
      id: 'version-001',
      draftId,
      version: 1,
      content: newContent,
      editedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.draftVersion.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([updatedDraft, newVersion]);

    const result = await editDraft(userId, draftId, newContent);

    expect(result.draft.status).toBe('EDITING');
  });

  it('throws 404 error for non-existent draft', async () => {
    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(editDraft(userId, 'nonexistent-id', newContent)).rejects.toThrow(AppError);

    try {
      await editDraft(userId, 'nonexistent-id', newContent);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(404);
    }
  });

  it('throws 403 error when draft belongs to a different user', async () => {
    const existingDraft = {
      id: draftId,
      userId: 'other-user-999',
      platform: 'TWITTER',
      status: 'GENERATED',
      currentContent: 'Original content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(editDraft(userId, draftId, newContent)).rejects.toThrow(AppError);

    try {
      await editDraft(userId, draftId, newContent);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }
  });

  it('throws 400 error when draft is in a non-editable state (APPROVED)', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'APPROVED',
      currentContent: 'Original content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(editDraft(userId, draftId, newContent)).rejects.toThrow(AppError);

    try {
      await editDraft(userId, draftId, newContent);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('throws 400 error when draft is in SCHEDULED state', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'SCHEDULED',
      currentContent: 'Original content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(editDraft(userId, draftId, newContent)).rejects.toThrow(AppError);

    try {
      await editDraft(userId, draftId, newContent);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('throws 400 error when draft is in REJECTED state', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'REJECTED',
      currentContent: 'Original content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(editDraft(userId, draftId, newContent)).rejects.toThrow(AppError);

    try {
      await editDraft(userId, draftId, newContent);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('throws 400 error when draft is in COPIED state', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'TWITTER',
      status: 'COPIED',
      currentContent: 'Original content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);

    await expect(editDraft(userId, draftId, newContent)).rejects.toThrow(AppError);

    try {
      await editDraft(userId, draftId, newContent);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('throws 400 error when content is empty', async () => {
    await expect(editDraft(userId, draftId, '')).rejects.toThrow(AppError);

    try {
      await editDraft(userId, draftId, '');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('throws 400 error when content is only whitespace', async () => {
    await expect(editDraft(userId, draftId, '   ')).rejects.toThrow(AppError);

    try {
      await editDraft(userId, draftId, '   ');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('allows editing a draft already in EDITING state', async () => {
    const existingDraft = {
      id: draftId,
      userId,
      platform: 'BLOG',
      status: 'EDITING',
      currentContent: 'Previously edited content',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T12:00:00.000Z'),
    };

    const updatedDraft = {
      ...existingDraft,
      currentContent: newContent,
      status: 'EDITING',
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    const newVersion = {
      id: 'version-003',
      draftId,
      version: 3,
      content: newContent,
      editedAt: new Date('2024-01-02T00:00:00.000Z'),
    };

    (prisma.contentDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingDraft);
    (prisma.draftVersion.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([updatedDraft, newVersion]);

    const result = await editDraft(userId, draftId, newContent);

    expect(result.draft.status).toBe('EDITING');
    expect(result.version.version).toBe(3);
    expect(result.version.content).toBe(newContent);
  });
});

/**
 * Tests for the draft lifecycle state machine.
 * Validates: Requirements 7.1, 6.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftStatus } from '../generated/prisma/enums.js';

// Mock prisma
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
import {
  VALID_TRANSITIONS,
  isValidTransition,
  validateTransition,
  submitForReview,
} from '../services/content.js';
import { AppError } from '../errors/AppError.js';

describe('Draft Lifecycle State Machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VALID_TRANSITIONS map', () => {
    it('should define transitions for all DraftStatus values', () => {
      const allStatuses = Object.values(DraftStatus);
      for (const status of allStatuses) {
        expect(VALID_TRANSITIONS).toHaveProperty(status);
        expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
      }
    });

    it('should allow GENERATED → EDITING', () => {
      expect(VALID_TRANSITIONS[DraftStatus.GENERATED]).toContain(DraftStatus.EDITING);
    });

    it('should allow GENERATED → PENDING_APPROVAL', () => {
      expect(VALID_TRANSITIONS[DraftStatus.GENERATED]).toContain(DraftStatus.PENDING_APPROVAL);
    });

    it('should allow EDITING → EDITING (re-edit)', () => {
      expect(VALID_TRANSITIONS[DraftStatus.EDITING]).toContain(DraftStatus.EDITING);
    });

    it('should allow EDITING → PENDING_APPROVAL', () => {
      expect(VALID_TRANSITIONS[DraftStatus.EDITING]).toContain(DraftStatus.PENDING_APPROVAL);
    });

    it('should allow PENDING_APPROVAL → APPROVED', () => {
      expect(VALID_TRANSITIONS[DraftStatus.PENDING_APPROVAL]).toContain(DraftStatus.APPROVED);
    });

    it('should allow PENDING_APPROVAL → REJECTED', () => {
      expect(VALID_TRANSITIONS[DraftStatus.PENDING_APPROVAL]).toContain(DraftStatus.REJECTED);
    });

    it('should allow APPROVED → SCHEDULED', () => {
      expect(VALID_TRANSITIONS[DraftStatus.APPROVED]).toContain(DraftStatus.SCHEDULED);
    });

    it('should allow APPROVED → COPIED', () => {
      expect(VALID_TRANSITIONS[DraftStatus.APPROVED]).toContain(DraftStatus.COPIED);
    });

    it('should define REJECTED as a terminal state (no transitions)', () => {
      expect(VALID_TRANSITIONS[DraftStatus.REJECTED]).toEqual([]);
    });

    it('should define SCHEDULED as a terminal state (no transitions)', () => {
      expect(VALID_TRANSITIONS[DraftStatus.SCHEDULED]).toEqual([]);
    });

    it('should define COPIED as a terminal state (no transitions)', () => {
      expect(VALID_TRANSITIONS[DraftStatus.COPIED]).toEqual([]);
    });
  });

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(isValidTransition(DraftStatus.GENERATED, DraftStatus.EDITING)).toBe(true);
      expect(isValidTransition(DraftStatus.GENERATED, DraftStatus.PENDING_APPROVAL)).toBe(true);
      expect(isValidTransition(DraftStatus.EDITING, DraftStatus.EDITING)).toBe(true);
      expect(isValidTransition(DraftStatus.EDITING, DraftStatus.PENDING_APPROVAL)).toBe(true);
      expect(isValidTransition(DraftStatus.PENDING_APPROVAL, DraftStatus.APPROVED)).toBe(true);
      expect(isValidTransition(DraftStatus.PENDING_APPROVAL, DraftStatus.REJECTED)).toBe(true);
      expect(isValidTransition(DraftStatus.APPROVED, DraftStatus.SCHEDULED)).toBe(true);
      expect(isValidTransition(DraftStatus.APPROVED, DraftStatus.COPIED)).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      // Skip states
      expect(isValidTransition(DraftStatus.GENERATED, DraftStatus.APPROVED)).toBe(false);
      expect(isValidTransition(DraftStatus.GENERATED, DraftStatus.SCHEDULED)).toBe(false);
      expect(isValidTransition(DraftStatus.GENERATED, DraftStatus.COPIED)).toBe(false);
      expect(isValidTransition(DraftStatus.GENERATED, DraftStatus.REJECTED)).toBe(false);
      // Backwards transitions
      expect(isValidTransition(DraftStatus.APPROVED, DraftStatus.EDITING)).toBe(false);
      expect(isValidTransition(DraftStatus.PENDING_APPROVAL, DraftStatus.EDITING)).toBe(false);
      expect(isValidTransition(DraftStatus.PENDING_APPROVAL, DraftStatus.GENERATED)).toBe(false);
    });

    it('should return false for any transition from terminal states', () => {
      const terminalStates = [DraftStatus.REJECTED, DraftStatus.SCHEDULED, DraftStatus.COPIED];
      const allStatuses = Object.values(DraftStatus);

      for (const terminal of terminalStates) {
        for (const target of allStatuses) {
          expect(isValidTransition(terminal, target)).toBe(false);
        }
      }
    });
  });

  describe('validateTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => validateTransition(DraftStatus.GENERATED, DraftStatus.EDITING)).not.toThrow();
      expect(() => validateTransition(DraftStatus.EDITING, DraftStatus.PENDING_APPROVAL)).not.toThrow();
      expect(() => validateTransition(DraftStatus.PENDING_APPROVAL, DraftStatus.APPROVED)).not.toThrow();
      expect(() => validateTransition(DraftStatus.APPROVED, DraftStatus.SCHEDULED)).not.toThrow();
    });

    it('should throw a 400 error for invalid transitions', () => {
      try {
        validateTransition(DraftStatus.GENERATED, DraftStatus.APPROVED);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).message).toContain('Invalid state transition');
        expect((err as AppError).message).toContain('GENERATED');
        expect((err as AppError).message).toContain('APPROVED');
      }
    });

    it('should indicate terminal state in error message when transitioning from terminal', () => {
      try {
        validateTransition(DraftStatus.REJECTED, DraftStatus.EDITING);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).message).toContain('terminal state');
      }
    });
  });

  describe('submitForReview', () => {
    const userId = 'user-123';
    const draftId = 'draft-456';

    it('should submit a GENERATED draft for review', async () => {
      const mockDraft = {
        id: draftId,
        userId,
        status: DraftStatus.GENERATED,
        platform: 'TWITTER',
        currentContent: 'Some content',
      };

      const updatedDraft = {
        ...mockDraft,
        status: DraftStatus.PENDING_APPROVAL,
        updatedAt: new Date(),
      };

      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(mockDraft as any);
      vi.mocked(prisma.$transaction).mockResolvedValue([updatedDraft, {}] as any);

      const result = await submitForReview(userId, draftId);

      expect(result.draft.status).toBe(DraftStatus.PENDING_APPROVAL);
      expect(result.draft.id).toBe(draftId);
    });

    it('should submit an EDITING draft for review', async () => {
      const mockDraft = {
        id: draftId,
        userId,
        status: DraftStatus.EDITING,
        platform: 'LINKEDIN',
        currentContent: 'Edited content',
      };

      const updatedDraft = {
        ...mockDraft,
        status: DraftStatus.PENDING_APPROVAL,
        updatedAt: new Date(),
      };

      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(mockDraft as any);
      vi.mocked(prisma.$transaction).mockResolvedValue([updatedDraft, {}] as any);

      const result = await submitForReview(userId, draftId);

      expect(result.draft.status).toBe(DraftStatus.PENDING_APPROVAL);
    });

    it('should reject submission from APPROVED state', async () => {
      const mockDraft = {
        id: draftId,
        userId,
        status: DraftStatus.APPROVED,
        platform: 'TWITTER',
        currentContent: 'Approved content',
      };

      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(mockDraft as any);

      await expect(submitForReview(userId, draftId)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Invalid state transition'),
      });
    });

    it('should reject submission from REJECTED state', async () => {
      const mockDraft = {
        id: draftId,
        userId,
        status: DraftStatus.REJECTED,
        platform: 'TWITTER',
        currentContent: 'Rejected content',
      };

      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(mockDraft as any);

      await expect(submitForReview(userId, draftId)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should reject submission from SCHEDULED state', async () => {
      const mockDraft = {
        id: draftId,
        userId,
        status: DraftStatus.SCHEDULED,
        platform: 'TWITTER',
        currentContent: 'Scheduled content',
      };

      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(mockDraft as any);

      await expect(submitForReview(userId, draftId)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should reject submission from COPIED state', async () => {
      const mockDraft = {
        id: draftId,
        userId,
        status: DraftStatus.COPIED,
        platform: 'TWITTER',
        currentContent: 'Copied content',
      };

      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(mockDraft as any);

      await expect(submitForReview(userId, draftId)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should throw 404 if draft not found', async () => {
      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(null);

      await expect(submitForReview(userId, 'non-existent-id')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Draft not found',
      });
    });

    it('should throw 403 if draft belongs to a different user', async () => {
      const mockDraft = {
        id: draftId,
        userId: 'other-user-id',
        status: DraftStatus.GENERATED,
        platform: 'TWITTER',
        currentContent: 'Some content',
      };

      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(mockDraft as any);

      await expect(submitForReview(userId, draftId)).rejects.toMatchObject({
        statusCode: 403,
        message: 'You do not have access to this draft',
      });
    });

    it('should log the submission action', async () => {
      const mockDraft = {
        id: draftId,
        userId,
        status: DraftStatus.GENERATED,
        platform: 'TWITTER',
        currentContent: 'Some content',
      };

      const updatedDraft = {
        ...mockDraft,
        status: DraftStatus.PENDING_APPROVAL,
        updatedAt: new Date(),
      };

      vi.mocked(prisma.contentDraft.findUnique).mockResolvedValue(mockDraft as any);
      vi.mocked(prisma.$transaction).mockResolvedValue([updatedDraft, {}] as any);

      await submitForReview(userId, draftId);

      // Verify $transaction was called (contains both draft update and log creation)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});

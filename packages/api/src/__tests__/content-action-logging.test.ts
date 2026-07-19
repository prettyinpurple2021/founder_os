/**
 * Unit Tests for Content Action Logging
 *
 * Verifies that generateDraft and editDraft log their actions
 * via the logContent utility with the correct details.
 *
 * Validates: Requirements 10.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
    evidence: {
      findMany: vi.fn(),
    },
    contentDraft: {
      create: vi.fn(),
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

vi.mock('../services/logger.js', () => ({
  logContent: vi.fn().mockResolvedValue(undefined),
  logSync: vi.fn().mockResolvedValue(undefined),
  logStateChange: vi.fn().mockResolvedValue(undefined),
  logAuth: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn().mockResolvedValue(undefined),
  log: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/bedrock.js', () => ({
  isBedrockEnabled: vi.fn().mockReturnValue(false),
  callBedrock: vi.fn().mockResolvedValue('Generated content from Bedrock'),
}));

import prisma from '../lib/prisma.js';
import { logContent } from '../services/logger.js';
import { generateDraft, editDraft } from '../services/content.js';

const mockLogContent = vi.mocked(logContent);
const mockRepoFindUnique = vi.mocked(prisma.repository.findUnique);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);
const mockDraftCreate = vi.mocked(prisma.contentDraft.create);
const mockDraftFindUnique = vi.mocked(prisma.contentDraft.findUnique);
const mockVersionCount = vi.mocked(prisma.draftVersion.count);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockEvidenceFindMany = vi.mocked(prisma.evidence.findMany);

describe('Content Action Logging (Requirement 10.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LLM_API_KEY;
    mockEvidenceFindMany.mockResolvedValue([]);
  });

  describe('generateDraft logging', () => {
    it('logs a "generate" action with draftId, platform, and taskCount after creating a draft', async () => {
      const userId = 'user-1';
      const now = new Date();

      mockRepoFindUnique.mockResolvedValue({
        id: 'repo-1',
        userId,
        owner: 'testuser',
        name: 'testrepo',
        fullName: 'testuser/testrepo',
        githubId: 123,
        connectedAt: now,
      } as any);

      mockTaskFindMany.mockResolvedValue([
        { id: 'task-1', title: 'Add login page', lastInferredAt: now },
        { id: 'task-2', title: 'Fix header layout', lastInferredAt: now },
        { id: 'task-3', title: 'Deploy staging', lastInferredAt: now },
      ] as any);

      mockDraftCreate.mockResolvedValue({
        id: 'draft-abc',
        userId,
        platform: 'TWITTER',
        status: 'GENERATED',
        currentContent: 'Generated content',
        createdAt: now,
        updatedAt: now,
        scheduledAt: null,
        versions: [
          {
            id: 'v-1',
            draftId: 'draft-abc',
            version: 1,
            content: 'Generated content',
            editedAt: now,
          },
        ],
      } as any);

      await generateDraft(userId, 'TWITTER');

      expect(mockLogContent).toHaveBeenCalledTimes(1);
      expect(mockLogContent).toHaveBeenCalledWith(userId, 'generate', {
        draftId: 'draft-abc',
        platform: 'TWITTER',
        taskCount: 3,
      });
    });

    it('does not log when draft generation fails (no repo)', async () => {
      mockRepoFindUnique.mockResolvedValue(null);

      await expect(generateDraft('user-1', 'TWITTER')).rejects.toThrow();
      expect(mockLogContent).not.toHaveBeenCalled();
    });

    it('does not log when draft generation fails (no tasks)', async () => {
      mockRepoFindUnique.mockResolvedValue({
        id: 'repo-1',
        userId: 'user-1',
        owner: 'testuser',
        name: 'testrepo',
        fullName: 'testuser/testrepo',
        githubId: 123,
        connectedAt: new Date(),
      } as any);

      mockTaskFindMany.mockResolvedValue([]);

      await expect(generateDraft('user-1', 'TWITTER')).rejects.toThrow();
      expect(mockLogContent).not.toHaveBeenCalled();
    });
  });

  describe('editDraft logging', () => {
    it('logs an "edit" action with draftId and version number after editing', async () => {
      const userId = 'user-1';
      const draftId = 'draft-xyz';
      const newContent = 'Updated tweet content';
      const now = new Date();

      mockDraftFindUnique.mockResolvedValue({
        id: draftId,
        userId,
        platform: 'TWITTER',
        status: 'GENERATED',
        currentContent: 'Original content',
        createdAt: now,
        updatedAt: now,
      } as any);

      mockVersionCount.mockResolvedValue(1);

      const updatedDraft = {
        id: draftId,
        userId,
        platform: 'TWITTER',
        status: 'EDITING',
        currentContent: newContent,
        updatedAt: now,
      };

      const newVersion = {
        id: 'version-2',
        draftId,
        version: 2,
        content: newContent,
        editedAt: now,
      };

      mockTransaction.mockResolvedValue([updatedDraft, newVersion]);

      await editDraft(userId, draftId, newContent);

      expect(mockLogContent).toHaveBeenCalledTimes(1);
      expect(mockLogContent).toHaveBeenCalledWith(userId, 'edit', {
        draftId,
        version: 2,
      });
    });

    it('logs the correct version number for subsequent edits', async () => {
      const userId = 'user-1';
      const draftId = 'draft-xyz';
      const newContent = 'Third revision';
      const now = new Date();

      mockDraftFindUnique.mockResolvedValue({
        id: draftId,
        userId,
        platform: 'LINKEDIN',
        status: 'EDITING',
        currentContent: 'Second revision',
        createdAt: now,
        updatedAt: now,
      } as any);

      // Already has 2 versions
      mockVersionCount.mockResolvedValue(2);

      mockTransaction.mockResolvedValue([
        {
          id: draftId,
          userId,
          platform: 'LINKEDIN',
          status: 'EDITING',
          currentContent: newContent,
          updatedAt: now,
        },
        {
          id: 'version-3',
          draftId,
          version: 3,
          content: newContent,
          editedAt: now,
        },
      ]);

      await editDraft(userId, draftId, newContent);

      expect(mockLogContent).toHaveBeenCalledWith(userId, 'edit', {
        draftId,
        version: 3,
      });
    });

    it('does not log when edit fails (draft not found)', async () => {
      mockDraftFindUnique.mockResolvedValue(null);

      await expect(editDraft('user-1', 'nonexistent', 'content')).rejects.toThrow();
      expect(mockLogContent).not.toHaveBeenCalled();
    });

    it('does not log when edit fails (wrong user)', async () => {
      mockDraftFindUnique.mockResolvedValue({
        id: 'draft-xyz',
        userId: 'other-user',
        platform: 'TWITTER',
        status: 'GENERATED',
        currentContent: 'Original',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await expect(editDraft('user-1', 'draft-xyz', 'content')).rejects.toThrow();
      expect(mockLogContent).not.toHaveBeenCalled();
    });
  });
});

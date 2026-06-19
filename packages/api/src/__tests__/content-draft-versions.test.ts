/**
 * Unit Tests for getDraftVersions
 *
 * Tests the content service function that retrieves version history
 * for a content draft, including authorization checks.
 *
 * Requirement 6.4: Version history for content drafts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {
    contentDraft: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    draftVersion: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    repository: {
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../services/content-prompts.js', () => ({
  buildPrompt: vi.fn(),
  PLATFORM_CONFIGS: {},
}));

import prisma from '../lib/prisma.js';
import { getDraftVersions } from '../services/content.js';
import { AppError } from '../errors/AppError.js';

const mockFindUnique = vi.mocked(prisma.contentDraft.findUnique);
const mockFindMany = vi.mocked(prisma.draftVersion.findMany);

describe('getDraftVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return draft info and all versions ordered by version number', async () => {
    const mockDraft = {
      id: 'draft-1',
      userId: 'user-1',
      platform: 'TWITTER',
      status: 'EDITING',
      currentContent: 'latest content',
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduledAt: null,
    };

    const mockVersions = [
      {
        id: 'v1',
        draftId: 'draft-1',
        version: 1,
        content: 'original generated content',
        editedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
      {
        id: 'v2',
        draftId: 'draft-1',
        version: 2,
        content: 'edited content',
        editedAt: new Date('2024-01-02T00:00:00.000Z'),
      },
    ];

    mockFindUnique.mockResolvedValue(mockDraft as any);
    mockFindMany.mockResolvedValue(mockVersions as any);

    const result = await getDraftVersions('user-1', 'draft-1');

    expect(result.draft).toEqual({
      id: 'draft-1',
      platform: 'TWITTER',
      status: 'EDITING',
      currentContent: 'latest content',
    });
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0]).toEqual({
      id: 'v1',
      version: 1,
      content: 'original generated content',
      editedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    expect(result.versions[1]).toEqual({
      id: 'v2',
      version: 2,
      content: 'edited content',
      editedAt: new Date('2024-01-02T00:00:00.000Z'),
    });

    // Verify versions are queried with ascending order
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { draftId: 'draft-1' },
      orderBy: { version: 'asc' },
    });
  });

  it('should return 404 for non-existent draft', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(getDraftVersions('user-1', 'non-existent-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Draft not found',
    });

    // Should not attempt to fetch versions
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('should return 403 when draft belongs to different user', async () => {
    const mockDraft = {
      id: 'draft-1',
      userId: 'other-user',
      platform: 'LINKEDIN',
      status: 'GENERATED',
      currentContent: 'some content',
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduledAt: null,
    };

    mockFindUnique.mockResolvedValue(mockDraft as any);

    await expect(getDraftVersions('user-1', 'draft-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Access denied',
    });

    // Should not attempt to fetch versions
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('should return empty versions array for draft with no versions yet', async () => {
    const mockDraft = {
      id: 'draft-2',
      userId: 'user-1',
      platform: 'BLOG',
      status: 'GENERATED',
      currentContent: 'freshly generated content',
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduledAt: null,
    };

    mockFindUnique.mockResolvedValue(mockDraft as any);
    mockFindMany.mockResolvedValue([]);

    const result = await getDraftVersions('user-1', 'draft-2');

    expect(result.draft).toEqual({
      id: 'draft-2',
      platform: 'BLOG',
      status: 'GENERATED',
      currentContent: 'freshly generated content',
    });
    expect(result.versions).toEqual([]);
  });

  it('should return versions ordered ascending by version number', async () => {
    const mockDraft = {
      id: 'draft-3',
      userId: 'user-1',
      platform: 'TWITTER',
      status: 'EDITING',
      currentContent: 'v3 content',
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduledAt: null,
    };

    // Simulate versions returned in correct ascending order
    const mockVersions = [
      {
        id: 'v1',
        draftId: 'draft-3',
        version: 1,
        content: 'first draft',
        editedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
      {
        id: 'v2',
        draftId: 'draft-3',
        version: 2,
        content: 'second draft',
        editedAt: new Date('2024-01-05T00:00:00.000Z'),
      },
      {
        id: 'v3',
        draftId: 'draft-3',
        version: 3,
        content: 'third draft',
        editedAt: new Date('2024-01-10T00:00:00.000Z'),
      },
    ];

    mockFindUnique.mockResolvedValue(mockDraft as any);
    mockFindMany.mockResolvedValue(mockVersions as any);

    const result = await getDraftVersions('user-1', 'draft-3');

    expect(result.versions).toHaveLength(3);
    expect(result.versions[0].version).toBe(1);
    expect(result.versions[1].version).toBe(2);
    expect(result.versions[2].version).toBe(3);

    // Verify the ordering was requested correctly
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { draftId: 'draft-3' },
      orderBy: { version: 'asc' },
    });
  });
});

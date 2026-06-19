/**
 * Unit Tests for the Content Drafts Endpoint
 *
 * Tests GET /api/content/drafts with filtering by status and platform.
 * Mocks Prisma to verify query construction and response formatting.
 *
 * Requirement 6.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {
    contentDraft: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma.js';
import { listDrafts, InvalidFilterError } from '../services/content.js';

const mockFindMany = vi.mocked(prisma.contentDraft.findMany);

const mockDrafts = [
  {
    id: 'draft-1',
    userId: 'user-1',
    platform: 'TWITTER',
    status: 'GENERATED',
    currentContent: 'Hello Twitter!',
    scheduledAt: null,
    createdAt: new Date('2024-01-03T00:00:00.000Z'),
    updatedAt: new Date('2024-01-03T00:00:00.000Z'),
  },
  {
    id: 'draft-2',
    userId: 'user-1',
    platform: 'LINKEDIN',
    status: 'EDITING',
    currentContent: 'Professional post here',
    scheduledAt: null,
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  },
  {
    id: 'draft-3',
    userId: 'user-1',
    platform: 'TWITTER',
    status: 'EDITING',
    currentContent: 'Another tweet',
    scheduledAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
];

describe('listDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all drafts for user when no filters are provided', async () => {
    mockFindMany.mockResolvedValue(mockDrafts as any);

    const result = await listDrafts('user-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(mockDrafts);
  });

  it('should filter by status correctly', async () => {
    const editingDrafts = mockDrafts.filter((d) => d.status === 'EDITING');
    mockFindMany.mockResolvedValue(editingDrafts as any);

    const result = await listDrafts('user-1', { status: 'EDITING' });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'EDITING' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(editingDrafts);
  });

  it('should filter by platform correctly', async () => {
    const twitterDrafts = mockDrafts.filter((d) => d.platform === 'TWITTER');
    mockFindMany.mockResolvedValue(twitterDrafts as any);

    const result = await listDrafts('user-1', { platform: 'TWITTER' });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', platform: 'TWITTER' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(twitterDrafts);
  });

  it('should filter by both status and platform together', async () => {
    const filtered = mockDrafts.filter(
      (d) => d.status === 'EDITING' && d.platform === 'TWITTER',
    );
    mockFindMany.mockResolvedValue(filtered as any);

    const result = await listDrafts('user-1', { status: 'EDITING', platform: 'TWITTER' });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'EDITING', platform: 'TWITTER' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(filtered);
  });

  it('should return empty array when no drafts match', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await listDrafts('user-1', { status: 'APPROVED' });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([]);
  });

  it('should throw InvalidFilterError for invalid status value', async () => {
    await expect(listDrafts('user-1', { status: 'INVALID_STATUS' })).rejects.toThrow(
      InvalidFilterError,
    );
    await expect(listDrafts('user-1', { status: 'INVALID_STATUS' })).rejects.toThrow(
      /Invalid status value: 'INVALID_STATUS'/,
    );

    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('should throw InvalidFilterError for invalid platform value', async () => {
    await expect(listDrafts('user-1', { platform: 'FACEBOOK' })).rejects.toThrow(
      InvalidFilterError,
    );
    await expect(listDrafts('user-1', { platform: 'FACEBOOK' })).rejects.toThrow(
      /Invalid platform value: 'FACEBOOK'/,
    );

    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('should order results by createdAt descending', async () => {
    mockFindMany.mockResolvedValue(mockDrafts as any);

    await listDrafts('user-1');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});

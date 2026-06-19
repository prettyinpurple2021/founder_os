/**
 * Unit tests for POST /api/marketing/assets/:id/complete and
 * POST /api/marketing/assets/:id/uncomplete endpoints.
 *
 * Validates: Requirements 5.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../lib/prisma.js', () => ({
  default: {
    marketingAsset: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma.js';
import {
  markAssetComplete,
  markAssetUncomplete,
  getRecommendedAssetIds,
  RECOMMENDED_ASSETS,
} from '../services/marketing.js';

describe('Marketing Asset Completion', () => {
  const userId = 'user-123';
  const validAssetType = 'landing-page-copy';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRecommendedAssetIds', () => {
    it('returns a Set containing all recommended asset IDs', () => {
      const ids = getRecommendedAssetIds();
      expect(ids.size).toBe(RECOMMENDED_ASSETS.length);
      for (const asset of RECOMMENDED_ASSETS) {
        expect(ids.has(asset.id)).toBe(true);
      }
    });
  });

  describe('markAssetComplete', () => {
    it('creates a new completed asset if no record exists for user+type', async () => {
      const mockCreated = {
        id: 'uuid-1',
        type: validAssetType,
        status: 'completed',
        completedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      (prisma.marketingAsset.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)  // no completed record
        .mockResolvedValueOnce(null); // no existing record at all
      (prisma.marketingAsset.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreated);

      const result = await markAssetComplete(userId, validAssetType);

      expect(result.type).toBe(validAssetType);
      expect(result.status).toBe('completed');
      expect(result.completedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(prisma.marketingAsset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          type: validAssetType,
          status: 'completed',
        }),
      });
    });

    it('returns existing completed asset unchanged (idempotent)', async () => {
      const existingCompleted = {
        id: 'uuid-1',
        type: validAssetType,
        status: 'completed',
        completedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      (prisma.marketingAsset.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(existingCompleted);

      const result = await markAssetComplete(userId, validAssetType);

      expect(result).toEqual(existingCompleted);
      expect(prisma.marketingAsset.update).not.toHaveBeenCalled();
      expect(prisma.marketingAsset.create).not.toHaveBeenCalled();
    });

    it('updates an existing non-completed asset to completed', async () => {
      const existingMissing = {
        id: 'uuid-1',
        type: validAssetType,
        status: 'missing',
        completedAt: null,
      };

      const updatedAsset = {
        id: 'uuid-1',
        type: validAssetType,
        status: 'completed',
        completedAt: new Date('2024-01-15T00:00:00.000Z'),
      };

      (prisma.marketingAsset.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)          // no completed record
        .mockResolvedValueOnce(existingMissing); // existing with status 'missing'
      (prisma.marketingAsset.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedAsset);

      const result = await markAssetComplete(userId, validAssetType);

      expect(result.status).toBe('completed');
      expect(result.completedAt).toEqual(new Date('2024-01-15T00:00:00.000Z'));
      expect(prisma.marketingAsset.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: expect.objectContaining({
          status: 'completed',
        }),
      });
    });
  });

  describe('markAssetUncomplete', () => {
    it('resets an existing completed asset to missing', async () => {
      const existingCompleted = {
        id: 'uuid-1',
        type: validAssetType,
        status: 'completed',
        completedAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      const updatedAsset = {
        id: 'uuid-1',
        type: validAssetType,
        status: 'missing',
        completedAt: null,
      };

      (prisma.marketingAsset.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existingCompleted);
      (prisma.marketingAsset.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedAsset);

      const result = await markAssetUncomplete(userId, validAssetType);

      expect(result.status).toBe('missing');
      expect(result.completedAt).toBeNull();
      expect(prisma.marketingAsset.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: {
          status: 'missing',
          completedAt: null,
        },
      });
    });

    it('creates a new record with status missing if none exists', async () => {
      const mockCreated = {
        id: 'uuid-2',
        type: validAssetType,
        status: 'missing',
        completedAt: null,
      };

      (prisma.marketingAsset.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.marketingAsset.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreated);

      const result = await markAssetUncomplete(userId, validAssetType);

      expect(result.status).toBe('missing');
      expect(result.completedAt).toBeNull();
      expect(prisma.marketingAsset.create).toHaveBeenCalledWith({
        data: {
          userId,
          type: validAssetType,
          status: 'missing',
          completedAt: null,
        },
      });
    });
  });

  describe('Asset type validation', () => {
    it('recommended set includes expected asset types', () => {
      const ids = getRecommendedAssetIds();
      expect(ids.has('landing-page-copy')).toBe(true);
      expect(ids.has('social-announcement-twitter')).toBe(true);
      expect(ids.has('social-announcement-linkedin')).toBe(true);
      expect(ids.has('product-changelog')).toBe(true);
      expect(ids.has('product-screenshots')).toBe(true);
      expect(ids.has('readme-value-prop')).toBe(true);
    });

    it('rejects invalid asset types', () => {
      const ids = getRecommendedAssetIds();
      expect(ids.has('invalid-type' as any)).toBe(false);
      expect(ids.has('' as any)).toBe(false);
    });
  });
});

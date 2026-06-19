/**
 * Unit Tests for the Marketing Status Endpoint
 *
 * Tests the getMarketingStatus function which compares a user's
 * completed marketing assets against the recommended set.
 *
 * Requirement 5.1: Compare existing Marketing_Assets against a recommended set.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {
    marketingAsset: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma.js';
import {
  getMarketingStatus,
  RECOMMENDED_ASSETS,
  MarketingStatus,
} from '../services/marketing.js';

const mockFindMany = vi.mocked(prisma.marketingAsset.findMany);

describe('getMarketingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all recommended assets as missing when user has no completed assets', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getMarketingStatus('user-1');

    expect(result.recommended).toEqual(RECOMMENDED_ASSETS);
    expect(result.completed).toEqual([]);
    expect(result.missing).toEqual(RECOMMENDED_ASSETS.map((a) => a.id));
    expect(result.readinessPercentage).toBe(0);
  });

  it('should return 100% readiness when all recommended assets are completed', async () => {
    const allCompleted = RECOMMENDED_ASSETS.map((asset) => ({
      type: asset.id,
    }));
    mockFindMany.mockResolvedValue(allCompleted as any);

    const result = await getMarketingStatus('user-1');

    expect(result.completed).toHaveLength(RECOMMENDED_ASSETS.length);
    expect(result.missing).toHaveLength(0);
    expect(result.readinessPercentage).toBe(100);
  });

  it('should correctly compute partial readiness percentage', async () => {
    // Complete 2 out of 6 recommended assets
    mockFindMany.mockResolvedValue([
      { type: 'landing_page' },
      { type: 'social_twitter' },
    ] as any);

    const result = await getMarketingStatus('user-1');

    expect(result.completed).toEqual(['landing_page', 'social_twitter']);
    expect(result.missing).not.toContain('landing_page');
    expect(result.missing).not.toContain('social_twitter');
    expect(result.readinessPercentage).toBe(Math.round((2 / RECOMMENDED_ASSETS.length) * 100));
  });

  it('should ignore unknown asset types not in the recommended set', async () => {
    mockFindMany.mockResolvedValue([
      { type: 'landing_page' },
      { type: 'unknown-custom-asset' },
    ] as any);

    const result = await getMarketingStatus('user-1');

    // Only landing_page counts as completed (it's in the recommended set)
    expect(result.completed).toEqual(['landing_page']);
    expect(result.readinessPercentage).toBe(Math.round((1 / RECOMMENDED_ASSETS.length) * 100));
  });

  it('should query database with correct user ID and status filter', async () => {
    mockFindMany.mockResolvedValue([]);

    await getMarketingStatus('test-user-id');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'test-user-id',
        status: 'completed',
      },
      select: {
        type: true,
      },
    });
  });

  it('should always include the full recommended assets list in the response', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getMarketingStatus('user-1');

    expect(result.recommended).toBe(RECOMMENDED_ASSETS);
    expect(result.recommended.length).toBeGreaterThan(0);
    for (const asset of result.recommended) {
      expect(asset).toHaveProperty('id');
      expect(asset).toHaveProperty('name');
      expect(asset).toHaveProperty('description');
      expect(asset).toHaveProperty('effort');
      expect(asset).toHaveProperty('priority');
    }
  });

  it('should return missing as complement of completed within recommended set', async () => {
    const firstTwo = RECOMMENDED_ASSETS.slice(0, 2).map((a) => ({ type: a.id }));
    mockFindMany.mockResolvedValue(firstTwo as any);

    const result = await getMarketingStatus('user-1');

    // completed + missing should equal the full recommended set
    const allIds = [...result.completed, ...result.missing].sort();
    const recommendedIds = RECOMMENDED_ASSETS.map((a) => a.id).sort();
    expect(allIds).toEqual(recommendedIds);
  });
});

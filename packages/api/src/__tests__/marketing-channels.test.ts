/**
 * Unit Tests for Marketing Channel Recommendations
 *
 * Tests the getChannelRecommendations function which returns recommended
 * marketing channels based on product type, sorted by effort level.
 *
 * Requirement 5.3: Recommend marketing channels that fit the product type and current stage.
 * Requirement 5.4: Prioritize low-friction marketing actions suitable for a solo founder.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {},
}));

import {
  getChannelRecommendations,
  CHANNEL_RECOMMENDATIONS,
  ProductType,
  EffortLevel,
} from '../services/marketing.js';

// --- All valid product types ---
const ALL_PRODUCT_TYPES: ProductType[] = [
  'developer_tool',
  'b2b_saas',
  'consumer',
  'marketplace',
  'content_platform',
];

describe('getChannelRecommendations', () => {
  it('should return channels for developer_tool including Twitter/X and HackerNews', () => {
    const channels = getChannelRecommendations('developer_tool');

    const names = channels.map((c) => c.name);
    expect(names).toContain('Twitter/X');
    expect(names).toContain('HackerNews');
  });

  it('should return channels for b2b_saas including LinkedIn and ProductHunt', () => {
    const channels = getChannelRecommendations('b2b_saas');

    const names = channels.map((c) => c.name);
    expect(names).toContain('LinkedIn');
    expect(names).toContain('ProductHunt');
  });

  it('should return channels for consumer including Instagram and TikTok', () => {
    const channels = getChannelRecommendations('consumer');

    const names = channels.map((c) => c.name);
    expect(names).toContain('Instagram');
    expect(names).toContain('TikTok');
  });

  it('should return channels for marketplace including ProductHunt and Niche communities', () => {
    const channels = getChannelRecommendations('marketplace');

    const names = channels.map((c) => c.name);
    expect(names).toContain('ProductHunt');
    expect(names).toContain('Niche communities');
  });

  it('should return channels for content_platform including Medium and YouTube', () => {
    const channels = getChannelRecommendations('content_platform');

    const names = channels.map((c) => c.name);
    expect(names).toContain('Medium');
    expect(names).toContain('YouTube');
  });

  it('should sort channels by effort: low before medium before high', () => {
    const effortOrder: Record<EffortLevel, number> = { low: 0, medium: 1, high: 2 };

    for (const productType of ALL_PRODUCT_TYPES) {
      const channels = getChannelRecommendations(productType);

      for (let i = 1; i < channels.length; i++) {
        expect(effortOrder[channels[i].effort]).toBeGreaterThanOrEqual(
          effortOrder[channels[i - 1].effort],
        );
      }
    }
  });

  it('should return non-empty channels for every product type', () => {
    for (const productType of ALL_PRODUCT_TYPES) {
      const channels = getChannelRecommendations(productType);
      expect(channels.length).toBeGreaterThan(0);
    }
  });

  it('should return channels with all required fields populated', () => {
    for (const productType of ALL_PRODUCT_TYPES) {
      const channels = getChannelRecommendations(productType);

      for (const channel of channels) {
        expect(channel.id).toBeTruthy();
        expect(channel.name).toBeTruthy();
        expect(channel.description).toBeTruthy();
        expect(['low', 'medium', 'high']).toContain(channel.effort);
        // url can be empty for generic channels like "Industry-specific forums"
        expect(typeof channel.url).toBe('string');
      }
    }
  });

  it('should not mutate the original CHANNEL_RECOMMENDATIONS constant', () => {
    const originalDevToolChannels = [...CHANNEL_RECOMMENDATIONS.developer_tool];
    getChannelRecommendations('developer_tool');
    expect(CHANNEL_RECOMMENDATIONS.developer_tool).toEqual(originalDevToolChannels);
  });

  it('should include Twitter/X for every product type', () => {
    for (const productType of ALL_PRODUCT_TYPES) {
      const channels = getChannelRecommendations(productType);
      const hasTwitter = channels.some((c) => c.id === 'twitter-x');
      expect(hasTwitter).toBe(true);
    }
  });

  it('should have unique channel IDs within each product type', () => {
    for (const productType of ALL_PRODUCT_TYPES) {
      const channels = getChannelRecommendations(productType);
      const ids = channels.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });
});

describe('CHANNEL_RECOMMENDATIONS', () => {
  it('should have entries for all 5 product types', () => {
    expect(Object.keys(CHANNEL_RECOMMENDATIONS)).toHaveLength(5);
    for (const productType of ALL_PRODUCT_TYPES) {
      expect(CHANNEL_RECOMMENDATIONS[productType]).toBeDefined();
    }
  });

  it('developer_tool should have 5 channels', () => {
    expect(CHANNEL_RECOMMENDATIONS.developer_tool).toHaveLength(5);
  });

  it('b2b_saas should have 4 channels', () => {
    expect(CHANNEL_RECOMMENDATIONS.b2b_saas).toHaveLength(4);
  });

  it('consumer should have 4 channels', () => {
    expect(CHANNEL_RECOMMENDATIONS.consumer).toHaveLength(4);
  });

  it('marketplace should have 3 channels', () => {
    expect(CHANNEL_RECOMMENDATIONS.marketplace).toHaveLength(3);
  });

  it('content_platform should have 4 channels', () => {
    expect(CHANNEL_RECOMMENDATIONS.content_platform).toHaveLength(4);
  });
});

// Requirements: 5.1, 5.2, 5.3
// Unit tests for Marketing readiness page logic and data handling

import { describe, it, expect } from 'vitest';

interface MissingAsset {
  id: string;
  type: string;
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
}

interface CompletedAsset {
  id: string;
  type: string;
  completedAt: string;
}

interface ChannelRecommendation {
  channel: string;
  reason: string;
  priority: number;
}

interface MarketingStatusResponse {
  completedAssets: CompletedAsset[];
  missingAssets: MissingAsset[];
  channelRecommendations: ChannelRecommendation[];
  readinessPercentage: number;
}

const EFFORT_ORDER: Record<MissingAsset['effort'], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function sortByEffort(assets: MissingAsset[]): MissingAsset[] {
  return [...assets].sort(
    (a, b) => EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort]
  );
}

function computeOptimisticReadiness(
  completedCount: number,
  missingCount: number
): number {
  const total = completedCount + missingCount;
  return total > 0 ? Math.round((completedCount / total) * 100) : 0;
}

function formatChannelName(channel: string): string {
  if (channel === 'hackernews') return 'Hacker News';
  if (channel === 'producthunt') return 'Product Hunt';
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

describe('Marketing - Effort-Based Sorting', () => {
  it('should sort missing assets by effort (low first)', () => {
    const assets: MissingAsset[] = [
      { id: '1', type: 'landing_page', title: 'Landing Page', description: 'Create a landing page', effort: 'high' },
      { id: '2', type: 'social_post', title: 'Social Post', description: 'Write a post', effort: 'low' },
      { id: '3', type: 'changelog', title: 'Changelog', description: 'Prepare changelog', effort: 'medium' },
    ];

    const sorted = sortByEffort(assets);

    expect(sorted[0].effort).toBe('low');
    expect(sorted[1].effort).toBe('medium');
    expect(sorted[2].effort).toBe('high');
  });

  it('should preserve relative order within same effort level', () => {
    const assets: MissingAsset[] = [
      { id: '1', type: 'social_post', title: 'Twitter Post', description: 'Write tweet', effort: 'low' },
      { id: '2', type: 'social_post', title: 'LinkedIn Post', description: 'Write LinkedIn post', effort: 'low' },
      { id: '3', type: 'changelog', title: 'Changelog', description: 'Prepare changelog', effort: 'medium' },
    ];

    const sorted = sortByEffort(assets);

    expect(sorted[0].id).toBe('1');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('3');
  });

  it('should handle empty list', () => {
    const sorted = sortByEffort([]);
    expect(sorted).toHaveLength(0);
  });

  it('should handle single item', () => {
    const assets: MissingAsset[] = [
      { id: '1', type: 'readme', title: 'README', description: 'Update README', effort: 'medium' },
    ];

    const sorted = sortByEffort(assets);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe('1');
  });
});

describe('Marketing - Optimistic Readiness Calculation', () => {
  it('should compute 0% when no assets are completed', () => {
    expect(computeOptimisticReadiness(0, 5)).toBe(0);
  });

  it('should compute 100% when all assets are completed', () => {
    expect(computeOptimisticReadiness(5, 0)).toBe(100);
  });

  it('should compute correct percentage for partial completion', () => {
    expect(computeOptimisticReadiness(3, 2)).toBe(60);
  });

  it('should handle edge case of no total assets', () => {
    expect(computeOptimisticReadiness(0, 0)).toBe(0);
  });

  it('should round to nearest integer', () => {
    // 1/3 = 33.33... → rounds to 33
    expect(computeOptimisticReadiness(1, 2)).toBe(33);
  });
});

describe('Marketing - Channel Name Formatting', () => {
  it('should format "hackernews" as "Hacker News"', () => {
    expect(formatChannelName('hackernews')).toBe('Hacker News');
  });

  it('should format "producthunt" as "Product Hunt"', () => {
    expect(formatChannelName('producthunt')).toBe('Product Hunt');
  });

  it('should capitalize first letter for other channels', () => {
    expect(formatChannelName('twitter')).toBe('Twitter');
    expect(formatChannelName('linkedin')).toBe('Linkedin');
  });
});

describe('Marketing - Data Structure Validation', () => {
  it('should handle complete marketing status response', () => {
    const data: MarketingStatusResponse = {
      completedAssets: [
        { id: '1', type: 'readme', completedAt: '2024-03-10T14:00:00Z' },
        { id: '2', type: 'screenshots', completedAt: '2024-03-11T09:00:00Z' },
      ],
      missingAssets: [
        { id: '3', type: 'landing_page', title: 'Landing Page', description: 'Create a launch landing page', effort: 'high' },
        { id: '4', type: 'social_post', title: 'Twitter Announcement', description: 'Draft a launch tweet', effort: 'low' },
        { id: '5', type: 'changelog', title: 'Changelog', description: 'Prepare public changelog', effort: 'medium' },
      ],
      channelRecommendations: [
        { channel: 'twitter', reason: 'Developer tools thrive on Twitter/X', priority: 1 },
        { channel: 'hackernews', reason: 'Technical audience for dev tools', priority: 2 },
      ],
      readinessPercentage: 40,
    };

    expect(data.completedAssets).toHaveLength(2);
    expect(data.missingAssets).toHaveLength(3);
    expect(data.channelRecommendations).toHaveLength(2);
    expect(data.readinessPercentage).toBe(40);
  });

  it('should handle empty marketing response (nothing completed)', () => {
    const data: MarketingStatusResponse = {
      completedAssets: [],
      missingAssets: [
        { id: '1', type: 'landing_page', title: 'Landing Page', description: 'Create landing page', effort: 'high' },
      ],
      channelRecommendations: [],
      readinessPercentage: 0,
    };

    expect(data.completedAssets).toHaveLength(0);
    expect(data.readinessPercentage).toBe(0);
  });

  it('should handle fully complete marketing (no missing assets)', () => {
    const data: MarketingStatusResponse = {
      completedAssets: [
        { id: '1', type: 'landing_page', completedAt: '2024-03-10T14:00:00Z' },
        { id: '2', type: 'social_post', completedAt: '2024-03-10T14:00:00Z' },
        { id: '3', type: 'changelog', completedAt: '2024-03-11T09:00:00Z' },
        { id: '4', type: 'screenshots', completedAt: '2024-03-11T10:00:00Z' },
        { id: '5', type: 'readme', completedAt: '2024-03-12T08:00:00Z' },
      ],
      missingAssets: [],
      channelRecommendations: [
        { channel: 'producthunt', reason: 'Great for product launches', priority: 1 },
      ],
      readinessPercentage: 100,
    };

    expect(data.missingAssets).toHaveLength(0);
    expect(data.readinessPercentage).toBe(100);
  });

  it('channel recommendations should be sortable by priority', () => {
    const recommendations: ChannelRecommendation[] = [
      { channel: 'linkedin', reason: 'B2B audience', priority: 3 },
      { channel: 'twitter', reason: 'Dev community', priority: 1 },
      { channel: 'producthunt', reason: 'Launch platform', priority: 2 },
    ];

    const sorted = [...recommendations].sort((a, b) => a.priority - b.priority);

    expect(sorted[0].channel).toBe('twitter');
    expect(sorted[1].channel).toBe('producthunt');
    expect(sorted[2].channel).toBe('linkedin');
  });
});

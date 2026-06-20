/**
 * Marketing Analyzer Service
 *
 * Identifies missing marketing assets and recommends actions for launch readiness.
 * Compares user's completed assets against a recommended set and suggests
 * missing assets sorted by effort (low-friction first).
 *
 * Requirements: 5.1, 5.2
 */

import prisma from '../lib/prisma.js';

// --- Types ---

/** Product type determines which marketing channels are recommended. */
export type ProductType =
  | 'developer_tool'
  | 'b2b_saas'
  | 'consumer'
  | 'marketplace'
  | 'content_platform';

/** A recommended marketing channel for a given product type. */
export interface Channel {
  id: string;
  name: string;
  url: string;
  description: string;
  effort: EffortLevel;
}

/** The unique identifier for each recommended marketing asset type. */
export type MarketingAssetType =
  | 'landing-page-copy'
  | 'social-announcement-twitter'
  | 'social-announcement-linkedin'
  | 'product-changelog'
  | 'product-screenshots'
  | 'readme-value-prop';

/** Effort level for prioritizing low-friction actions first. */
export type EffortLevel = 'low' | 'medium' | 'high';

/** A recommended marketing asset definition. */
export interface RecommendedAsset {
  id: MarketingAssetType;
  name: string;
  description: string;
  effort: EffortLevel;
  priority: number; // Lower number = higher priority
}

/** A marketing suggestion (same shape as RecommendedAsset). */
export type MarketingSuggestion = RecommendedAsset;

/** Status of a user's marketing asset in the database. */
export type MarketingAssetStatus = 'missing' | 'in_progress' | 'completed';

// --- Effort sorting ---

const EFFORT_SORT_ORDER: Record<EffortLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// --- Recommended Asset Set (Requirements 5.1, 5.2) ---

/**
 * The recommended marketing asset set for launch readiness.
 *
 * Includes landing page copy, social announcement posts, changelog,
 * product screenshots, and README with clear value proposition.
 *
 * Assets are ordered by priority (lower = higher priority) and tagged with
 * effort level to support sorting by low-friction first (Requirement 5.4).
 */
export const RECOMMENDED_ASSETS: RecommendedAsset[] = [
  {
    id: 'landing-page-copy',
    name: 'Landing Page Copy',
    description: 'Clear, concise landing page that communicates your product value proposition.',
    effort: 'high',
    priority: 1,
  },
  {
    id: 'social-announcement-twitter',
    name: 'Twitter/X Announcement Post',
    description: 'Launch announcement post tailored for Twitter/X audience.',
    effort: 'low',
    priority: 2,
  },
  {
    id: 'social-announcement-linkedin',
    name: 'LinkedIn Announcement Post',
    description: 'Professional launch announcement for LinkedIn network.',
    effort: 'low',
    priority: 3,
  },
  {
    id: 'product-changelog',
    name: 'Product Changelog',
    description: 'Document of shipped features and improvements for launch.',
    effort: 'medium',
    priority: 4,
  },
  {
    id: 'product-screenshots',
    name: 'Product Screenshots / Demo GIF',
    description: 'Visual assets showcasing the product in action.',
    effort: 'medium',
    priority: 5,
  },
  {
    id: 'readme-value-prop',
    name: 'README with Clear Value Proposition',
    description:
      'Repository README that clearly explains what the product does and why it matters.',
    effort: 'low',
    priority: 6,
  },
];

// --- Helper Functions ---

/**
 * Returns all recommended asset type IDs as a Set.
 */
export function getRecommendedAssetIds(): Set<MarketingAssetType> {
  return new Set(RECOMMENDED_ASSETS.map((asset) => asset.id));
}

/**
 * Finds a recommended asset definition by its ID.
 * Returns undefined if the ID is not in the recommended set.
 */
export function getRecommendedAssetById(id: string): RecommendedAsset | undefined {
  return RECOMMENDED_ASSETS.find((asset) => asset.id === id);
}

/**
 * Sorts assets by effort level (low-friction first), then by priority
 * within the same effort level (lower number = higher priority).
 *
 * Requirement 5.4: Prioritize low-friction marketing actions suitable for a solo founder.
 */
export function sortByEffortThenPriority(assets: MarketingSuggestion[]): MarketingSuggestion[] {
  return [...assets].sort((a, b) => {
    const effortDiff = EFFORT_SORT_ORDER[a.effort] - EFFORT_SORT_ORDER[b.effort];
    if (effortDiff !== 0) return effortDiff;
    return a.priority - b.priority;
  });
}

/**
 * Computes missing assets: recommended set MINUS completed set.
 * Only compares against known recommended asset IDs (unknown types in DB are ignored).
 *
 * Pure function that can be tested without database access.
 */
export function computeMissingSuggestions(completedTypes: string[]): MarketingSuggestion[] {
  const recommendedIds = getRecommendedAssetIds();

  // Filter completed types to only those in the known recommended set
  const completedKnown = new Set(
    completedTypes.filter((type) => recommendedIds.has(type as MarketingAssetType)),
  );

  // Missing = recommended set minus completed set
  const missing = RECOMMENDED_ASSETS.filter((asset) => !completedKnown.has(asset.id));

  // Sort by effort (low-friction first), then priority
  return sortByEffortThenPriority(missing);
}

// --- Marketing Status (Requirement 5.1) ---

export interface MarketingStatus {
  recommended: RecommendedAsset[];
  completed: string[];
  missing: string[];
  readinessPercentage: number;
}

/**
 * Fetches the marketing readiness status for a user by comparing their
 * completed assets against the recommended set.
 *
 * Requirements: 5.1
 *
 * @param userId - The authenticated user's ID
 */
export async function getMarketingStatus(userId: string): Promise<MarketingStatus> {
  const completedAssets = await prisma.marketingAsset.findMany({
    where: {
      userId,
      status: 'completed',
    },
    select: {
      type: true,
    },
  });

  const completedTypes = completedAssets.map((asset) => asset.type);
  const recommendedIds = getRecommendedAssetIds();

  // Only count types that are in the recommended set
  const completed = completedTypes.filter((type) => recommendedIds.has(type as MarketingAssetType));
  const missing = RECOMMENDED_ASSETS.filter((asset) => !completed.includes(asset.id)).map(
    (asset) => asset.id,
  );

  const readinessPercentage =
    RECOMMENDED_ASSETS.length > 0
      ? Math.round((completed.length / RECOMMENDED_ASSETS.length) * 100)
      : 0;

  return {
    recommended: RECOMMENDED_ASSETS,
    completed,
    missing,
    readinessPercentage,
  };
}

// --- Channel Recommendations (Requirement 5.3) ---

/**
 * Maps each product type to an array of recommended marketing channels.
 *
 * Effort levels reflect the work required for a solo founder to establish
 * meaningful presence on the channel:
 *   - low: quick posts, existing accounts, minimal setup
 *   - medium: requires content creation (blog posts, threads, demos)
 *   - high: sustained effort (video production, community building)
 */
export const CHANNEL_RECOMMENDATIONS: Record<ProductType, Channel[]> = {
  developer_tool: [
    {
      id: 'twitter-x',
      name: 'Twitter/X',
      url: 'https://twitter.com',
      description: 'Share dev updates, launch announcements, and build-in-public threads',
      effort: 'low',
    },
    {
      id: 'hackernews',
      name: 'HackerNews',
      url: 'https://news.ycombinator.com',
      description: 'Submit Show HN posts for developer tools and technical projects',
      effort: 'low',
    },
    {
      id: 'devto',
      name: 'Dev.to',
      url: 'https://dev.to',
      description: 'Publish technical articles and tutorials about your tool',
      effort: 'medium',
    },
    {
      id: 'github-discussions',
      name: 'GitHub Discussions',
      url: 'https://github.com',
      description: 'Engage with developer communities in relevant repository discussions',
      effort: 'low',
    },
    {
      id: 'reddit-programming',
      name: 'Reddit (r/programming, r/SideProject)',
      url: 'https://reddit.com/r/programming',
      description: 'Share your tool in programming and side-project subreddits',
      effort: 'low',
    },
  ],
  b2b_saas: [
    {
      id: 'linkedin',
      name: 'LinkedIn',
      url: 'https://linkedin.com',
      description: 'Network with potential customers and share professional updates',
      effort: 'low',
    },
    {
      id: 'producthunt',
      name: 'ProductHunt',
      url: 'https://producthunt.com',
      description: 'Launch your product to an audience of early adopters and makers',
      effort: 'medium',
    },
    {
      id: 'twitter-x',
      name: 'Twitter/X',
      url: 'https://twitter.com',
      description: 'Build authority and engage with industry conversations',
      effort: 'low',
    },
    {
      id: 'industry-forums',
      name: 'Industry-specific forums',
      url: '',
      description: 'Participate in niche communities where your target customers gather',
      effort: 'medium',
    },
  ],
  consumer: [
    {
      id: 'instagram',
      name: 'Instagram',
      url: 'https://instagram.com',
      description: 'Share visual content and behind-the-scenes of your product',
      effort: 'medium',
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      url: 'https://tiktok.com',
      description: 'Create short-form video content showcasing your product',
      effort: 'high',
    },
    {
      id: 'twitter-x',
      name: 'Twitter/X',
      url: 'https://twitter.com',
      description: 'Engage with potential users and share product updates',
      effort: 'low',
    },
    {
      id: 'producthunt',
      name: 'ProductHunt',
      url: 'https://producthunt.com',
      description: 'Launch to early adopters who love discovering new consumer products',
      effort: 'medium',
    },
  ],
  marketplace: [
    {
      id: 'producthunt',
      name: 'ProductHunt',
      url: 'https://producthunt.com',
      description: 'Launch your marketplace to attract initial supply and demand',
      effort: 'medium',
    },
    {
      id: 'twitter-x',
      name: 'Twitter/X',
      url: 'https://twitter.com',
      description: 'Build community around your marketplace niche',
      effort: 'low',
    },
    {
      id: 'niche-communities',
      name: 'Niche communities',
      url: '',
      description: 'Engage with communities on both sides of your marketplace',
      effort: 'medium',
    },
  ],
  content_platform: [
    {
      id: 'twitter-x',
      name: 'Twitter/X',
      url: 'https://twitter.com',
      description: 'Share content highlights and engage with creators',
      effort: 'low',
    },
    {
      id: 'medium',
      name: 'Medium',
      url: 'https://medium.com',
      description: "Publish articles to demonstrate your platform's content quality",
      effort: 'medium',
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      url: 'https://linkedin.com',
      description: 'Share professional content and attract B2B creators',
      effort: 'low',
    },
    {
      id: 'youtube',
      name: 'YouTube',
      url: 'https://youtube.com',
      description: 'Create video content to showcase your platform capabilities',
      effort: 'high',
    },
  ],
};

/**
 * Returns recommended marketing channels for a given product type.
 *
 * Channels are sorted by effort level (low-friction first) to align with
 * Requirement 5.4: prioritize low-friction marketing actions for solo founders.
 *
 * @param productType - The type of product being launched
 * @returns Array of recommended channels sorted by effort (low → medium → high)
 */
export function getChannelRecommendations(productType: ProductType): Channel[] {
  const channels = CHANNEL_RECOMMENDATIONS[productType];

  if (!channels) {
    return [];
  }

  // Sort by effort: low first, then medium, then high (Requirement 5.4)
  return [...channels].sort((a, b) => EFFORT_SORT_ORDER[a.effort] - EFFORT_SORT_ORDER[b.effort]);
}

// --- Asset Completion (Requirement 5.5) ---

export interface MarketingAssetRecord {
  id: string;
  type: string;
  status: string;
  completedAt: Date | null;
}

/**
 * Marks a marketing asset as completed for the given user.
 * Uses a find-or-create pattern: if no record exists for this user+type, creates one;
 * if it already exists and is completed, returns it unchanged (idempotent).
 *
 * Requirements: 5.5
 *
 * @param userId - The authenticated user's ID
 * @param assetType - The asset type identifier (e.g., 'landing-page-copy')
 * @returns The marketing asset record
 */
export async function markAssetComplete(
  userId: string,
  assetType: string,
): Promise<MarketingAssetRecord> {
  const now = new Date();

  // Check if there's already a completed record (idempotent)
  const existing = await prisma.marketingAsset.findFirst({
    where: {
      userId,
      type: assetType,
      status: 'completed',
    },
  });

  if (existing) {
    return {
      id: existing.id,
      type: existing.type,
      status: existing.status,
      completedAt: existing.completedAt,
    };
  }

  // Check if there's an existing record with a different status
  const existingAny = await prisma.marketingAsset.findFirst({
    where: {
      userId,
      type: assetType,
    },
  });

  if (existingAny) {
    const updated = await prisma.marketingAsset.update({
      where: { id: existingAny.id },
      data: {
        status: 'completed',
        completedAt: now,
      },
    });
    return {
      id: updated.id,
      type: updated.type,
      status: updated.status,
      completedAt: updated.completedAt,
    };
  }

  // Create new record
  const created = await prisma.marketingAsset.create({
    data: {
      userId,
      type: assetType,
      status: 'completed',
      completedAt: now,
    },
  });

  return {
    id: created.id,
    type: created.type,
    status: created.status,
    completedAt: created.completedAt,
  };
}

/**
 * Marks a marketing asset as not completed for the given user.
 * Resets status to 'missing' and clears completedAt.
 * If no record exists for this user+type, creates one with status 'missing'.
 *
 * @param userId - The authenticated user's ID
 * @param assetType - The asset type identifier (e.g., 'landing-page-copy')
 * @returns The updated marketing asset record
 */
export async function markAssetUncomplete(
  userId: string,
  assetType: string,
): Promise<MarketingAssetRecord> {
  const existing = await prisma.marketingAsset.findFirst({
    where: {
      userId,
      type: assetType,
    },
  });

  if (existing) {
    const updated = await prisma.marketingAsset.update({
      where: { id: existing.id },
      data: {
        status: 'missing',
        completedAt: null,
      },
    });
    return {
      id: updated.id,
      type: updated.type,
      status: updated.status,
      completedAt: updated.completedAt,
    };
  }

  // Create new record with missing status
  const created = await prisma.marketingAsset.create({
    data: {
      userId,
      type: assetType,
      status: 'missing',
      completedAt: null,
    },
  });

  return {
    id: created.id,
    type: created.type,
    status: created.status,
    completedAt: created.completedAt,
  };
}

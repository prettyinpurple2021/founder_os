/**
 * Unit tests for Marketing Analyzer suggestion logic.
 *
 * Tests the computeMissingSuggestions and sortByEffortThenPriority functions
 * to verify correct set difference calculation and effort-based sorting.
 *
 * Requirements: 5.2, 5.4
 */

import { describe, it, expect } from 'vitest';
import {
  computeMissingSuggestions,
  sortByEffortThenPriority,
  RECOMMENDED_ASSETS,
  getRecommendedAssetIds,
  type MarketingSuggestion,
  type EffortLevel,
} from '../services/marketing.js';

describe('Marketing Suggestions', () => {
  describe('computeMissingSuggestions', () => {
    it('returns all recommended assets when user has no completed assets', () => {
      const suggestions = computeMissingSuggestions([]);

      expect(suggestions).toHaveLength(RECOMMENDED_ASSETS.length);
    });

    it('returns empty array when user has all recommended assets completed', () => {
      const allTypes = RECOMMENDED_ASSETS.map((a) => a.id);
      const suggestions = computeMissingSuggestions(allTypes);

      expect(suggestions).toHaveLength(0);
    });

    it('returns only missing assets (set difference)', () => {
      const completed = ['landing-page-copy', 'social-announcement-twitter'];
      const suggestions = computeMissingSuggestions(completed);

      const suggestionIds = suggestions.map((s) => s.id);
      expect(suggestionIds).not.toContain('landing-page-copy');
      expect(suggestionIds).not.toContain('social-announcement-twitter');
      expect(suggestions).toHaveLength(RECOMMENDED_ASSETS.length - 2);
    });

    it('ignores unknown asset types in completed set', () => {
      const completed = ['unknown-asset-type', 'another-unknown'];
      const suggestions = computeMissingSuggestions(completed);

      // Unknown types are ignored, so all recommended are still missing
      expect(suggestions).toHaveLength(RECOMMENDED_ASSETS.length);
    });

    it('handles mix of known and unknown completed types', () => {
      const completed = ['landing-page-copy', 'unknown-type', 'product-changelog'];
      const suggestions = computeMissingSuggestions(completed);

      const suggestionIds = suggestions.map((s) => s.id);
      expect(suggestionIds).not.toContain('landing-page-copy');
      expect(suggestionIds).not.toContain('product-changelog');
      // unknown-type is ignored
      expect(suggestions).toHaveLength(RECOMMENDED_ASSETS.length - 2);
    });

    it('each suggestion includes id, name, description, effort, priority', () => {
      const suggestions = computeMissingSuggestions([]);

      for (const suggestion of suggestions) {
        expect(suggestion).toHaveProperty('id');
        expect(suggestion).toHaveProperty('name');
        expect(suggestion).toHaveProperty('description');
        expect(suggestion).toHaveProperty('effort');
        expect(suggestion).toHaveProperty('priority');
        expect(typeof suggestion.id).toBe('string');
        expect(typeof suggestion.name).toBe('string');
        expect(typeof suggestion.description).toBe('string');
        expect(['low', 'medium', 'high']).toContain(suggestion.effort);
        expect(typeof suggestion.priority).toBe('number');
      }
    });

    it('results are sorted by effort (low first) then priority', () => {
      const suggestions = computeMissingSuggestions([]);

      for (let i = 0; i < suggestions.length - 1; i++) {
        const current = suggestions[i];
        const next = suggestions[i + 1];
        const effortOrder: Record<EffortLevel, number> = { low: 1, medium: 2, high: 3 };

        const currentEffort = effortOrder[current.effort];
        const nextEffort = effortOrder[next.effort];

        if (currentEffort === nextEffort) {
          // Same effort level: priority should be ascending (lower = higher priority)
          expect(current.priority).toBeLessThanOrEqual(next.priority);
        } else {
          // Effort should be non-decreasing
          expect(currentEffort).toBeLessThanOrEqual(nextEffort);
        }
      }
    });
  });

  describe('sortByEffortThenPriority', () => {
    it('sorts low effort before medium before high', () => {
      const items: MarketingSuggestion[] = [
        { id: 'a', name: 'A', description: 'desc', effort: 'high', priority: 1 },
        { id: 'b', name: 'B', description: 'desc', effort: 'low', priority: 1 },
        { id: 'c', name: 'C', description: 'desc', effort: 'medium', priority: 1 },
      ];

      const sorted = sortByEffortThenPriority(items);

      expect(sorted[0].effort).toBe('low');
      expect(sorted[1].effort).toBe('medium');
      expect(sorted[2].effort).toBe('high');
    });

    it('sorts by priority within same effort level', () => {
      const items: MarketingSuggestion[] = [
        { id: 'a', name: 'A', description: 'desc', effort: 'low', priority: 3 },
        { id: 'b', name: 'B', description: 'desc', effort: 'low', priority: 1 },
        { id: 'c', name: 'C', description: 'desc', effort: 'low', priority: 2 },
      ];

      const sorted = sortByEffortThenPriority(items);

      expect(sorted[0].priority).toBe(1);
      expect(sorted[1].priority).toBe(2);
      expect(sorted[2].priority).toBe(3);
    });

    it('does not mutate the original array', () => {
      const items: MarketingSuggestion[] = [
        { id: 'a', name: 'A', description: 'desc', effort: 'high', priority: 1 },
        { id: 'b', name: 'B', description: 'desc', effort: 'low', priority: 1 },
      ];

      const original = [...items];
      sortByEffortThenPriority(items);

      expect(items).toEqual(original);
    });

    it('returns empty array for empty input', () => {
      const sorted = sortByEffortThenPriority([]);
      expect(sorted).toEqual([]);
    });
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

  describe('RECOMMENDED_ASSETS', () => {
    it('includes landing page copy', () => {
      const ids = RECOMMENDED_ASSETS.map((a) => a.id);
      expect(ids).toContain('landing-page-copy');
    });

    it('includes social announcement posts', () => {
      const ids = RECOMMENDED_ASSETS.map((a) => a.id);
      expect(ids).toContain('social-announcement-twitter');
      expect(ids).toContain('social-announcement-linkedin');
    });

    it('includes product changelog', () => {
      const ids = RECOMMENDED_ASSETS.map((a) => a.id);
      expect(ids).toContain('product-changelog');
    });

    it('includes product screenshots', () => {
      const ids = RECOMMENDED_ASSETS.map((a) => a.id);
      expect(ids).toContain('product-screenshots');
    });

    it('includes README with value proposition', () => {
      const ids = RECOMMENDED_ASSETS.map((a) => a.id);
      expect(ids).toContain('readme-value-prop');
    });
  });
});

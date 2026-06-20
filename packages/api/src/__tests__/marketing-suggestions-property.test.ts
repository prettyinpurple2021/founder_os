/**
 * Property 8: Marketing Asset Suggestions are Complement
 *
 * The set of suggested marketing assets equals the recommended set minus the completed set.
 * suggestions = recommendedAssets \ completedAssets
 * No completed asset appears in suggestions; no missing asset is omitted.
 *
 * Formally: ∀ completedSubset ⊆ RECOMMENDED_ASSETS:
 *   computeMissingSuggestions(completedSubset).ids === RECOMMENDED_ASSETS.ids \ completedSubset
 *   ∧ suggestions.length + |completedSubset ∩ recommended| === RECOMMENDED_ASSETS.length
 *
 * Validates: Requirements 5.1
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('../lib/prisma.js', () => ({ default: {} }));

import {
  computeMissingSuggestions,
  RECOMMENDED_ASSETS,
  getRecommendedAssetIds,
  type EffortLevel,
} from '../services/marketing.js';

// --- Arbitraries ---

/** All recommended asset IDs */
const ALL_RECOMMENDED_IDS = RECOMMENDED_ASSETS.map((a) => a.id);

/** Arbitrary for a subset of recommended asset IDs (any combination including empty and full) */
const recommendedSubsetArb = fc.subarray(ALL_RECOMMENDED_IDS, {
  minLength: 0,
  maxLength: ALL_RECOMMENDED_IDS.length,
});

/** Arbitrary for unknown/extra asset type strings that are NOT in the recommended set */
const unknownTypeArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !getRecommendedAssetIds().has(s as any));

/** Arbitrary for an array of unknown types (0 to 5) */
const unknownTypesArb = fc.array(unknownTypeArb, { minLength: 0, maxLength: 5 });

/** Arbitrary for a completed set that mixes known recommended IDs with unknown types */
const mixedCompletedArb = fc
  .tuple(recommendedSubsetArb, unknownTypesArb)
  .map(([known, unknown]) => [...known, ...unknown]);

// --- Effort sort order for verification ---
const EFFORT_SORT_ORDER: Record<EffortLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// --- Property Tests ---

describe('Property 8: Marketing Asset Suggestions are Complement', () => {
  it('suggestions are exactly the set difference: recommended minus completed', () => {
    fc.assert(
      fc.property(recommendedSubsetArb, (completedSubset) => {
        const suggestions = computeMissingSuggestions(completedSubset);
        const suggestionIds = new Set(suggestions.map((s) => s.id));
        const completedSet = new Set(completedSubset);
        const recommendedIds = getRecommendedAssetIds();

        // Every suggestion must be in recommended but NOT in completed
        for (const id of suggestionIds) {
          expect(recommendedIds.has(id)).toBe(true);
          expect(completedSet.has(id)).toBe(false);
        }

        // Every recommended asset that is NOT completed must appear in suggestions
        for (const id of recommendedIds) {
          if (!completedSet.has(id)) {
            expect(suggestionIds.has(id)).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('no completed asset appears in suggestions', () => {
    fc.assert(
      fc.property(recommendedSubsetArb, (completedSubset) => {
        const suggestions = computeMissingSuggestions(completedSubset);
        const suggestionIds = suggestions.map((s) => s.id);

        for (const completedId of completedSubset) {
          expect(suggestionIds).not.toContain(completedId);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('no missing asset is absent from suggestions', () => {
    fc.assert(
      fc.property(recommendedSubsetArb, (completedSubset) => {
        const suggestions = computeMissingSuggestions(completedSubset);
        const suggestionIds = new Set(suggestions.map((s) => s.id));
        const completedSet = new Set(completedSubset);

        // Every recommended asset not in completed must be in suggestions
        for (const asset of RECOMMENDED_ASSETS) {
          if (!completedSet.has(asset.id)) {
            expect(suggestionIds.has(asset.id)).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('suggestions.length + completed(within recommended).length === RECOMMENDED_ASSETS.length', () => {
    fc.assert(
      fc.property(recommendedSubsetArb, (completedSubset) => {
        const suggestions = computeMissingSuggestions(completedSubset);
        const recommendedIds = getRecommendedAssetIds();

        // Count how many completed types are actually in the recommended set
        const completedInRecommended = completedSubset.filter((id) =>
          recommendedIds.has(id as any),
        ).length;

        expect(suggestions.length + completedInRecommended).toBe(RECOMMENDED_ASSETS.length);
      }),
      { numRuns: 200 },
    );
  });

  it('unknown types in completed array do not affect suggestions', () => {
    fc.assert(
      fc.property(mixedCompletedArb, (completedWithUnknowns) => {
        const recommendedIds = getRecommendedAssetIds();

        // Separate known from unknown
        const knownCompleted = completedWithUnknowns.filter((id) => recommendedIds.has(id as any));

        // Suggestions with mixed input should equal suggestions with only known input
        const suggestionsWithMixed = computeMissingSuggestions(completedWithUnknowns);
        const suggestionsWithKnownOnly = computeMissingSuggestions(knownCompleted);

        const mixedIds = suggestionsWithMixed.map((s) => s.id);
        const knownOnlyIds = suggestionsWithKnownOnly.map((s) => s.id);

        expect(mixedIds).toEqual(knownOnlyIds);
      }),
      { numRuns: 200 },
    );
  });

  it('output is always sorted by effort then priority for any input', () => {
    fc.assert(
      fc.property(mixedCompletedArb, (completedTypes) => {
        const suggestions = computeMissingSuggestions(completedTypes);

        // Verify sort invariant: effort ascending, then priority ascending within same effort
        for (let i = 0; i < suggestions.length - 1; i++) {
          const current = suggestions[i];
          const next = suggestions[i + 1];

          const currentEffort = EFFORT_SORT_ORDER[current.effort];
          const nextEffort = EFFORT_SORT_ORDER[next.effort];

          if (currentEffort === nextEffort) {
            // Same effort: priority should be non-decreasing
            expect(current.priority).toBeLessThanOrEqual(next.priority);
          } else {
            // Effort should be non-decreasing
            expect(currentEffort).toBeLessThan(nextEffort);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

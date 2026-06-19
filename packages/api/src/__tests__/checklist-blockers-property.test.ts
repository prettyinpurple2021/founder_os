/**
 * Property 7: Blockers-First Ordering
 *
 * All blocker items appear before all non-blocker items in the rendered checklist.
 * Formally: ∀ i,j: items[i].isBlocker ∧ ¬items[j].isBlocker → indexOf(i) < indexOf(j)
 *
 * Validates: Requirements 4.3
 *
 * This test verifies:
 * 1. After calling sortChecklistBlockersFirst(), ALL blocker items appear BEFORE all non-blocker items
 * 2. The function preserves all items (no items lost or duplicated)
 * 3. Relative order within blocker group and non-blocker group is preserved (stable partition)
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('../lib/prisma.js', () => ({ default: {} }));

import {
  sortChecklistBlockersFirst,
  type ChecklistItem,
  type ChecklistCategory,
} from '../services/checklist.js';

// --- Arbitraries ---

const categoryArb: fc.Arbitrary<ChecklistCategory> = fc.constantFrom(
  'product',
  'quality',
  'deployment',
  'legal/admin',
  'marketing',
  'content',
);

const statusArb = fc.constantFrom(
  'complete' as const,
  'in_progress' as const,
  'blocked' as const,
  'incomplete' as const,
);

const checklistItemArb: fc.Arbitrary<ChecklistItem> = fc.record({
  id: fc.uuid(),
  category: categoryArb,
  description: fc.string({ minLength: 1, maxLength: 100 }),
  status: statusArb,
  isBlocker: fc.boolean(),
  blockerReason: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
  priority: fc.integer({ min: 1, max: 100 }),
});

const checklistItemsArb = fc.array(checklistItemArb, { minLength: 0, maxLength: 20 });

// --- Tests ---

describe('Property: Blockers-First Ordering', () => {
  it('all blocker items appear before all non-blocker items in sorted output', () => {
    fc.assert(
      fc.property(checklistItemsArb, (items) => {
        const sorted = sortChecklistBlockersFirst(items);

        // Find the indices of blockers and non-blockers in the sorted result
        const blockerIndices: number[] = [];
        const nonBlockerIndices: number[] = [];

        sorted.forEach((item, idx) => {
          if (item.isBlocker) {
            blockerIndices.push(idx);
          } else {
            nonBlockerIndices.push(idx);
          }
        });

        // PROPERTY: For all pairs (i, j) where items[i].isBlocker=true and
        // items[j].isBlocker=false, indexOf(i) < indexOf(j)
        for (const bi of blockerIndices) {
          for (const ni of nonBlockerIndices) {
            expect(bi).toBeLessThan(ni);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('preserves all items — no items lost or duplicated', () => {
    fc.assert(
      fc.property(checklistItemsArb, (items) => {
        const sorted = sortChecklistBlockersFirst(items);

        // PROPERTY: output length equals input length
        expect(sorted.length).toBe(items.length);

        // PROPERTY: every input item appears exactly once in output (by id)
        const inputIds = items.map((i) => i.id).sort();
        const outputIds = sorted.map((i) => i.id).sort();
        expect(outputIds).toEqual(inputIds);
      }),
      { numRuns: 300 },
    );
  });

  it('relative order within blocker group and non-blocker group is preserved (stable partition)', () => {
    fc.assert(
      fc.property(checklistItemsArb, (items) => {
        const sorted = sortChecklistBlockersFirst(items);

        // Extract blockers and non-blockers from the original in their original order
        const originalBlockerIds = items.filter((i) => i.isBlocker).map((i) => i.id);
        const originalNonBlockerIds = items.filter((i) => !i.isBlocker).map((i) => i.id);

        // Extract blockers and non-blockers from the sorted result
        const sortedBlockerIds = sorted.filter((i) => i.isBlocker).map((i) => i.id);
        const sortedNonBlockerIds = sorted.filter((i) => !i.isBlocker).map((i) => i.id);

        // PROPERTY: relative order within each group is preserved
        expect(sortedBlockerIds).toEqual(originalBlockerIds);
        expect(sortedNonBlockerIds).toEqual(originalNonBlockerIds);
      }),
      { numRuns: 300 },
    );
  });
});

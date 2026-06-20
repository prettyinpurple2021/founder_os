/**
 * Unit tests for checklist blockers-first ordering
 *
 * Validates: Requirements 4.3
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {},
}));

import { sortChecklistBlockersFirst, type ChecklistItem } from '../services/checklist.js';

function makeItem(overrides: Partial<ChecklistItem> & { id: string }): ChecklistItem {
  return {
    category: 'product',
    description: `Item ${overrides.id}`,
    status: 'incomplete',
    isBlocker: false,
    priority: 1,
    ...overrides,
  };
}

describe('sortChecklistBlockersFirst', () => {
  it('returns an empty array when given an empty array', () => {
    const result = sortChecklistBlockersFirst([]);
    expect(result).toEqual([]);
  });

  it('returns items unchanged when all are blockers', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', isBlocker: true, priority: 1 }),
      makeItem({ id: '2', isBlocker: true, priority: 2 }),
      makeItem({ id: '3', isBlocker: true, priority: 3 }),
    ];
    const result = sortChecklistBlockersFirst(items);
    expect(result.map((i) => i.id)).toEqual(['1', '2', '3']);
  });

  it('returns items unchanged when none are blockers', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', isBlocker: false, priority: 1 }),
      makeItem({ id: '2', isBlocker: false, priority: 2 }),
      makeItem({ id: '3', isBlocker: false, priority: 3 }),
    ];
    const result = sortChecklistBlockersFirst(items);
    expect(result.map((i) => i.id)).toEqual(['1', '2', '3']);
  });

  it('places all blockers before all non-blockers', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: 'a', isBlocker: false, priority: 1 }),
      makeItem({ id: 'b', isBlocker: true, priority: 2 }),
      makeItem({ id: 'c', isBlocker: false, priority: 3 }),
      makeItem({ id: 'd', isBlocker: true, priority: 4 }),
    ];
    const result = sortChecklistBlockersFirst(items);
    // All blockers first, then non-blockers
    expect(result.map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
    // Verify the invariant: every blocker index < every non-blocker index
    const blockerIndices = result
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.isBlocker)
      .map(({ idx }) => idx);
    const nonBlockerIndices = result
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !item.isBlocker)
      .map(({ idx }) => idx);
    for (const bi of blockerIndices) {
      for (const ni of nonBlockerIndices) {
        expect(bi).toBeLessThan(ni);
      }
    }
  });

  it('preserves relative order of blockers (stable within group)', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: 'b1', isBlocker: true, priority: 3 }),
      makeItem({ id: 'n1', isBlocker: false, priority: 1 }),
      makeItem({ id: 'b2', isBlocker: true, priority: 1 }),
      makeItem({ id: 'n2', isBlocker: false, priority: 2 }),
      makeItem({ id: 'b3', isBlocker: true, priority: 2 }),
    ];
    const result = sortChecklistBlockersFirst(items);
    const blockerIds = result.filter((i) => i.isBlocker).map((i) => i.id);
    const nonBlockerIds = result.filter((i) => !i.isBlocker).map((i) => i.id);
    // Original order of blockers: b1, b2, b3
    expect(blockerIds).toEqual(['b1', 'b2', 'b3']);
    // Original order of non-blockers: n1, n2
    expect(nonBlockerIds).toEqual(['n1', 'n2']);
  });

  it('does not mutate the input array', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', isBlocker: false, priority: 1 }),
      makeItem({ id: '2', isBlocker: true, priority: 2 }),
      makeItem({ id: '3', isBlocker: false, priority: 3 }),
    ];
    const originalOrder = items.map((i) => i.id);
    sortChecklistBlockersFirst(items);
    expect(items.map((i) => i.id)).toEqual(originalOrder);
  });

  it('handles items from different categories', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', category: 'marketing', isBlocker: false, priority: 1 }),
      makeItem({ id: '2', category: 'product', isBlocker: true, priority: 1 }),
      makeItem({ id: '3', category: 'deployment', isBlocker: false, priority: 2 }),
      makeItem({ id: '4', category: 'content', isBlocker: true, priority: 2 }),
    ];
    const result = sortChecklistBlockersFirst(items);
    // Blockers first regardless of category
    expect(result[0].id).toBe('2');
    expect(result[1].id).toBe('4');
    expect(result[2].id).toBe('1');
    expect(result[3].id).toBe('3');
  });

  it('returns a new array reference', () => {
    const items: ChecklistItem[] = [makeItem({ id: '1', isBlocker: true, priority: 1 })];
    const result = sortChecklistBlockersFirst(items);
    expect(result).not.toBe(items);
  });
});

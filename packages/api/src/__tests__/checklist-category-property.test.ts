/**
 * Property 6: Checklist Category Completeness
 *
 * Generated checklist always contains exactly 6 categories, no duplicates.
 *
 * Formally: ∀ tasks: deriveChecklistStatus(tasks).length === 6 ∧
 *           categories(result) === { product, quality, deployment, legal/admin, marketing, content } ∧
 *           unique(categories(result)).size === 6
 *
 * Validates: Requirements 4.1
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('../lib/prisma.js', () => ({ default: {} }));

import {
  deriveChecklistStatus,
  CHECKLIST_CATEGORIES,
  type TaskWithState,
  type ChecklistCategory,
} from '../services/checklist.js';

// --- Arbitraries ---

const VALID_STATES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'NEEDS_REVIEW',
  'COMPLETED',
  'UNCERTAIN',
] as const;

const VALID_CATEGORIES: ChecklistCategory[] = [
  'product',
  'quality',
  'deployment',
  'legal/admin',
  'marketing',
  'content',
];

/** Arbitrary for a task state */
const taskStateArb = fc.constantFrom(...VALID_STATES);

/** Arbitrary for a task category (may also be undefined to simulate uncategorized tasks) */
const taskCategoryArb = fc.oneof(fc.constantFrom(...VALID_CATEGORIES), fc.constant(undefined));

/** Arbitrary for a single TaskWithState */
const taskArb: fc.Arbitrary<TaskWithState> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  state: taskStateArb,
  blockerReason: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  category: taskCategoryArb,
}) as fc.Arbitrary<TaskWithState>;

/** Arbitrary for a list of tasks (0 to 30 tasks) */
const taskListArb = fc.array(taskArb, { minLength: 0, maxLength: 30 });

// --- Property Tests ---

describe('Property: Checklist Category Completeness', () => {
  it('deriveChecklistStatus always returns exactly 6 items for any task input', () => {
    fc.assert(
      fc.property(taskListArb, (tasks) => {
        const result = deriveChecklistStatus(tasks);

        // PROPERTY: Always exactly 6 items
        expect(result).toHaveLength(6);
      }),
      { numRuns: 200 },
    );
  });

  it('result always contains all required categories: product, quality, deployment, legal/admin, marketing, content', () => {
    fc.assert(
      fc.property(taskListArb, (tasks) => {
        const result = deriveChecklistStatus(tasks);
        const categories = result.map((item) => item.category);

        // PROPERTY: All 6 required categories are present
        for (const expected of VALID_CATEGORIES) {
          expect(categories).toContain(expected);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('no duplicate categories exist in the result for any task combination', () => {
    fc.assert(
      fc.property(taskListArb, (tasks) => {
        const result = deriveChecklistStatus(tasks);
        const categories = result.map((item) => item.category);
        const uniqueCategories = new Set(categories);

        // PROPERTY: No duplicates — set size equals array length
        expect(uniqueCategories.size).toBe(categories.length);
        expect(uniqueCategories.size).toBe(6);
      }),
      { numRuns: 200 },
    );
  });

  it('categories match CHECKLIST_CATEGORIES constant exactly for any input', () => {
    fc.assert(
      fc.property(taskListArb, (tasks) => {
        const result = deriveChecklistStatus(tasks);
        const categories = result.map((item) => item.category);

        // PROPERTY: Result categories match the defined constant in order
        expect(categories).toEqual(CHECKLIST_CATEGORIES);
      }),
      { numRuns: 200 },
    );
  });
});

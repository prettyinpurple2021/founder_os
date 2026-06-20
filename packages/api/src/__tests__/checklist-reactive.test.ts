/**
 * Unit Tests for Reactive Checklist Updates (Requirement 4.5)
 *
 * Validates that the checklist is re-generated fresh on each call and
 * immediately reflects task state changes within the same session.
 *
 * Since getChecklist depends on the database, these tests validate the
 * generation pipeline using the pure functions (deriveChecklistStatus,
 * sortChecklistBlockersFirst, getNextBestAction) to demonstrate reactivity.
 *
 * Requirements: 4.5
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {},
}));

import {
  deriveChecklistStatus,
  sortChecklistBlockersFirst,
  getNextBestAction,
  type TaskWithState,
} from '../services/checklist.js';

describe('Reactive Checklist Updates (Requirement 4.5)', () => {
  it('reflects task state change from NOT_STARTED to IN_PROGRESS immediately', () => {
    // Simulate first request: task is not started
    const tasksV1: TaskWithState[] = [
      { id: '1', title: 'Core Feature', state: 'NOT_STARTED', category: 'product' },
    ];
    const itemsV1 = deriveChecklistStatus(tasksV1);
    const productV1 = itemsV1.find((i) => i.category === 'product');
    expect(productV1?.status).toBe('incomplete');

    // Simulate second request after task state changes
    const tasksV2: TaskWithState[] = [
      { id: '1', title: 'Core Feature', state: 'IN_PROGRESS', category: 'product' },
    ];
    const itemsV2 = deriveChecklistStatus(tasksV2);
    const productV2 = itemsV2.find((i) => i.category === 'product');
    expect(productV2?.status).toBe('in_progress');
  });

  it('reflects task state change from IN_PROGRESS to COMPLETED immediately', () => {
    const tasksV1: TaskWithState[] = [
      { id: '1', title: 'Tests', state: 'IN_PROGRESS', category: 'quality' },
    ];
    const itemsV1 = deriveChecklistStatus(tasksV1);
    expect(itemsV1.find((i) => i.category === 'quality')?.status).toBe('in_progress');

    const tasksV2: TaskWithState[] = [
      { id: '1', title: 'Tests', state: 'COMPLETED', category: 'quality' },
    ];
    const itemsV2 = deriveChecklistStatus(tasksV2);
    expect(itemsV2.find((i) => i.category === 'quality')?.status).toBe('complete');
  });

  it('reflects task becoming BLOCKED and updates blocker ordering', () => {
    const tasksV1: TaskWithState[] = [
      { id: '1', title: 'Deploy', state: 'IN_PROGRESS', category: 'deployment' },
      { id: '2', title: 'Feature', state: 'COMPLETED', category: 'product' },
    ];
    const itemsV1 = sortChecklistBlockersFirst(deriveChecklistStatus(tasksV1));
    // No blockers initially
    expect(itemsV1.filter((i) => i.isBlocker)).toHaveLength(0);

    // Task becomes blocked
    const tasksV2: TaskWithState[] = [
      {
        id: '1',
        title: 'Deploy',
        state: 'BLOCKED',
        blockerReason: 'DNS issue',
        category: 'deployment',
      },
      { id: '2', title: 'Feature', state: 'COMPLETED', category: 'product' },
    ];
    const itemsV2 = sortChecklistBlockersFirst(deriveChecklistStatus(tasksV2));
    // Blocker now appears first
    expect(itemsV2[0].isBlocker).toBe(true);
    expect(itemsV2[0].category).toBe('deployment');
    expect(itemsV2[0].blockerReason).toBe('DNS issue');
  });

  it('updates next best action when tasks change', () => {
    // Initially product is actionable (highest priority incomplete)
    const tasksV1: TaskWithState[] = [
      { id: '1', title: 'Feature', state: 'NOT_STARTED', category: 'product' },
      { id: '2', title: 'Tests', state: 'NOT_STARTED', category: 'quality' },
    ];
    const itemsV1 = sortChecklistBlockersFirst(deriveChecklistStatus(tasksV1));
    const actionV1 = getNextBestAction(itemsV1);
    expect(actionV1?.category).toBe('product');

    // Product is now complete, next action moves to quality
    const tasksV2: TaskWithState[] = [
      { id: '1', title: 'Feature', state: 'COMPLETED', category: 'product' },
      { id: '2', title: 'Tests', state: 'NOT_STARTED', category: 'quality' },
    ];
    const itemsV2 = sortChecklistBlockersFirst(deriveChecklistStatus(tasksV2));
    const actionV2 = getNextBestAction(itemsV2);
    expect(actionV2?.category).toBe('quality');
  });

  it('readiness percentage increases as tasks are completed', () => {
    const computeReadiness = (tasks: TaskWithState[]) => {
      const items = deriveChecklistStatus(tasks);
      const complete = items.filter((i) => i.status === 'complete').length;
      return Math.round((complete / items.length) * 100);
    };

    // No tasks = 0%
    expect(computeReadiness([])).toBe(0);

    // One category complete = ~17%
    const tasks1: TaskWithState[] = [
      { id: '1', title: 'Feature', state: 'COMPLETED', category: 'product' },
    ];
    expect(computeReadiness(tasks1)).toBe(17);

    // Two categories complete = ~33%
    const tasks2: TaskWithState[] = [
      { id: '1', title: 'Feature', state: 'COMPLETED', category: 'product' },
      { id: '2', title: 'Tests', state: 'COMPLETED', category: 'quality' },
    ];
    expect(computeReadiness(tasks2)).toBe(33);
  });

  it('generates checklist with no cached state between calls', () => {
    // Calling with different task sets produces different results each time
    // This proves there's no caching/memoization
    const result1 = deriveChecklistStatus([]);
    const result2 = deriveChecklistStatus([
      { id: '1', title: 'Feature', state: 'COMPLETED', category: 'product' },
    ]);
    const result3 = deriveChecklistStatus([]);

    // Result 1 and 3 should be identical (no state leakage)
    expect(result1).toEqual(result3);
    // Result 2 should be different
    expect(result2.find((i) => i.category === 'product')?.status).toBe('complete');
    expect(result1.find((i) => i.category === 'product')?.status).toBe('incomplete');
  });
});

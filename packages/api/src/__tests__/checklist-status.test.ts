/**
 * Unit Tests for Checklist Item Status Derivation
 *
 * Tests the deriveChecklistStatus and deriveItemStatus functions which map
 * task states to checklist item statuses.
 *
 * Rules:
 *   - All related tasks COMPLETED → "complete"
 *   - Any related task BLOCKED → "blocked" (isBlocker = true)
 *   - Any task IN_PROGRESS/NEEDS_REVIEW → "in_progress"
 *   - Otherwise → "incomplete"
 *
 * Requirements: 4.2
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {},
}));

import {
  deriveChecklistStatus,
  deriveItemStatus,
  CHECKLIST_CATEGORIES,
  type TaskWithState,
  type ChecklistCategory,
} from '../services/checklist.js';

// --- deriveItemStatus ---

describe('deriveItemStatus', () => {
  it('should return "incomplete" when no tasks are provided', () => {
    const result = deriveItemStatus([]);
    expect(result.status).toBe('incomplete');
    expect(result.isBlocker).toBe(false);
    expect(result.blockerReason).toBeUndefined();
  });

  it('should return "complete" when all tasks are COMPLETED', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'COMPLETED' },
      { id: '2', title: 'Task 2', state: 'COMPLETED' },
      { id: '3', title: 'Task 3', state: 'COMPLETED' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('complete');
    expect(result.isBlocker).toBe(false);
  });

  it('should return "blocked" with isBlocker=true when any task is BLOCKED', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'COMPLETED' },
      { id: '2', title: 'Task 2', state: 'BLOCKED', blockerReason: 'Waiting on API' },
      { id: '3', title: 'Task 3', state: 'IN_PROGRESS' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('blocked');
    expect(result.isBlocker).toBe(true);
    expect(result.blockerReason).toBe('Waiting on API');
  });

  it('should return "blocked" with default reason when blockerReason is null', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'BLOCKED', blockerReason: null },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('blocked');
    expect(result.isBlocker).toBe(true);
    expect(result.blockerReason).toBe('Task is blocked');
  });

  it('should return "in_progress" when any task is IN_PROGRESS (no blocked)', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'COMPLETED' },
      { id: '2', title: 'Task 2', state: 'IN_PROGRESS' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('in_progress');
    expect(result.isBlocker).toBe(false);
  });

  it('should return "in_progress" when any task is NEEDS_REVIEW', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'NEEDS_REVIEW' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('in_progress');
    expect(result.isBlocker).toBe(false);
  });

  it('should return "incomplete" when all tasks are NOT_STARTED', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'NOT_STARTED' },
      { id: '2', title: 'Task 2', state: 'NOT_STARTED' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('incomplete');
    expect(result.isBlocker).toBe(false);
  });

  it('should return "incomplete" for UNCERTAIN tasks only', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'UNCERTAIN' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('incomplete');
    expect(result.isBlocker).toBe(false);
  });

  it('should return "complete" for a single COMPLETED task', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'COMPLETED' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('complete');
    expect(result.isBlocker).toBe(false);
  });

  it('should prioritize BLOCKED over COMPLETED (any blocked = blocked)', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'COMPLETED' },
      { id: '2', title: 'Task 2', state: 'COMPLETED' },
      { id: '3', title: 'Task 3', state: 'BLOCKED', blockerReason: 'External dep' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('blocked');
    expect(result.isBlocker).toBe(true);
  });

  it('should prioritize BLOCKED over IN_PROGRESS', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Task 1', state: 'IN_PROGRESS' },
      { id: '2', title: 'Task 2', state: 'BLOCKED', blockerReason: 'Dep' },
    ];

    const result = deriveItemStatus(tasks);
    expect(result.status).toBe('blocked');
    expect(result.isBlocker).toBe(true);
  });
});

// --- deriveChecklistStatus ---

describe('deriveChecklistStatus', () => {
  it('should return 6 checklist items (one per category) even when no tasks', () => {
    const items = deriveChecklistStatus([]);

    expect(items).toHaveLength(6);
    const categories = items.map((i) => i.category);
    expect(categories).toEqual([
      'product',
      'quality',
      'deployment',
      'legal/admin',
      'marketing',
      'content',
    ]);
  });

  it('should default all items to "incomplete" when no tasks exist', () => {
    const items = deriveChecklistStatus([]);

    for (const item of items) {
      expect(item.status).toBe('incomplete');
      expect(item.isBlocker).toBe(false);
    }
  });

  it('should derive "complete" for a category when all its tasks are COMPLETED', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Feature A', state: 'COMPLETED', category: 'product' },
      { id: '2', title: 'Feature B', state: 'COMPLETED', category: 'product' },
    ];

    const items = deriveChecklistStatus(tasks);
    const productItem = items.find((i) => i.category === 'product');

    expect(productItem?.status).toBe('complete');
    expect(productItem?.isBlocker).toBe(false);
  });

  it('should derive "blocked" for a category when any task is BLOCKED', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Deploy setup', state: 'IN_PROGRESS', category: 'deployment' },
      { id: '2', title: 'Domain config', state: 'BLOCKED', blockerReason: 'DNS propagation', category: 'deployment' },
    ];

    const items = deriveChecklistStatus(tasks);
    const deployItem = items.find((i) => i.category === 'deployment');

    expect(deployItem?.status).toBe('blocked');
    expect(deployItem?.isBlocker).toBe(true);
    expect(deployItem?.blockerReason).toBe('DNS propagation');
  });

  it('should derive "in_progress" for a category with IN_PROGRESS tasks (no blocked)', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Write tests', state: 'COMPLETED', category: 'quality' },
      { id: '2', title: 'Fix lint', state: 'IN_PROGRESS', category: 'quality' },
    ];

    const items = deriveChecklistStatus(tasks);
    const qualityItem = items.find((i) => i.category === 'quality');

    expect(qualityItem?.status).toBe('in_progress');
    expect(qualityItem?.isBlocker).toBe(false);
  });

  it('should handle tasks spread across multiple categories', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Feature', state: 'COMPLETED', category: 'product' },
      { id: '2', title: 'Tests', state: 'COMPLETED', category: 'quality' },
      { id: '3', title: 'CI/CD', state: 'IN_PROGRESS', category: 'deployment' },
      { id: '4', title: 'TOS', state: 'BLOCKED', blockerReason: 'Lawyer review', category: 'legal/admin' },
      { id: '5', title: 'Landing', state: 'NOT_STARTED', category: 'marketing' },
      { id: '6', title: 'Blog', state: 'COMPLETED', category: 'content' },
    ];

    const items = deriveChecklistStatus(tasks);

    expect(items.find((i) => i.category === 'product')?.status).toBe('complete');
    expect(items.find((i) => i.category === 'quality')?.status).toBe('complete');
    expect(items.find((i) => i.category === 'deployment')?.status).toBe('in_progress');
    expect(items.find((i) => i.category === 'legal/admin')?.status).toBe('blocked');
    expect(items.find((i) => i.category === 'legal/admin')?.isBlocker).toBe(true);
    expect(items.find((i) => i.category === 'marketing')?.status).toBe('incomplete');
    expect(items.find((i) => i.category === 'content')?.status).toBe('complete');
  });

  it('should ignore tasks without a category assignment', () => {
    const tasks: TaskWithState[] = [
      { id: '1', title: 'Uncategorized', state: 'BLOCKED', blockerReason: 'Unknown' },
      { id: '2', title: 'Product task', state: 'COMPLETED', category: 'product' },
    ];

    const items = deriveChecklistStatus(tasks);

    // The uncategorized blocked task should not affect any category
    const productItem = items.find((i) => i.category === 'product');
    expect(productItem?.status).toBe('complete');

    // All other categories remain incomplete (no tasks assigned)
    const otherItems = items.filter((i) => i.category !== 'product');
    for (const item of otherItems) {
      expect(item.status).toBe('incomplete');
      expect(item.isBlocker).toBe(false);
    }
  });

  it('should generate unique ids for each checklist item', () => {
    const items = deriveChecklistStatus([]);
    const ids = items.map((i) => i.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(6);
  });

  it('should assign priority values to each item', () => {
    const items = deriveChecklistStatus([]);

    for (const item of items) {
      expect(item.priority).toBeGreaterThan(0);
      expect(item.priority).toBeLessThanOrEqual(6);
    }
  });

  it('should include a description for each category item', () => {
    const items = deriveChecklistStatus([]);

    for (const item of items) {
      expect(item.description).toBeTruthy();
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});

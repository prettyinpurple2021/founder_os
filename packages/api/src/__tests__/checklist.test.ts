/**
 * Unit Tests for the Launch Readiness Checklist - Next Best Action
 *
 * Tests the getNextBestAction function which computes the highest-priority
 * incomplete non-blocked item from the checklist.
 *
 * Requirement 4.4: Highlight the next best action toward launch readiness.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {},
}));

import {
  getNextBestAction,
  ChecklistItem,
  ChecklistCategory,
  CHECKLIST_CATEGORIES,
} from '../services/checklist.js';

// --- Test Fixtures ---

function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 'item-1',
    description: 'Set up CI/CD pipeline',
    category: 'deployment',
    status: 'incomplete',
    priority: 1,
    isBlocker: false,
    ...overrides,
  };
}

// --- getNextBestAction Tests ---

describe('getNextBestAction', () => {
  it('should return the highest-priority (lowest number) incomplete non-blocked item', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', description: 'Low priority', priority: 5, status: 'incomplete' }),
      makeItem({ id: '2', description: 'High priority', priority: 1, status: 'incomplete' }),
      makeItem({ id: '3', description: 'Medium priority', priority: 3, status: 'incomplete' }),
    ];

    const result = getNextBestAction(items);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('2');
    expect(result!.description).toBe('High priority');
    expect(result!.priority).toBe(1);
  });

  it('should return null when all items are complete', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', status: 'complete', priority: 1 }),
      makeItem({ id: '2', status: 'complete', priority: 2 }),
      makeItem({ id: '3', status: 'complete', priority: 3 }),
    ];

    const result = getNextBestAction(items);

    expect(result).toBeNull();
  });

  it('should return null when all items are blocked', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', status: 'blocked', priority: 1, isBlocker: true }),
      makeItem({ id: '2', status: 'blocked', priority: 2, isBlocker: true }),
    ];

    const result = getNextBestAction(items);

    expect(result).toBeNull();
  });

  it('should return null when all items are either complete or blocked', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', status: 'complete', priority: 1 }),
      makeItem({ id: '2', status: 'blocked', priority: 2, isBlocker: true }),
      makeItem({ id: '3', status: 'complete', priority: 3 }),
      makeItem({ id: '4', status: 'blocked', priority: 4, isBlocker: true }),
    ];

    const result = getNextBestAction(items);

    expect(result).toBeNull();
  });

  it('should return null for an empty items array', () => {
    const result = getNextBestAction([]);

    expect(result).toBeNull();
  });

  it('should skip blocked items and return the next actionable item', () => {
    const items: ChecklistItem[] = [
      makeItem({
        id: '1',
        description: 'Blocked high priority',
        priority: 1,
        status: 'blocked',
        isBlocker: true,
      }),
      makeItem({ id: '2', description: 'Available task', priority: 3, status: 'incomplete' }),
    ];

    const result = getNextBestAction(items);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('2');
    expect(result!.description).toBe('Available task');
    expect(result!.priority).toBe(3);
  });

  it('should skip complete items and return next incomplete item', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', description: 'Done', priority: 1, status: 'complete' }),
      makeItem({ id: '2', description: 'Still to do', priority: 2, status: 'incomplete' }),
    ];

    const result = getNextBestAction(items);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('2');
    expect(result!.description).toBe('Still to do');
  });

  it('should consider in_progress items as actionable', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', description: 'In progress task', priority: 2, status: 'in_progress' }),
      makeItem({ id: '2', description: 'Not started yet', priority: 5, status: 'incomplete' }),
    ];

    const result = getNextBestAction(items);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('1');
    expect(result!.description).toBe('In progress task');
  });

  it('should return the full ChecklistItem with category, description, and priority', () => {
    const items: ChecklistItem[] = [
      makeItem({
        id: '1',
        description: 'Write landing page',
        category: 'marketing',
        priority: 1,
        status: 'incomplete',
      }),
    ];

    const result = getNextBestAction(items);

    expect(result).not.toBeNull();
    expect(result!.category).toBe('marketing');
    expect(result!.description).toBe('Write landing page');
    expect(result!.priority).toBe(1);
  });

  it('should pick lowest priority number when multiple items are actionable', () => {
    const items: ChecklistItem[] = [
      makeItem({
        id: '1',
        description: 'Priority 10',
        priority: 10,
        status: 'incomplete',
        category: 'content',
      }),
      makeItem({
        id: '2',
        description: 'Priority 2',
        priority: 2,
        status: 'in_progress',
        category: 'product',
      }),
      makeItem({
        id: '3',
        description: 'Priority 7',
        priority: 7,
        status: 'incomplete',
        category: 'quality',
      }),
      makeItem({
        id: '4',
        description: 'Priority 1 but blocked',
        priority: 1,
        status: 'blocked',
        isBlocker: true,
        category: 'deployment',
      }),
      makeItem({
        id: '5',
        description: 'Priority 1 but complete',
        priority: 1,
        status: 'complete',
        category: 'legal/admin',
      }),
    ];

    const result = getNextBestAction(items);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('2');
    expect(result!.description).toBe('Priority 2');
    expect(result!.priority).toBe(2);
    expect(result!.category).toBe('product');
  });

  it('should return a deterministic result when items have equal priority', () => {
    const items: ChecklistItem[] = [
      makeItem({ id: '1', description: 'Task A', priority: 3, status: 'incomplete' }),
      makeItem({ id: '2', description: 'Task B', priority: 3, status: 'incomplete' }),
    ];

    const result = getNextBestAction(items);

    expect(result).not.toBeNull();
    expect(result!.priority).toBe(3);
    // reduce picks first match when equal, so it should be consistent
    expect(result!.id).toBe('1');
  });
});

// --- CHECKLIST_CATEGORIES Tests ---

describe('CHECKLIST_CATEGORIES', () => {
  it('should contain exactly 6 categories', () => {
    expect(CHECKLIST_CATEGORIES).toHaveLength(6);
  });

  it('should contain all required categories', () => {
    const expected: ChecklistCategory[] = [
      'product',
      'quality',
      'deployment',
      'legal/admin',
      'marketing',
      'content',
    ];
    for (const cat of expected) {
      expect(CHECKLIST_CATEGORIES).toContain(cat);
    }
  });

  it('should have no duplicate categories', () => {
    const unique = new Set(CHECKLIST_CATEGORIES);
    expect(unique.size).toBe(CHECKLIST_CATEGORIES.length);
  });
});

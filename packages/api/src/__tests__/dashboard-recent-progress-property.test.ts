import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { TaskState } from '../generated/prisma/enums.js';

/**
 * Property 13: Dashboard Recent Progress Time Bound
 * - All tasks in recent progress have completedAt within last 7 days
 *
 * Validates: Requirements 8.4
 *
 * This test exercises the recent progress filtering logic in isolation
 * by simulating what getDashboard does without needing a database.
 */

// --- Types ---

interface Task {
  id: string;
  title: string;
  state: TaskState;
  lastInferredAt: Date | null;
}

interface RecentProgressItem {
  taskId: string;
  title: string;
  completedAt: Date;
}

// --- Pure filter logic extracted from getDashboard ---

function filterRecentProgress(tasks: Task[]): RecentProgressItem[] {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return tasks
    .filter(
      (t) =>
        t.state === 'COMPLETED' && t.lastInferredAt !== null && t.lastInferredAt >= sevenDaysAgo,
    )
    .sort((a, b) => b.lastInferredAt!.getTime() - a.lastInferredAt!.getTime())
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      completedAt: t.lastInferredAt!,
    }));
}

// --- Arbitraries ---

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const allTaskStates: TaskState[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'NEEDS_REVIEW',
  'COMPLETED',
  'UNCERTAIN',
];

const taskStateArb: fc.Arbitrary<TaskState> = fc.constantFrom(...allTaskStates);

/** Generates a date within the last 7 days (exclusive of exactly 7 days ago boundary) */
const recentDateArb: fc.Arbitrary<Date> = fc
  .integer({
    min: 1, // at least 1ms after 7 days ago
    max: SEVEN_DAYS_MS - 1,
  })
  .map((msAgo) => new Date(Date.now() - msAgo));

/** Generates a date older than 7 days */
const oldDateArb: fc.Arbitrary<Date> = fc
  .integer({
    min: SEVEN_DAYS_MS + 1, // at least 1ms beyond 7 days
    max: SEVEN_DAYS_MS * 10, // up to 70 days ago
  })
  .map((msAgo) => new Date(Date.now() - msAgo));

/** Generates a date that is either recent or old */
const anyDateArb: fc.Arbitrary<Date> = fc.oneof(recentDateArb, oldDateArb);

/** Generates a nullable date (either a date or null) */
const nullableDateArb: fc.Arbitrary<Date | null> = fc.oneof(
  anyDateArb,
  fc.constant(null as Date | null),
);

/** Generates a task with random properties */
const taskArb: fc.Arbitrary<Task> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  state: taskStateArb,
  lastInferredAt: nullableDateArb,
});

/** Generates a COMPLETED task with a recent date */
const completedRecentTaskArb: fc.Arbitrary<Task> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  state: fc.constant('COMPLETED' as TaskState),
  lastInferredAt: recentDateArb,
});

/** Generates a task with a date older than 7 days */
const oldTaskArb: fc.Arbitrary<Task> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  state: taskStateArb,
  lastInferredAt: oldDateArb,
});

/** Generates a task with null lastInferredAt */
const nullDateTaskArb: fc.Arbitrary<Task> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  state: taskStateArb,
  lastInferredAt: fc.constant(null as Date | null),
});

describe('Property 13: Dashboard Recent Progress Time Bound', () => {
  it('all tasks in recent progress have completedAt within last 7 days', () => {
    fc.assert(
      fc.property(fc.array(taskArb, { minLength: 0, maxLength: 20 }), (tasks) => {
        const now = Date.now();
        const sevenDaysAgoMs = now - SEVEN_DAYS_MS;

        const result = filterRecentProgress(tasks);

        // PROPERTY: Every item in recent progress has a completedAt within 7 days
        for (const item of result) {
          expect(item.completedAt.getTime()).toBeGreaterThanOrEqual(sevenDaysAgoMs);
          expect(item.completedAt.getTime()).toBeLessThanOrEqual(now);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('no task older than 7 days appears in recent progress', () => {
    fc.assert(
      fc.property(fc.array(oldTaskArb, { minLength: 1, maxLength: 20 }), (tasks) => {
        const result = filterRecentProgress(tasks);

        // PROPERTY: All tasks with old dates are excluded entirely
        expect(result).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it('all COMPLETED tasks within 7 days appear in recent progress', () => {
    fc.assert(
      fc.property(fc.array(completedRecentTaskArb, { minLength: 1, maxLength: 20 }), (tasks) => {
        const result = filterRecentProgress(tasks);

        // PROPERTY: All completed tasks with recent dates are included
        expect(result).toHaveLength(tasks.length);

        // Verify all original task IDs appear in the result
        const resultIds = new Set(result.map((r) => r.taskId));
        for (const task of tasks) {
          expect(resultIds.has(task.id)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('tasks with null lastInferredAt are always excluded', () => {
    fc.assert(
      fc.property(fc.array(nullDateTaskArb, { minLength: 1, maxLength: 20 }), (tasks) => {
        const result = filterRecentProgress(tasks);

        // PROPERTY: Tasks with null lastInferredAt never appear in results
        expect(result).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });
});

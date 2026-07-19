// Feature: bedrock-content-generation, Property 6: Evidence items appear in built prompt for completed tasks

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildPrompt, EvidenceItem, TaskSummary } from '../services/content-prompts.js';
import { Platform } from '../generated/prisma/enums.js';

/**
 * Property 6: Evidence items appear in built prompt for completed tasks
 *
 * For any task with associated PR evidence records containing a `description` field,
 * those descriptions SHALL appear in the built user prompt. For any task with associated
 * COMMIT evidence records containing a `message` field, those messages SHALL appear in
 * the built user prompt.
 *
 * Validates: Requirements 4.1, 4.2
 */

/** Arbitrary for generating non-empty printable strings (used as evidence content). */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0);

/** Arbitrary for generating a valid EvidenceItem. */
const evidenceItemArb: fc.Arbitrary<EvidenceItem> = fc.oneof(
  nonEmptyStringArb.map((content) => ({ type: 'PR' as const, content })),
  nonEmptyStringArb.map((content) => ({ type: 'COMMIT' as const, content })),
);

/** Arbitrary for generating a TaskSummary with evidence items. */
const taskWithEvidenceArb: fc.Arbitrary<TaskSummary> = fc.record({
  title: nonEmptyStringArb,
  completedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
  evidenceItems: fc.array(evidenceItemArb, { minLength: 1, maxLength: 10 }),
});

/** Arbitrary for generating a valid platform. */
const platformArb = fc.constantFrom(Platform.TWITTER, Platform.LINKEDIN, Platform.BLOG);

describe('Property 6: Evidence items appear in built prompt for completed tasks', () => {
  it('PR evidence content appears in the user prompt', () => {
    fc.assert(
      fc.property(platformArb, fc.array(taskWithEvidenceArb, { minLength: 1, maxLength: 5 }), (platform, tasks) => {
        const { user } = buildPrompt(platform, tasks);

        for (const task of tasks) {
          if (task.evidenceItems) {
            for (const item of task.evidenceItems) {
              if (item.type === 'PR') {
                expect(user).toContain(item.content);
              }
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('COMMIT evidence content appears in the user prompt', () => {
    fc.assert(
      fc.property(platformArb, fc.array(taskWithEvidenceArb, { minLength: 1, maxLength: 5 }), (platform, tasks) => {
        const { user } = buildPrompt(platform, tasks);

        for (const task of tasks) {
          if (task.evidenceItems) {
            for (const item of task.evidenceItems) {
              if (item.type === 'COMMIT') {
                expect(user).toContain(item.content);
              }
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('all evidence items (PR and COMMIT) appear in the user prompt regardless of platform', () => {
    fc.assert(
      fc.property(platformArb, fc.array(taskWithEvidenceArb, { minLength: 1, maxLength: 5 }), (platform, tasks) => {
        const { user } = buildPrompt(platform, tasks);

        for (const task of tasks) {
          if (task.evidenceItems) {
            for (const item of task.evidenceItems) {
              // Every evidence item's content must appear in the prompt
              expect(user).toContain(item.content);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

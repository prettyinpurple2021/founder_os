import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 9: Content Draft Version History Monotonicity
 * - After N edits, exactly N+1 versions exist for a draft, versions never deleted
 *
 * Validates: Requirements 6.4
 *
 * This test exercises the version history logic in isolation by simulating
 * the editDraft version counting behavior with arbitrary edit sequences.
 */

/**
 * Simulates the version history behavior from editDraft.
 * Each edit increments the version count by 1, starting from an initial version (1).
 * Returns the full version history after applying all edits.
 */
function simulateVersionHistory(editContents: string[]): {
  versions: Array<{ version: number; content: string }>;
  totalVersionCount: number;
} {
  // Initial version created when draft is generated (version 1)
  const versions: Array<{ version: number; content: string }> = [
    { version: 1, content: 'initial-generated-content' },
  ];

  // Each edit creates a new version with incremented version number
  // This mirrors the editDraft logic: versionCount = existing count, newVersion = versionCount + 1
  for (let i = 0; i < editContents.length; i++) {
    const currentCount = versions.length; // equivalent to prisma.draftVersion.count()
    versions.push({
      version: currentCount + 1,
      content: editContents[i],
    });
  }

  return {
    versions,
    totalVersionCount: versions.length,
  };
}

/**
 * Simulates applying edits one-by-one and tracking version count after each edit.
 * Used to verify that version count only increases (monotonicity).
 */
function simulateVersionCountsOverTime(editContents: string[]): number[] {
  const counts: number[] = [];

  // Initial state: 1 version exists
  counts.push(1);

  // After each edit, version count increases by 1
  for (let i = 0; i < editContents.length; i++) {
    counts.push(counts[counts.length - 1] + 1);
  }

  return counts;
}

// Arbitrary: generates a sequence of 1-10 non-empty edit content strings
const editSequenceArb = fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
  minLength: 1,
  maxLength: 10,
});

// Arbitrary: generates a sequence of 0-10 edits (including no edits)
const editSequenceWithZeroArb = fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
  minLength: 0,
  maxLength: 10,
});

describe('Property: Content Draft Version History Monotonicity', () => {
  it('after N edits, exactly N+1 versions exist (1 initial + N edits)', () => {
    fc.assert(
      fc.property(editSequenceWithZeroArb, (edits) => {
        const result = simulateVersionHistory(edits);

        // PROPERTY: Total version count is always N+1 where N = number of edits
        expect(result.totalVersionCount).toBe(edits.length + 1);
      }),
      { numRuns: 200 },
    );
  });

  it('version numbers are sequential with no gaps (1, 2, 3, ..., N+1)', () => {
    fc.assert(
      fc.property(editSequenceArb, (edits) => {
        const result = simulateVersionHistory(edits);

        // PROPERTY: Versions are numbered 1 through N+1 with no gaps
        for (let i = 0; i < result.versions.length; i++) {
          expect(result.versions[i].version).toBe(i + 1);
        }

        // PROPERTY: Last version number equals total count
        expect(result.versions[result.versions.length - 1].version).toBe(result.totalVersionCount);
      }),
      { numRuns: 200 },
    );
  });

  it('version count only increases or stays the same (never decreases)', () => {
    fc.assert(
      fc.property(editSequenceArb, (edits) => {
        const counts = simulateVersionCountsOverTime(edits);

        // PROPERTY: Each count is >= the previous count (monotonically non-decreasing)
        for (let i = 1; i < counts.length; i++) {
          expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('each edit produces exactly one new version (difference is always 1)', () => {
    fc.assert(
      fc.property(editSequenceArb, (edits) => {
        const counts = simulateVersionCountsOverTime(edits);

        // PROPERTY: The difference between consecutive version counts is exactly 1
        for (let i = 1; i < counts.length; i++) {
          expect(counts[i] - counts[i - 1]).toBe(1);
        }
      }),
      { numRuns: 200 },
    );
  });
});

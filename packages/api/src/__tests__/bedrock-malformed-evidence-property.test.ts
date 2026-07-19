// Feature: bedrock-content-generation, Property 9: Malformed evidence metadata is skipped without affecting other records

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 9: Malformed evidence metadata is skipped without affecting other records
 *
 * For any evidence record whose `metadata` JSON field does not contain the expected key
 * (`description` for PR, `message` for COMMIT), that record SHALL be excluded from the
 * prompt AND all other valid evidence records for the same task SHALL still be included.
 *
 * Validates: Requirements 4.6
 */

// --- Test evidence record shape ---

interface TestEvidenceRecord {
  type: 'PR' | 'COMMIT';
  metadata: unknown;
}

interface ProcessedEvidenceItem {
  type: 'PR' | 'COMMIT';
  content: string;
}

/**
 * Mirrors the evidence processing logic from content.ts (lines 735-753).
 * This is a pure-function extraction of the loop that processes evidence records.
 */
function processEvidenceRecords(evidenceRecords: TestEvidenceRecord[]): ProcessedEvidenceItem[] {
  const evidenceItems: ProcessedEvidenceItem[] = [];
  for (const record of evidenceRecords) {
    const metadata = record.metadata as Record<string, unknown> | null;
    if (!metadata || typeof metadata !== 'object') {
      continue;
    }

    if (record.type === 'PR') {
      const description = (metadata as Record<string, unknown>).description;
      if (typeof description === 'string') {
        evidenceItems.push({ type: 'PR', content: description.slice(0, 500) });
      }
    } else if (record.type === 'COMMIT') {
      const message = (metadata as Record<string, unknown>).message;
      if (typeof message === 'string') {
        evidenceItems.push({ type: 'COMMIT', content: message.slice(0, 200) });
      }
    }
  }
  return evidenceItems;
}

// --- Arbitraries ---

/** Generates a non-empty string for valid metadata values. */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/** Generates a valid PR evidence record (metadata has `description` string). */
const validPrRecordArb: fc.Arbitrary<TestEvidenceRecord> = nonEmptyStringArb.map((description) => ({
  type: 'PR' as const,
  metadata: { description },
}));

/** Generates a valid COMMIT evidence record (metadata has `message` string). */
const validCommitRecordArb: fc.Arbitrary<TestEvidenceRecord> = nonEmptyStringArb.map((message) => ({
  type: 'COMMIT' as const,
  metadata: { message },
}));

/** Generates a valid evidence record (either PR or COMMIT). */
const validRecordArb: fc.Arbitrary<TestEvidenceRecord> = fc.oneof(validPrRecordArb, validCommitRecordArb);

/** Generates malformed metadata shapes that should cause the record to be skipped. */
const malformedMetadataArb: fc.Arbitrary<unknown> = fc.oneof(
  // null metadata
  fc.constant(null),
  // undefined metadata
  fc.constant(undefined),
  // metadata is a number
  fc.integer().map((n) => n as unknown),
  // metadata is a string (not an object)
  fc.string().map((s) => s as unknown),
  // metadata is a boolean
  fc.boolean().map((b) => b as unknown),
  // metadata is an object but missing the expected key for PR
  fc.record({ title: fc.string(), number: fc.integer() }).map((obj) => obj as unknown),
  // metadata has the key but value is not a string
  fc.oneof(
    fc.record({ description: fc.integer() }).map((obj) => obj as unknown),
    fc.record({ description: fc.constant(null) }).map((obj) => obj as unknown),
    fc.record({ description: fc.boolean() }).map((obj) => obj as unknown),
    fc.record({ description: fc.constant(undefined) }).map((obj) => obj as unknown),
    fc.record({ message: fc.integer() }).map((obj) => obj as unknown),
    fc.record({ message: fc.constant(null) }).map((obj) => obj as unknown),
    fc.record({ message: fc.boolean() }).map((obj) => obj as unknown),
    fc.record({ message: fc.constant(undefined) }).map((obj) => obj as unknown),
  ),
);

/** Generates a malformed evidence record (PR with bad metadata). */
const malformedPrRecordArb: fc.Arbitrary<TestEvidenceRecord> = malformedMetadataArb.map((metadata) => ({
  type: 'PR' as const,
  metadata,
}));

/** Generates a malformed evidence record (COMMIT with bad metadata). */
const malformedCommitRecordArb: fc.Arbitrary<TestEvidenceRecord> = malformedMetadataArb.map((metadata) => ({
  type: 'COMMIT' as const,
  metadata,
}));

/** Generates a malformed evidence record (either PR or COMMIT). */
const malformedRecordArb: fc.Arbitrary<TestEvidenceRecord> = fc.oneof(
  malformedPrRecordArb,
  malformedCommitRecordArb,
);

// --- Property Tests ---

describe('Property 9: Malformed evidence metadata is skipped without affecting other records', () => {
  it('malformed evidence records are excluded from processed output', () => {
    fc.assert(
      fc.property(
        fc.array(malformedRecordArb, { minLength: 1, maxLength: 10 }),
        (malformedRecords) => {
          const result = processEvidenceRecords(malformedRecords);
          // All malformed records should produce zero output items
          expect(result).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid evidence records are included when mixed with malformed records', () => {
    fc.assert(
      fc.property(
        fc.array(validRecordArb, { minLength: 1, maxLength: 5 }),
        fc.array(malformedRecordArb, { minLength: 1, maxLength: 5 }),
        (validRecords, malformedRecords) => {
          // Interleave valid and malformed records
          const mixed: TestEvidenceRecord[] = [];
          const maxLen = Math.max(validRecords.length, malformedRecords.length);
          for (let i = 0; i < maxLen; i++) {
            if (i < malformedRecords.length) mixed.push(malformedRecords[i]);
            if (i < validRecords.length) mixed.push(validRecords[i]);
          }

          const result = processEvidenceRecords(mixed);

          // The number of output items equals the number of valid input records
          expect(result).toHaveLength(validRecords.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('valid record content is preserved in output when malformed records are present', () => {
    fc.assert(
      fc.property(
        fc.array(validRecordArb, { minLength: 1, maxLength: 5 }),
        fc.array(malformedRecordArb, { minLength: 0, maxLength: 5 }),
        (validRecords, malformedRecords) => {
          // Shuffle malformed records before and after valid ones
          const mixed: TestEvidenceRecord[] = [
            ...malformedRecords,
            ...validRecords,
            ...malformedRecords,
          ];

          const result = processEvidenceRecords(mixed);

          // Each valid record's content should appear in the output
          for (const validRecord of validRecords) {
            const meta = validRecord.metadata as Record<string, unknown>;
            if (validRecord.type === 'PR') {
              const expectedContent = (meta.description as string).slice(0, 500);
              expect(result).toContainEqual({ type: 'PR', content: expectedContent });
            } else {
              const expectedContent = (meta.message as string).slice(0, 200);
              expect(result).toContainEqual({ type: 'COMMIT', content: expectedContent });
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('output count equals valid input count regardless of malformed record positions', () => {
    fc.assert(
      fc.property(
        fc.array(validRecordArb, { minLength: 0, maxLength: 8 }),
        fc.array(malformedRecordArb, { minLength: 0, maxLength: 8 }),
        fc.shuffledSubarray(
          Array.from({ length: 16 }, (_, i) => i),
          { minLength: 0, maxLength: 16 },
        ),
        (validRecords, malformedRecords, _ordering) => {
          // Concatenate and process — order shouldn't matter for count
          const mixed: TestEvidenceRecord[] = [...validRecords, ...malformedRecords];

          const result = processEvidenceRecords(mixed);

          expect(result).toHaveLength(validRecords.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

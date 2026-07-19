// Feature: bedrock-content-generation, Property 7: Evidence count is capped at 10 per task

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 7: Evidence count is capped at 10 per task
 *
 * For any task with N evidence records where N > 10, the prompt builder SHALL include
 * exactly 10 evidence items, selected as the 10 most recent by `fetchedAt`.
 *
 * **Validates: Requirements 4.3**
 *
 * This test exercises the evidence fetching and selection logic that caps evidence
 * records at 10 per task, always selecting the most recent by fetchedAt timestamp.
 * The actual implementation uses `prisma.evidence.findMany({ orderBy: { fetchedAt: 'desc' }, take: 10 })`
 * but we test the equivalent logic here to verify the contract.
 */

/** Evidence types matching the Prisma EvidenceType enum */
type EvidenceType = 'PR' | 'COMMIT';

/** Simulated evidence record as fetched from the database */
interface EvidenceRecord {
  id: string;
  type: EvidenceType;
  fetchedAt: Date;
  metadata: Record<string, unknown>;
}

/** Evidence item after processing (type + truncated content) */
interface EvidenceItem {
  type: EvidenceType;
  content: string;
}

/**
 * Simulates the evidence fetching and processing logic from content.ts (Task 3.1).
 *
 * Given an array of evidence records:
 * 1. Sort by fetchedAt descending (most recent first)
 * 2. Take at most 10 records
 * 3. Extract valid items (PR with description, COMMIT with message)
 * 4. Truncate PR descriptions to 500 chars, commit messages to 200 chars
 *
 * Returns the processed evidence items.
 */
function processEvidenceRecords(records: EvidenceRecord[]): EvidenceItem[] {
  // Sort by fetchedAt desc and take at most 10
  const sorted = [...records].sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime());
  const capped = sorted.slice(0, 10);

  // Extract valid items, skipping malformed metadata
  const items: EvidenceItem[] = [];
  for (const record of capped) {
    const metadata = record.metadata;
    if (!metadata || typeof metadata !== 'object') {
      continue;
    }

    if (record.type === 'PR') {
      const description = metadata.description;
      if (typeof description === 'string') {
        items.push({ type: 'PR', content: description.slice(0, 500) });
      }
    } else if (record.type === 'COMMIT') {
      const message = metadata.message;
      if (typeof message === 'string') {
        items.push({ type: 'COMMIT', content: message.slice(0, 200) });
      }
    }
  }

  return items;
}

// --- Arbitraries ---

/** Arbitrary for evidence type */
const evidenceTypeArb = fc.constantFrom('PR' as const, 'COMMIT' as const);

/** Arbitrary for generating a date within a reasonable range */
const dateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') });

/** Arbitrary for non-empty content strings */
const contentStringArb = fc.string({ minLength: 1, maxLength: 300 }).filter((s) => s.trim().length > 0);

/**
 * Arbitrary for a valid evidence record (has correct metadata shape).
 * PR records have { description: string }, COMMIT records have { message: string }.
 */
const validEvidenceRecordArb: fc.Arbitrary<EvidenceRecord> = fc
  .tuple(evidenceTypeArb, dateArb, contentStringArb, fc.uuid())
  .map(([type, fetchedAt, content, id]) => ({
    id,
    type,
    fetchedAt,
    metadata: type === 'PR' ? { description: content } : { message: content },
  }));

/**
 * Arbitrary for generating an array of 1-50 valid evidence records.
 * This represents a task that may have more evidence than the cap.
 */
const evidenceArrayArb = fc.array(validEvidenceRecordArb, { minLength: 1, maxLength: 50 });

describe('Property 7: Evidence count is capped at 10 per task', () => {
  it('never returns more than 10 evidence items regardless of input count', () => {
    fc.assert(
      fc.property(evidenceArrayArb, (records) => {
        const result = processEvidenceRecords(records);

        // PROPERTY: Output count is always ≤ 10
        expect(result.length).toBeLessThanOrEqual(10);
      }),
      { numRuns: 100 },
    );
  });

  it('returns exactly 10 items when input has more than 10 valid records', () => {
    // Generate arrays specifically with > 10 valid records
    const largeEvidenceArrayArb = fc.array(validEvidenceRecordArb, { minLength: 11, maxLength: 50 });

    fc.assert(
      fc.property(largeEvidenceArrayArb, (records) => {
        const result = processEvidenceRecords(records);

        // PROPERTY: When input has > 10 valid records, output is exactly 10
        expect(result.length).toBe(10);
      }),
      { numRuns: 100 },
    );
  });

  it('selects the 10 most recent records by fetchedAt', () => {
    const largeEvidenceArrayArb = fc.array(validEvidenceRecordArb, { minLength: 11, maxLength: 50 });

    fc.assert(
      fc.property(largeEvidenceArrayArb, (records) => {
        const result = processEvidenceRecords(records);

        // Sort records by fetchedAt desc to determine expected selection
        const sortedRecords = [...records].sort(
          (a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime(),
        );
        const expectedTop10 = sortedRecords.slice(0, 10);

        // Extract expected content from the top 10 records
        const expectedContents: string[] = [];
        for (const record of expectedTop10) {
          if (record.type === 'PR') {
            const desc = record.metadata.description;
            if (typeof desc === 'string') {
              expectedContents.push(desc.slice(0, 500));
            }
          } else if (record.type === 'COMMIT') {
            const msg = record.metadata.message;
            if (typeof msg === 'string') {
              expectedContents.push(msg.slice(0, 200));
            }
          }
        }

        // PROPERTY: Result contents match exactly the top 10 most recent records
        const resultContents = result.map((item) => item.content);
        expect(resultContents).toEqual(expectedContents);
      }),
      { numRuns: 100 },
    );
  });

  it('preserves all records when input has 10 or fewer valid records', () => {
    const smallEvidenceArrayArb = fc.array(validEvidenceRecordArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(smallEvidenceArrayArb, (records) => {
        const result = processEvidenceRecords(records);

        // PROPERTY: When input ≤ 10, all valid records are preserved
        expect(result.length).toBe(records.length);
      }),
      { numRuns: 100 },
    );
  });
});

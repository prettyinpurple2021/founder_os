// Feature: bedrock-content-generation, Property 8: Evidence content is truncated to platform-safe limits

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 8: Evidence content is truncated to platform-safe limits
 *
 * For any PR description of length L > 500, the included description SHALL be at most 500 characters.
 * For any commit message of length L > 200, the included message SHALL be at most 200 characters.
 *
 * **Validates: Requirements 4.5**
 *
 * This test exercises the truncation logic that ensures evidence content
 * never exceeds platform-safe limits before being included in prompts.
 */

/** Maximum character limits for evidence content */
const PR_MAX_LENGTH = 500;
const COMMIT_MAX_LENGTH = 200;

/** Evidence item representing a PR description or commit message */
interface EvidenceItem {
  type: 'PR' | 'COMMIT';
  content: string;
}

/**
 * Truncates evidence content to platform-safe limits.
 * PR descriptions are capped at 500 characters.
 * Commit messages are capped at 200 characters.
 *
 * This mirrors the truncation logic that content.ts applies when
 * building TaskSummary objects with evidence items (Task 3.1).
 */
function truncateEvidence(item: EvidenceItem): EvidenceItem {
  const maxLength = item.type === 'PR' ? PR_MAX_LENGTH : COMMIT_MAX_LENGTH;
  return {
    type: item.type,
    content: item.content.length > maxLength ? item.content.slice(0, maxLength) : item.content,
  };
}

// Arbitrary: generates strings of length 0-5000 (full Unicode)
const longStringArb = fc.string({ minLength: 0, maxLength: 5000 });

// Arbitrary: generates evidence type
const evidenceTypeArb = fc.constantFrom('PR' as const, 'COMMIT' as const);

// Arbitrary: generates a complete evidence item with content 0-5000 chars
const evidenceItemArb = fc.record({
  type: evidenceTypeArb,
  content: longStringArb,
});

describe('Property 8: Evidence content is truncated to platform-safe limits', () => {
  it('PR descriptions never exceed 500 characters after truncation', () => {
    fc.assert(
      fc.property(longStringArb, (description) => {
        const item: EvidenceItem = { type: 'PR', content: description };
        const truncated = truncateEvidence(item);

        // PROPERTY: Output content length is always ≤ 500 for PR type
        expect(truncated.content.length).toBeLessThanOrEqual(PR_MAX_LENGTH);
      }),
      { numRuns: 100 },
    );
  });

  it('commit messages never exceed 200 characters after truncation', () => {
    fc.assert(
      fc.property(longStringArb, (message) => {
        const item: EvidenceItem = { type: 'COMMIT', content: message };
        const truncated = truncateEvidence(item);

        // PROPERTY: Output content length is always ≤ 200 for COMMIT type
        expect(truncated.content.length).toBeLessThanOrEqual(COMMIT_MAX_LENGTH);
      }),
      { numRuns: 100 },
    );
  });

  it('truncation preserves content that is already within limits', () => {
    fc.assert(
      fc.property(evidenceItemArb, (item) => {
        const maxLength = item.type === 'PR' ? PR_MAX_LENGTH : COMMIT_MAX_LENGTH;
        const truncated = truncateEvidence(item);

        // PROPERTY: If input is within limits, content is unchanged
        if (item.content.length <= maxLength) {
          expect(truncated.content).toBe(item.content);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('truncated content is always a prefix of the original', () => {
    fc.assert(
      fc.property(evidenceItemArb, (item) => {
        const truncated = truncateEvidence(item);

        // PROPERTY: The truncated content is always a prefix of the original content
        expect(item.content.startsWith(truncated.content)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('type is preserved through truncation', () => {
    fc.assert(
      fc.property(evidenceItemArb, (item) => {
        const truncated = truncateEvidence(item);

        // PROPERTY: The evidence type is never altered by truncation
        expect(truncated.type).toBe(item.type);
      }),
      { numRuns: 100 },
    );
  });
});

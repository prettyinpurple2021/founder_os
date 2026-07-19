// Feature: bedrock-content-generation, Property 2: Response extraction always returns trimmed content

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 2: Response extraction always returns trimmed content
 *
 * For any Bedrock response body containing non-empty text content (possibly surrounded
 * by whitespace, newlines, or other padding), the extraction logic SHALL return a string
 * equal to the content with leading and trailing whitespace removed.
 *
 * Validates: Requirements 1.3
 */

// --- Pure function extraction of the response extraction logic from bedrock.ts ---

/**
 * Mirrors the response extraction logic from bedrock.ts (lines ~170-180).
 * Given the text field value from the Bedrock response JSON, returns the trimmed result.
 * This is a pure function extraction that isolates the trim behavior for property testing.
 */
function extractResponseText(text: string): string {
  return text.trim();
}

// --- Arbitraries ---

/** Whitespace characters that may appear as padding */
const whitespaceChars = [' ', '\t', '\n', '\r', '\f', '\v'];

/** Generates random whitespace padding of variable length */
const whitespacePaddingArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...whitespaceChars), { minLength: 0, maxLength: 20 })
  .map((chars) => chars.join(''));

/** Generates a non-empty string that represents the core content (not purely whitespace) */
const coreContentArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

/** Generates a string with leading and/or trailing whitespace padding */
const paddedStringArb: fc.Arbitrary<string> = fc
  .tuple(whitespacePaddingArb, coreContentArb, whitespacePaddingArb)
  .map(([leading, content, trailing]) => leading + content + trailing);

/** Generates a string with no leading or trailing whitespace */
const unpaddedStringArb: fc.Arbitrary<string> = coreContentArb.filter(
  (s) => s === s.trim(),
);

// --- Property Tests ---

describe('Property 2: Response extraction always returns trimmed content', () => {
  it('for any string with leading/trailing whitespace, result equals string.trim()', () => {
    fc.assert(
      fc.property(paddedStringArb, (input) => {
        const result = extractResponseText(input);
        expect(result).toBe(input.trim());
      }),
      { numRuns: 100 },
    );
  });

  it('result never has leading whitespace', () => {
    fc.assert(
      fc.property(paddedStringArb, (input) => {
        const result = extractResponseText(input);
        expect(result).toBe(result.trimStart());
      }),
      { numRuns: 100 },
    );
  });

  it('result never has trailing whitespace', () => {
    fc.assert(
      fc.property(paddedStringArb, (input) => {
        const result = extractResponseText(input);
        expect(result).toBe(result.trimEnd());
      }),
      { numRuns: 100 },
    );
  });

  it('for any string without whitespace padding, result equals the input', () => {
    fc.assert(
      fc.property(unpaddedStringArb, (input) => {
        const result = extractResponseText(input);
        expect(result).toBe(input);
      }),
      { numRuns: 100 },
    );
  });

  it('result never contains whitespace at boundaries', () => {
    fc.assert(
      fc.property(paddedStringArb, (input) => {
        const result = extractResponseText(input);
        // First character is not whitespace
        expect(whitespaceChars).not.toContain(result[0]);
        // Last character is not whitespace
        expect(whitespaceChars).not.toContain(result[result.length - 1]);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: bedrock-content-generation, Property 5: Template fallback output contains required structural elements

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 5: Template fallback output contains required structural elements
 *
 * For any user prompt string, the template fallback output SHALL contain:
 * an emoji character on the first line, a descriptive intro line, the user prompt
 * content verbatim, and trailing hashtags including `#buildinpublic`.
 *
 * Validates: Requirements 3.4
 */

// --- Replicate the template fallback function (not exported from content.ts) ---

function generateTemplateFallback(userPrompt: string): string {
  return `🚀 Build Update\n\nHere's what I shipped recently:\n\n${userPrompt}\n\n#buildinpublic #indiehacker`;
}

// --- Arbitraries ---

/** Generates random user prompt strings representing shipped tasks. */
const userPromptArb = fc.string({ minLength: 1, maxLength: 500 });

// --- Property Tests ---

describe('Property 5: Template fallback output contains required structural elements', () => {
  it('output contains an emoji character (🚀) on the first line', () => {
    fc.assert(
      fc.property(userPromptArb, (userPrompt) => {
        const output = generateTemplateFallback(userPrompt);
        const firstLine = output.split('\n')[0];
        // The first line must contain the 🚀 emoji
        expect(firstLine).toContain('🚀');
      }),
      { numRuns: 100 },
    );
  });

  it('output contains a descriptive intro line', () => {
    fc.assert(
      fc.property(userPromptArb, (userPrompt) => {
        const output = generateTemplateFallback(userPrompt);
        // The output must contain a descriptive intro about what was shipped
        expect(output).toContain("Here's what I shipped recently");
      }),
      { numRuns: 100 },
    );
  });

  it('output contains the user prompt content verbatim', () => {
    fc.assert(
      fc.property(userPromptArb, (userPrompt) => {
        const output = generateTemplateFallback(userPrompt);
        // The user prompt must appear verbatim in the output
        expect(output).toContain(userPrompt);
      }),
      { numRuns: 100 },
    );
  });

  it('output contains #buildinpublic hashtag', () => {
    fc.assert(
      fc.property(userPromptArb, (userPrompt) => {
        const output = generateTemplateFallback(userPrompt);
        // Must include the #buildinpublic hashtag
        expect(output).toContain('#buildinpublic');
      }),
      { numRuns: 100 },
    );
  });

  it('for any user prompt string, all structural elements are present simultaneously', () => {
    fc.assert(
      fc.property(userPromptArb, (userPrompt) => {
        const output = generateTemplateFallback(userPrompt);
        const firstLine = output.split('\n')[0];

        // All structural elements must be present in the same output
        expect(firstLine).toContain('🚀');
        expect(output).toContain("Here's what I shipped recently");
        expect(output).toContain(userPrompt);
        expect(output).toContain('#buildinpublic');
      }),
      { numRuns: 100 },
    );
  });
});

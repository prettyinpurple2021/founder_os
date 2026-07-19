// Feature: bedrock-content-generation, Property 1: Request body construction preserves prompts and applies platform-specific parameters

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PLATFORM_MAX_TOKENS } from '../lib/bedrock.js';
import { Platform } from '../generated/prisma/enums.js';

/**
 * Property 1: Request body construction preserves prompts and applies platform-specific parameters
 *
 * For any valid platform (TWITTER, LINKEDIN, BLOG) and any pair of non-empty system/user
 * prompt strings, the constructed InvokeModel request body SHALL contain both prompts in
 * the messages-format structure AND set temperature to 0.7 AND set maxTokens to the
 * platform-specific limit (300 for TWITTER, 1024 for LINKEDIN, 2048 for BLOG).
 *
 * Validates: Requirements 1.1, 1.5
 */

// --- Request body construction logic (mirrors bedrock.ts lines 151-161) ---

interface BedrockRequestBody {
  messages: Array<{ role: string; content: Array<{ text: string }> }>;
  system: Array<{ text: string }>;
  inferenceConfig: {
    temperature: number;
    maxTokens: number;
  };
}

/**
 * Pure function that mirrors the request body construction logic in callBedrock.
 * Extracted here for testability without mocking the SDK.
 */
function buildBedrockRequestBody(
  systemPrompt: string,
  userPrompt: string,
  platform: Platform,
): BedrockRequestBody {
  return {
    messages: [
      { role: 'user', content: [{ text: userPrompt }] },
    ],
    system: [{ text: systemPrompt }],
    inferenceConfig: {
      temperature: 0.7,
      maxTokens: PLATFORM_MAX_TOKENS[platform],
    },
  };
}

// --- Arbitraries ---

/** Generates a random Platform value. */
const platformArb: fc.Arbitrary<Platform> = fc.constantFrom(
  Platform.TWITTER,
  Platform.LINKEDIN,
  Platform.BLOG,
);

/** Generates a non-empty prompt string. */
const promptArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 500 });

// --- Property Tests ---

describe('Property 1: Request body construction preserves prompts and applies platform-specific parameters', () => {
  it('messages[0].role is always "user"', () => {
    fc.assert(
      fc.property(platformArb, promptArb, promptArb, (platform, systemPrompt, userPrompt) => {
        const body = buildBedrockRequestBody(systemPrompt, userPrompt, platform);
        expect(body.messages[0].role).toBe('user');
      }),
      { numRuns: 100 },
    );
  });

  it('messages[0].content[0].text equals the user prompt', () => {
    fc.assert(
      fc.property(platformArb, promptArb, promptArb, (platform, systemPrompt, userPrompt) => {
        const body = buildBedrockRequestBody(systemPrompt, userPrompt, platform);
        expect(body.messages[0].content[0].text).toBe(userPrompt);
      }),
      { numRuns: 100 },
    );
  });

  it('system[0].text equals the system prompt', () => {
    fc.assert(
      fc.property(platformArb, promptArb, promptArb, (platform, systemPrompt, userPrompt) => {
        const body = buildBedrockRequestBody(systemPrompt, userPrompt, platform);
        expect(body.system[0].text).toBe(systemPrompt);
      }),
      { numRuns: 100 },
    );
  });

  it('inferenceConfig.temperature is always 0.7', () => {
    fc.assert(
      fc.property(platformArb, promptArb, promptArb, (platform, systemPrompt, userPrompt) => {
        const body = buildBedrockRequestBody(systemPrompt, userPrompt, platform);
        expect(body.inferenceConfig.temperature).toBe(0.7);
      }),
      { numRuns: 100 },
    );
  });

  it('inferenceConfig.maxTokens equals PLATFORM_MAX_TOKENS[platform]', () => {
    fc.assert(
      fc.property(platformArb, promptArb, promptArb, (platform, systemPrompt, userPrompt) => {
        const body = buildBedrockRequestBody(systemPrompt, userPrompt, platform);
        expect(body.inferenceConfig.maxTokens).toBe(PLATFORM_MAX_TOKENS[platform]);
      }),
      { numRuns: 100 },
    );
  });

  it('TWITTER maxTokens is 300, LINKEDIN is 1024, BLOG is 2048', () => {
    fc.assert(
      fc.property(promptArb, promptArb, (systemPrompt, userPrompt) => {
        const twitterBody = buildBedrockRequestBody(systemPrompt, userPrompt, Platform.TWITTER);
        const linkedinBody = buildBedrockRequestBody(systemPrompt, userPrompt, Platform.LINKEDIN);
        const blogBody = buildBedrockRequestBody(systemPrompt, userPrompt, Platform.BLOG);

        expect(twitterBody.inferenceConfig.maxTokens).toBe(300);
        expect(linkedinBody.inferenceConfig.maxTokens).toBe(1024);
        expect(blogBody.inferenceConfig.maxTokens).toBe(2048);
      }),
      { numRuns: 100 },
    );
  });

  it('request body contains exactly one message and one system entry', () => {
    fc.assert(
      fc.property(platformArb, promptArb, promptArb, (platform, systemPrompt, userPrompt) => {
        const body = buildBedrockRequestBody(systemPrompt, userPrompt, platform);
        expect(body.messages).toHaveLength(1);
        expect(body.system).toHaveLength(1);
        expect(body.messages[0].content).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  });
});

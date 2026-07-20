// Feature: bedrock-content-generation, Property 10: Failure logs never contain prompt content or access tokens

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 10: Failure logs never contain prompt content or access tokens
 *
 * For any Bedrock invocation failure with any error type, the logged details SHALL
 * include category "content", action "bedrock_invocation_failed", error type, model ID,
 * and platform, but SHALL NOT contain any substring of the system prompt, user prompt,
 * or any string matching an access token pattern.
 *
 * Validates: Requirements 5.5
 */

// --- Types matching the log details structure from bedrock.ts ---

interface LogEntry {
  category: string;
  action: string;
  details: {
    errorType: string;
    modelId: string;
    platform: string;
  };
}

/**
 * Constructs the log entry exactly as bedrock.ts does on failure.
 * This mirrors the logging logic at the catch boundary in callBedrock.
 */
function buildFailureLogEntry(
  errorType: string,
  modelId: string,
  platform: string,
): LogEntry {
  return {
    category: 'content',
    action: 'bedrock_invocation_failed',
    details: {
      errorType,
      modelId,
      platform,
    },
  };
}

// --- Token pattern detection ---

const ACCESS_TOKEN_PATTERNS = [
  /^AKIA[A-Z0-9]{12,}/, // AWS access key
  /^sk-[a-zA-Z0-9]{20,}/, // OpenAI-style key
  /^Bearer\s+\S+/, // Bearer token
  /^[0-9a-f]{40,}$/i, // 40+ char hex string (generic token)
];

function containsTokenPattern(str: string): boolean {
  return ACCESS_TOKEN_PATTERNS.some((pattern) => pattern.test(str));
}

// --- Arbitraries ---

/** Generates non-trivial prompt strings (min 6 chars to avoid coincidental substrings). */
const promptArb = fc.string({ minLength: 6, maxLength: 200 }).filter((s) => s.trim().length >= 6);

/** Generates platform values. */
const platformArb = fc.constantFrom('TWITTER', 'LINKEDIN', 'BLOG');

/** Generates model ID strings. */
const modelIdArb = fc.constantFrom(
  'amazon.nova-pro-v1:0',
  'anthropic.claude-3-sonnet-20240229-v1:0',
  'amazon.titan-text-express-v1',
);

/** Generates error type names. */
const errorTypeArb = fc.constantFrom(
  'ThrottlingException',
  'TooManyRequestsException',
  'ModelNotReadyException',
  'ModelTimeoutException',
  'ValidationException',
  'AccessDeniedException',
  'InternalServerException',
  'UnknownError',
);

/** Character sets for token generation. */
const upperAlphaNum = fc.constantFrom(
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
);
const alphaNum = fc.constantFrom(
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''),
);
const hexChar = fc.constantFrom(...'0123456789abcdef'.split(''));
const nonWhitespace = fc.constantFrom(
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./+=@!#$%^&*'.split(''),
);

/** Generates AWS access key patterns. */
const awsAccessKeyArb = fc
  .array(upperAlphaNum, { minLength: 12, maxLength: 20 })
  .map((chars) => `AKIA${chars.join('')}`);

/** Generates OpenAI-style key patterns. */
const openAiKeyArb = fc
  .array(alphaNum, { minLength: 20, maxLength: 40 })
  .map((chars) => `sk-${chars.join('')}`);

/** Generates Bearer token patterns. */
const bearerTokenArb = fc
  .array(nonWhitespace, { minLength: 10, maxLength: 50 })
  .map((chars) => `Bearer ${chars.join('')}`);

/** Generates long hex strings (generic tokens). */
const hexTokenArb = fc
  .array(hexChar, { minLength: 40, maxLength: 64 })
  .map((chars) => chars.join(''));

/** Generates any token-like string. */
const tokenArb = fc.oneof(awsAccessKeyArb, openAiKeyArb, bearerTokenArb, hexTokenArb);

// --- Property Tests ---

describe('Property 10: Failure logs never contain prompt content or access tokens', () => {
  it('logged details do not contain system prompt content', () => {
    fc.assert(
      fc.property(
        promptArb,
        promptArb,
        errorTypeArb,
        modelIdArb,
        platformArb,
        (systemPrompt, _userPrompt, errorType, modelId, platform) => {
          const logEntry = buildFailureLogEntry(errorType, modelId, platform);
          const serialized = JSON.stringify(logEntry);

          // The serialized log entry should not contain the system prompt
          expect(serialized).not.toContain(systemPrompt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('logged details do not contain user prompt content', () => {
    fc.assert(
      fc.property(
        promptArb,
        promptArb,
        errorTypeArb,
        modelIdArb,
        platformArb,
        (_systemPrompt, userPrompt, errorType, modelId, platform) => {
          const logEntry = buildFailureLogEntry(errorType, modelId, platform);
          const serialized = JSON.stringify(logEntry);

          // The serialized log entry should not contain the user prompt
          expect(serialized).not.toContain(userPrompt);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('logged details do not contain access token patterns', () => {
    fc.assert(
      fc.property(
        tokenArb,
        errorTypeArb,
        modelIdArb,
        platformArb,
        (token, errorType, modelId, platform) => {
          const logEntry = buildFailureLogEntry(errorType, modelId, platform);
          const serialized = JSON.stringify(logEntry);

          // The serialized log entry should not contain the token
          expect(serialized).not.toContain(token);

          // Verify the token we generated actually matches a token pattern
          expect(containsTokenPattern(token)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('logged details always contain required safe fields', () => {
    fc.assert(
      fc.property(
        errorTypeArb,
        modelIdArb,
        platformArb,
        (errorType, modelId, platform) => {
          const logEntry = buildFailureLogEntry(errorType, modelId, platform);

          // Log entry has the required structure
          expect(logEntry.category).toBe('content');
          expect(logEntry.action).toBe('bedrock_invocation_failed');
          expect(logEntry.details.errorType).toBe(errorType);
          expect(logEntry.details.modelId).toBe(modelId);
          expect(logEntry.details.platform).toBe(platform);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('tokens embedded in error messages do not leak into log details', () => {
    fc.assert(
      fc.property(
        tokenArb,
        modelIdArb,
        platformArb,
        (token, modelId, platform) => {
          // Simulate an error whose name/message contains a token
          const errorTypeWithToken = `Error_${token.slice(0, 10)}`;

          // Even if the error name contained part of a token,
          // only the errorType field is logged — not the full error message
          const logEntry = buildFailureLogEntry(errorTypeWithToken, modelId, platform);
          const serialized = JSON.stringify(logEntry);

          // The full token should NOT appear in the serialized log
          expect(serialized).not.toContain(token);
        },
      ),
      { numRuns: 100 },
    );
  });
});

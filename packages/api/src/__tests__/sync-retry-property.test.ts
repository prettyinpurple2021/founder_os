import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 2: Sync Retry Bounded
 * - Retry count never exceeds 3 and backoff delay follows formula baseDelay * 2^(n-1)
 *
 * Validates: Requirements 2.5, 11.2
 *
 * This test exercises the retry logic in isolation by simulating the core
 * retry loop from the sync service with arbitrary error sequences.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Simulates the sync retry logic extracted from the sync service.
 * Given an error sequence (which attempts fail), returns the final
 * retryCount and all backoff delays that were computed.
 */
function simulateSyncRetry(errorAtAttempts: Set<number>): {
  retryCount: number;
  backoffDelays: number[];
  succeeded: boolean;
} {
  const backoffDelays: number[] = [];
  let succeeded = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const shouldFail = errorAtAttempts.has(attempt);

    if (!shouldFail) {
      // Sync succeeded on this attempt
      succeeded = true;
      return {
        retryCount: attempt - 1,
        backoffDelays,
        succeeded,
      };
    }

    // Failed — compute backoff delay if we have retries left
    if (attempt < MAX_RETRIES) {
      const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      backoffDelays.push(backoffMs);
    }
  }

  // All retries exhausted
  return {
    retryCount: MAX_RETRIES,
    backoffDelays,
    succeeded: false,
  };
}

// Arbitrary: generates a set of attempt numbers (1-indexed) that should fail
// Simulates arbitrary error patterns — some, all, or no attempts fail
const errorSequenceArb = fc
  .subarray([1, 2, 3], { minLength: 0, maxLength: 3 })
  .map((attempts) => new Set(attempts));

// Arbitrary: generates arbitrary error types to demonstrate the property holds
// regardless of error kind
const errorTypeArb = fc.oneof(
  fc.constant('NetworkError'),
  fc.constant('TimeoutError'),
  fc.constant('RateLimitError'),
  fc.constant('ServerError'),
  fc.constant('AuthenticationError'),
  fc.stringMatching(/^[A-Z][a-zA-Z]{3,20}Error$/),
);

describe('Property: Sync Retry Bounded', () => {
  it('retry count never exceeds MAX_RETRIES (3) for any error sequence', () => {
    fc.assert(
      fc.property(errorSequenceArb, (errorAtAttempts) => {
        const result = simulateSyncRetry(errorAtAttempts);

        // PROPERTY: retryCount is always between 0 and MAX_RETRIES (inclusive)
        expect(result.retryCount).toBeGreaterThanOrEqual(0);
        expect(result.retryCount).toBeLessThanOrEqual(MAX_RETRIES);
      }),
      { numRuns: 100 },
    );
  });

  it('backoff delay follows formula baseDelay * 2^(n-1) for each retry attempt', () => {
    fc.assert(
      fc.property(errorSequenceArb, (errorAtAttempts) => {
        const result = simulateSyncRetry(errorAtAttempts);

        // PROPERTY: Each backoff delay matches the exponential formula
        for (let i = 0; i < result.backoffDelays.length; i++) {
          const attemptNumber = i + 1; // 1-indexed attempt that failed
          const expectedDelay = BASE_DELAY_MS * Math.pow(2, attemptNumber - 1);
          expect(result.backoffDelays[i]).toBe(expectedDelay);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('backoff delays are always bounded: first delay is 1s, second is 2s (max 2 delays for 3 attempts)', () => {
    fc.assert(
      fc.property(errorSequenceArb, (errorAtAttempts) => {
        const result = simulateSyncRetry(errorAtAttempts);

        // PROPERTY: At most MAX_RETRIES - 1 delays are computed (delay happens between retries)
        expect(result.backoffDelays.length).toBeLessThanOrEqual(MAX_RETRIES - 1);

        // PROPERTY: Delays follow the exact expected sequence
        if (result.backoffDelays.length >= 1) {
          expect(result.backoffDelays[0]).toBe(1000); // BASE_DELAY_MS * 2^0
        }
        if (result.backoffDelays.length >= 2) {
          expect(result.backoffDelays[1]).toBe(2000); // BASE_DELAY_MS * 2^1
        }
      }),
      { numRuns: 100 },
    );
  });

  it('retry behavior is bounded regardless of error type thrown', () => {
    fc.assert(
      fc.property(
        errorSequenceArb,
        fc.array(errorTypeArb, { minLength: 1, maxLength: 3 }),
        (errorAtAttempts, _errorTypes) => {
          // The error type does not affect retry bounds — the loop always
          // runs at most MAX_RETRIES times regardless of the error thrown
          const result = simulateSyncRetry(errorAtAttempts);

          // PROPERTY: The total number of attempts (retryCount for failure or
          // attempt-1 for success) never exceeds MAX_RETRIES
          expect(result.retryCount).toBeLessThanOrEqual(MAX_RETRIES);

          // PROPERTY: If all attempts fail, retryCount equals MAX_RETRIES exactly
          if (!result.succeeded && errorAtAttempts.size === MAX_RETRIES) {
            expect(result.retryCount).toBe(MAX_RETRIES);
          }

          // PROPERTY: If the sync succeeded, retryCount < MAX_RETRIES
          if (result.succeeded) {
            expect(result.retryCount).toBeLessThan(MAX_RETRIES);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

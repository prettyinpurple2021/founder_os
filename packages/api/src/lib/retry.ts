/**
 * Global Retry Utility
 *
 * Provides a reusable retry mechanism with exponential backoff for any async operation.
 * Usable by the sync service, content generator, and any other service that calls
 * external APIs.
 *
 * Default behavior:
 *   - attempt 1: immediate
 *   - attempt 2: wait 1s (baseDelayMs * 2^0)
 *   - attempt 3: wait 2s (baseDelayMs * 2^1)
 *   - If all fail: throws the last error
 *
 * Requirements: 11.2 — IF an external service call fails, THEN THE System SHALL
 * retry the operation up to 3 times with exponential backoff.
 */

/**
 * Options for configuring the retry behavior.
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;

  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs?: number;

  /** Multiplier for exponential backoff (default: 2) */
  factor?: number;

  /**
   * Optional callback invoked on each failed attempt before retrying.
   * Receives the error and the current attempt number (1-indexed).
   * Can be used for logging or custom side effects.
   */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void | Promise<void>;

  /**
   * Optional predicate to determine if an error is retryable.
   * If provided and returns false, the error is thrown immediately without further retries.
   * Default: all errors are retryable.
   */
  isRetryable?: (error: Error) => boolean;
}

/** Default retry configuration matching the design spec. */
const DEFAULTS: Required<Pick<RetryOptions, 'maxAttempts' | 'baseDelayMs' | 'factor'>> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  factor: 2,
};

/**
 * Delays execution for a given number of milliseconds.
 * Extracted for testability (can be overridden in tests via the delayFn parameter).
 */
export function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates the backoff delay for a given attempt.
 *
 * Attempt 1: immediate (0ms — first attempt has no delay)
 * Attempt 2: baseDelayMs * factor^0 = baseDelayMs (1000ms)
 * Attempt 3: baseDelayMs * factor^1 = baseDelayMs * 2 (2000ms)
 *
 * @param attempt - The current attempt number (1-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param factor - Exponential backoff factor
 * @returns The delay in milliseconds (0 for the first attempt)
 */
export function calculateBackoff(attempt: number, baseDelayMs: number, factor: number): number {
  if (attempt <= 1) return 0;
  return baseDelayMs * Math.pow(factor, attempt - 2);
}

/**
 * Executes an async function with retry logic and exponential backoff.
 *
 * @param fn - The async function to execute (will be called with no arguments)
 * @param options - Optional retry configuration
 * @param delayFn - Optional delay function (for testing, defaults to setTimeout-based delay)
 * @returns The result of the function if it succeeds within the allowed attempts
 * @throws The last error encountered if all attempts are exhausted
 *
 * @example
 * ```typescript
 * // Basic usage with defaults (3 attempts, 1s base delay)
 * const data = await withRetry(() => fetchFromGitHub(url));
 *
 * // Custom configuration
 * const result = await withRetry(
 *   () => callLLMApi(prompt),
 *   {
 *     maxAttempts: 5,
 *     baseDelayMs: 500,
 *     onRetry: (err, attempt, delay) => {
 *       console.log(`Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms`);
 *     },
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
  delayFn: (ms: number) => Promise<void> = defaultDelay,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULTS.maxAttempts;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const factor = options?.factor ?? DEFAULTS.factor;
  const onRetry = options?.onRetry;
  const isRetryable = options?.isRetryable;

  if (maxAttempts < 1) {
    throw new Error('maxAttempts must be at least 1');
  }

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if the error is retryable
      if (isRetryable && !isRetryable(lastError)) {
        throw lastError;
      }

      // If we've exhausted all attempts, throw
      if (attempt >= maxAttempts) {
        break;
      }

      // Calculate backoff delay for the next attempt
      const backoffMs = calculateBackoff(attempt + 1, baseDelayMs, factor);

      // Invoke the onRetry callback if provided
      if (onRetry) {
        await onRetry(lastError, attempt, backoffMs);
      }

      // Wait before retrying
      await delayFn(backoffMs);
    }
  }

  // All attempts exhausted — throw the last error
  throw lastError!;
}

/**
 * Unit Tests for Global Retry Utility
 *
 * Tests the withRetry function for correct retry behavior, exponential backoff,
 * error handling, and configurability.
 *
 * Requirements: 11.2 — IF an external service call fails, THEN THE System SHALL
 * retry the operation up to 3 times with exponential backoff.
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry, calculateBackoff } from '../lib/retry.js';

/** A no-op delay function for tests (resolves immediately). */
const noDelay = async (_ms: number): Promise<void> => {};

describe('Global Retry Utility', () => {
  describe('withRetry', () => {
    it('should return the result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn, undefined, noDelay);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry up to 3 times by default and succeed on second attempt', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, undefined, noDelay);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry up to 3 times and succeed on third attempt', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, undefined, noDelay);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw the last error after exhausting all 3 attempts', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'));

      await expect(withRetry(fn, undefined, noDelay)).rejects.toThrow('fail 3');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff delays between attempts', async () => {
      const delays: number[] = [];
      const trackingDelay = async (ms: number): Promise<void> => {
        delays.push(ms);
      };

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'));

      await expect(withRetry(fn, undefined, trackingDelay)).rejects.toThrow('fail 3');

      // attempt 1 fails -> delay before attempt 2: baseDelay * 2^0 = 1000ms
      // attempt 2 fails -> delay before attempt 3: baseDelay * 2^1 = 2000ms
      expect(delays).toEqual([1000, 2000]);
    });

    it('should respect custom maxAttempts option', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'))
        .mockRejectedValueOnce(new Error('fail 4'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 5 }, noDelay);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should respect custom baseDelayMs option', async () => {
      const delays: number[] = [];
      const trackingDelay = async (ms: number): Promise<void> => {
        delays.push(ms);
      };

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'));

      await expect(
        withRetry(fn, { baseDelayMs: 500 }, trackingDelay)
      ).rejects.toThrow('fail 3');

      // baseDelay = 500: attempt 2 delay = 500 * 2^0 = 500, attempt 3 delay = 500 * 2^1 = 1000
      expect(delays).toEqual([500, 1000]);
    });

    it('should respect custom factor option', async () => {
      const delays: number[] = [];
      const trackingDelay = async (ms: number): Promise<void> => {
        delays.push(ms);
      };

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'));

      await expect(
        withRetry(fn, { factor: 3 }, trackingDelay)
      ).rejects.toThrow('fail 3');

      // factor = 3: attempt 2 delay = 1000 * 3^0 = 1000, attempt 3 delay = 1000 * 3^1 = 3000
      expect(delays).toEqual([1000, 3000]);
    });

    it('should call onRetry callback on each retry with correct arguments', async () => {
      const onRetry = vi.fn();

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      await withRetry(fn, { onRetry }, noDelay);

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: 'network error' }), 1, 1000);
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.objectContaining({ message: 'timeout' }), 2, 2000);
    });

    it('should not call onRetry when the first attempt succeeds', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn().mockResolvedValue('success');

      await withRetry(fn, { onRetry }, noDelay);

      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should stop retrying when isRetryable returns false', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('non-retryable error'));

      const isRetryable = (err: Error) => !err.message.includes('non-retryable');

      await expect(
        withRetry(fn, { isRetryable }, noDelay)
      ).rejects.toThrow('non-retryable error');

      // Should only attempt once since the error is non-retryable
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should continue retrying when isRetryable returns true', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('retryable error'))
        .mockResolvedValue('success');

      const isRetryable = () => true;

      const result = await withRetry(fn, { isRetryable }, noDelay);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should convert non-Error throws to Error instances', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce('string error')
        .mockRejectedValueOnce(42)
        .mockRejectedValueOnce({ some: 'object' });

      await expect(withRetry(fn, undefined, noDelay)).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw if maxAttempts is less than 1', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await expect(
        withRetry(fn, { maxAttempts: 0 }, noDelay)
      ).rejects.toThrow('maxAttempts must be at least 1');

      expect(fn).not.toHaveBeenCalled();
    });

    it('should work with maxAttempts of 1 (no retries)', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error('single attempt'));

      await expect(
        withRetry(fn, { maxAttempts: 1 }, noDelay)
      ).rejects.toThrow('single attempt');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle async onRetry callbacks', async () => {
      const order: string[] = [];
      const onRetry = async () => {
        order.push('onRetry');
      };

      const fn = vi.fn()
        .mockImplementationOnce(async () => {
          order.push('attempt 1');
          throw new Error('fail');
        })
        .mockImplementationOnce(async () => {
          order.push('attempt 2');
          return 'success';
        });

      await withRetry(fn, { onRetry }, noDelay);

      expect(order).toEqual(['attempt 1', 'onRetry', 'attempt 2']);
    });
  });

  describe('calculateBackoff', () => {
    it('should return 0 for the first attempt', () => {
      expect(calculateBackoff(1, 1000, 2)).toBe(0);
    });

    it('should return baseDelayMs for the second attempt', () => {
      expect(calculateBackoff(2, 1000, 2)).toBe(1000);
    });

    it('should return baseDelayMs * factor for the third attempt', () => {
      expect(calculateBackoff(3, 1000, 2)).toBe(2000);
    });

    it('should return baseDelayMs * factor^2 for the fourth attempt', () => {
      expect(calculateBackoff(4, 1000, 2)).toBe(4000);
    });

    it('should handle custom base delay', () => {
      expect(calculateBackoff(2, 500, 2)).toBe(500);
      expect(calculateBackoff(3, 500, 2)).toBe(1000);
    });

    it('should handle custom factor', () => {
      expect(calculateBackoff(2, 1000, 3)).toBe(1000);
      expect(calculateBackoff(3, 1000, 3)).toBe(3000);
      expect(calculateBackoff(4, 1000, 3)).toBe(9000);
    });
  });
});

/**
 * Unit tests for the data preservation transaction utility.
 *
 * Validates: Requirement 11.4 - THE System SHALL preserve all User data
 * and drafts during external service outages.
 *
 * Tests verify:
 * 1. Successful operations commit and return data
 * 2. External service failures trigger rollback (no partial writes)
 * 3. Database errors trigger rollback
 * 4. Error classification (retryable vs non-retryable) is correct
 * 5. The throwing variant (withDataPreservationOrThrow) behaves correctly
 * 6. Timeout configuration is respected
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

import prisma from '../lib/prisma.js';
import { withDataPreservation, withDataPreservationOrThrow } from '../lib/transaction.js';
import { AppError } from '../errors/AppError.js';

const mockTransaction = vi.mocked(prisma.$transaction);

describe('Data Preservation Transaction Utility (Requirement 11.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withDataPreservation', () => {
    it('should return success with data when operation succeeds', async () => {
      const expectedData = { id: 'draft-1', content: 'Generated content' };

      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        return expectedData;
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedData);
      expect(result.error).toBeUndefined();
    });

    it('should rollback and return error when external service call fails', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        // Simulate writing data to DB first, then external service fails
        throw new Error('OpenAI API error (503): Service temporarily unavailable');
      }, { operationName: 'generate-content-draft' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('OpenAI API error');
      expect(result.error!.operationName).toBe('generate-content-draft');
      expect(result.error!.retryable).toBe(true); // 503 is retryable
    });

    it('should rollback and return error when database operation fails', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new Error('Unique constraint violation on field: userId');
      }, { operationName: 'connect-repo' });

      expect(result.success).toBe(false);
      expect(result.error!.message).toContain('Unique constraint violation');
      expect(result.error!.retryable).toBe(false);
    });

    it('should classify network timeout errors as retryable', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new Error('Request timeout: GitHub API did not respond');
      });

      expect(result.success).toBe(false);
      expect(result.error!.retryable).toBe(true);
    });

    it('should classify ECONNREFUSED errors as retryable', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      });

      expect(result.success).toBe(false);
      expect(result.error!.retryable).toBe(true);
    });

    it('should classify ECONNRESET errors as retryable', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new Error('socket hang up ECONNRESET');
      });

      expect(result.success).toBe(false);
      expect(result.error!.retryable).toBe(true);
    });

    it('should classify rate limit errors as retryable', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new Error('API rate limit exceeded. Please retry later (429)');
      });

      expect(result.success).toBe(false);
      expect(result.error!.retryable).toBe(true);
    });

    it('should classify generic errors as non-retryable', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new Error('Invalid input format');
      });

      expect(result.success).toBe(false);
      expect(result.error!.retryable).toBe(false);
    });

    it('should respect AppError retryable flag', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new AppError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'LLM API is down',
          statusCode: 503,
          retryable: true,
        });
      });

      expect(result.success).toBe(false);
      expect(result.error!.retryable).toBe(true);
      expect(result.error!.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should use AppError code when available', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
          statusCode: 404,
          retryable: false,
        });
      });

      expect(result.error!.code).toBe('NOT_FOUND');
      expect(result.error!.retryable).toBe(false);
    });

    it('should pass timeout option to Prisma transaction', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      await withDataPreservation(async (_tx) => {
        return 'data';
      }, { timeout: 60000 });

      expect(mockTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 60000 },
      );
    });

    it('should use default 30s timeout when not specified', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      await withDataPreservation(async (_tx) => {
        return 'data';
      });

      expect(mockTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 30000 },
      );
    });

    it('should handle Prisma transaction-level errors (e.g., timeout)', async () => {
      // Simulate Prisma itself throwing due to transaction timeout
      mockTransaction.mockRejectedValue(
        new Error('Transaction API error: Transaction already closed: A commit cannot be executed on an expired transaction.')
      );

      const result = await withDataPreservation(async (_tx) => {
        return 'never reaches here';
      }, { operationName: 'slow-sync' });

      expect(result.success).toBe(false);
      expect(result.error!.message).toContain('Transaction');
      expect(result.error!.operationName).toBe('slow-sync');
    });

    it('should default operationName to unknown when not provided', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw new Error('Something failed');
      });

      expect(result.error!.operationName).toBe('unknown');
    });

    it('should handle non-Error thrown values gracefully', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const result = await withDataPreservation(async (_tx) => {
        throw 'string error'; // non-Error throw
      });

      expect(result.success).toBe(false);
      expect(result.error!.message).toBe('Unknown error during transaction');
      expect(result.error!.retryable).toBe(false);
    });

    it('should ensure data is preserved when external service fails mid-operation', async () => {
      // This test simulates the key scenario: multiple DB writes followed by
      // an external service call that fails. The transaction ensures ALL
      // writes are rolled back.
      const writtenRecords: string[] = [];

      mockTransaction.mockImplementation(async (fn: any) => {
        const fakeTx = {
          contentDraft: {
            create: async () => {
              writtenRecords.push('draft-created');
              return { id: 'draft-1' };
            },
          },
          draftVersion: {
            create: async () => {
              writtenRecords.push('version-created');
              return { id: 'version-1' };
            },
          },
        };

        try {
          return await fn(fakeTx);
        } catch (err) {
          // In a real Prisma transaction, all writes would be rolled back here
          writtenRecords.length = 0; // Simulate rollback
          throw err;
        }
      });

      const result = await withDataPreservation(async (tx: any) => {
        // Step 1: Create draft record
        await tx.contentDraft.create({ data: { content: 'test' } });

        // Step 2: Create version record
        await tx.draftVersion.create({ data: { version: 1 } });

        // Step 3: External service call fails
        throw new Error('LLM API connection refused');
      }, { operationName: 'generate-content' });

      expect(result.success).toBe(false);
      // After rollback, no records should persist
      expect(writtenRecords).toHaveLength(0);
    });
  });

  describe('withDataPreservationOrThrow', () => {
    it('should return data directly on success', async () => {
      const expectedData = { id: 'repo-1', name: 'my-app' };

      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      const data = await withDataPreservationOrThrow(async (_tx) => {
        return expectedData;
      });

      expect(data).toEqual(expectedData);
    });

    it('should throw AppError with SERVICE_UNAVAILABLE on failure', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      await expect(
        withDataPreservationOrThrow(async (_tx) => {
          throw new Error('GitHub API returned 500');
        }, { operationName: 'sync-repository' }),
      ).rejects.toThrow(AppError);
    });

    it('should include operation name and "no data modified" message in thrown error', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      try {
        await withDataPreservationOrThrow(async (_tx) => {
          throw new Error('Connection timeout');
        }, { operationName: 'sync-repository' });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(503);
        expect(appErr.message).toContain('sync-repository');
        expect(appErr.message).toContain('No data was modified');
        expect(appErr.context).toHaveProperty('operationName', 'sync-repository');
        expect(appErr.context).toHaveProperty('retryable', true);
      }
    });

    it('should mark non-retryable errors correctly in thrown error context', async () => {
      mockTransaction.mockImplementation(async (fn: any) => {
        return await fn({});
      });

      try {
        await withDataPreservationOrThrow(async (_tx) => {
          throw new AppError({
            code: 'BAD_REQUEST',
            message: 'Invalid repository URL',
            statusCode: 400,
            retryable: false,
          });
        }, { operationName: 'connect-repo' });
        expect(true).toBe(false);
      } catch (err) {
        const appErr = err as AppError;
        expect(appErr.context).toHaveProperty('retryable', false);
      }
    });
  });
});

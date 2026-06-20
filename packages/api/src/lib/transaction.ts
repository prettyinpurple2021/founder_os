/**
 * Data Preservation Transaction Utility
 *
 * Wraps external service calls in Prisma interactive transactions to ensure
 * that user data and drafts are never corrupted by partial writes when
 * external services (GitHub API, LLM API) fail.
 *
 * Pattern:
 * 1. Starts a Prisma interactive transaction
 * 2. Executes the provided operations (which may include external API calls)
 * 3. Commits if all operations succeed
 * 4. Rolls back automatically if any step fails (including external service errors)
 *
 * This guarantees that no partial data is written to the database during
 * external service outages (Requirement 11.4).
 *
 * @module lib/transaction
 */

import prisma from './prisma.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppError, serviceUnavailable } from '../errors/AppError.js';

/**
 * A transactional Prisma client instance passed to the operation callback.
 * Supports all Prisma model operations within the transaction scope.
 */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Options for configuring the transactional operation.
 */
export interface TransactionOptions {
  /** Maximum time (ms) the transaction can run before being rolled back. Default: 30000 (30s) */
  timeout?: number;
  /** Operation name for error reporting and logging context */
  operationName?: string;
}

/**
 * Result of a transactional operation, indicating success/failure and any data.
 */
export interface TransactionResult<T> {
  /** Whether the operation completed successfully */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** Error information if the operation failed */
  error?: {
    message: string;
    code: string;
    retryable: boolean;
    operationName?: string;
  };
}

/**
 * Wraps an operation in a Prisma interactive transaction for data preservation.
 *
 * The callback receives a transactional Prisma client (`tx`) that must be used
 * for all database operations within the scope. If the callback throws (due to
 * an external service failure or any other error), all database changes made
 * through `tx` are automatically rolled back.
 *
 * This ensures that user data and drafts are never left in an inconsistent state
 * when external services (GitHub API, LLM API) experience outages.
 *
 * @example
 * ```typescript
 * const result = await withDataPreservation(async (tx) => {
 *   // Step 1: Write preliminary data to DB
 *   const draft = await tx.contentDraft.create({ data: { ... } });
 *
 *   // Step 2: Call external service (may fail)
 *   const content = await callLLM(systemPrompt, userPrompt);
 *
 *   // Step 3: Update DB with external service result
 *   const updated = await tx.contentDraft.update({
 *     where: { id: draft.id },
 *     data: { currentContent: content },
 *   });
 *
 *   return updated;
 *   // If Step 2 fails, Step 1 is rolled back automatically
 * }, { operationName: 'generate-content-draft' });
 * ```
 *
 * @param operation - Async function receiving a transactional Prisma client
 * @param options - Configuration options for the transaction
 * @returns A TransactionResult indicating success/failure with data or error info
 */
export async function withDataPreservation<T>(
  operation: (tx: TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<TransactionResult<T>> {
  const { timeout = 30000, operationName = 'unknown' } = options;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        return await operation(tx as unknown as TransactionClient);
      },
      {
        timeout,
      },
    );

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    // Determine if the error is retryable based on its type
    const isRetryable = isRetryableError(error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during transaction';
    const errorCode = error instanceof AppError ? error.code : 'TRANSACTION_FAILED';

    return {
      success: false,
      error: {
        message: errorMessage,
        code: errorCode,
        retryable: isRetryable,
        operationName,
      },
    };
  }
}

/**
 * Wraps an operation in a transaction and throws on failure.
 *
 * Unlike `withDataPreservation` which returns a result object, this function
 * throws an AppError if the transaction fails. Use this when you want the
 * error to propagate up to the Express error handler.
 *
 * @param operation - Async function receiving a transactional Prisma client
 * @param options - Configuration options for the transaction
 * @returns The result of the operation if successful
 * @throws AppError with SERVICE_UNAVAILABLE status if the operation fails
 */
export async function withDataPreservationOrThrow<T>(
  operation: (tx: TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const result = await withDataPreservation(operation, options);

  if (!result.success) {
    throw serviceUnavailable(
      `Operation '${result.error!.operationName}' failed: ${result.error!.message}. No data was modified.`,
      {
        operationName: result.error!.operationName,
        retryable: result.error!.retryable,
      },
    );
  }

  return result.data!;
}

/**
 * Determines if an error is retryable (e.g., network timeouts, rate limits).
 * Non-retryable errors include validation failures, not-found, and auth errors.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network and timeout errors are generally retryable
    if (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('network') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('429')
    ) {
      return true;
    }
  }

  return false;
}

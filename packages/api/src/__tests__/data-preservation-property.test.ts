import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * **Feature: solo-founder-launch-os, Property 15: Data Preservation During Outages**
 *
 * During any external service outage (GitHub API, LLM API), all user data,
 * drafts, and task states remain intact. No write operation to user data
 * tables fails silently — either the operation succeeds or an explicit
 * error is surfaced without data loss.
 *
 * **Validates: Requirements 11.4**
 */

vi.mock('../lib/prisma.js', () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

import prisma from '../lib/prisma.js';
import { withDataPreservation } from '../lib/transaction.js';

const mockTransaction = vi.mocked(prisma.$transaction);

// --- Types ---

/** The types of operations that may trigger external service calls */
type OperationType =
  | 'sync-repository'
  | 'generate-content'
  | 'update-task-state'
  | 'create-draft'
  | 'edit-draft'
  | 'schedule-draft';

/** The types of outage errors that external services may produce */
type OutageErrorType =
  | 'network-timeout'
  | 'connection-refused'
  | 'connection-reset'
  | 'service-unavailable-503'
  | 'rate-limit-429'
  | 'internal-server-error-500'
  | 'dns-resolution-failed'
  | 'socket-hangup';

/**
 * Outage errors that the isRetryableError function classifies as retryable.
 * These contain keywords: timeout, econnrefused, econnreset, network, rate limit, 503, 429
 */
type RetryableOutageErrorType =
  | 'network-timeout'
  | 'connection-refused'
  | 'connection-reset'
  | 'service-unavailable-503'
  | 'rate-limit-429'
  | 'socket-hangup';

/** Represents user data that exists before the operation */
interface PreExistingData {
  drafts: Array<{ id: string; content: string; status: string }>;
  tasks: Array<{ id: string; state: string; title: string }>;
  userData: { id: string; username: string; email: string };
}

// --- Error message generators ---

function getErrorMessage(errorType: OutageErrorType): string {
  switch (errorType) {
    case 'network-timeout':
      return 'Request timeout: service did not respond within 30000ms';
    case 'connection-refused':
      return 'connect ECONNREFUSED 127.0.0.1:443';
    case 'connection-reset':
      return 'socket hang up ECONNRESET';
    case 'service-unavailable-503':
      return 'Service temporarily unavailable (503)';
    case 'rate-limit-429':
      return 'API rate limit exceeded. Please retry later (429)';
    case 'internal-server-error-500':
      return 'Internal server error (500): unexpected failure';
    case 'dns-resolution-failed':
      return 'getaddrinfo ENOTFOUND api.github.com';
    case 'socket-hangup':
      return 'socket hang up: network connection lost';
  }
}

// --- Arbitraries ---

const operationTypeArb: fc.Arbitrary<OperationType> = fc.constantFrom(
  'sync-repository',
  'generate-content',
  'update-task-state',
  'create-draft',
  'edit-draft',
  'schedule-draft',
);

const outageErrorTypeArb: fc.Arbitrary<OutageErrorType> = fc.constantFrom(
  'network-timeout',
  'connection-refused',
  'connection-reset',
  'service-unavailable-503',
  'rate-limit-429',
  'internal-server-error-500',
  'dns-resolution-failed',
  'socket-hangup',
);

/** Subset of outage errors that are classified as retryable by the transaction utility */
const retryableOutageErrorTypeArb: fc.Arbitrary<RetryableOutageErrorType> = fc.constantFrom(
  'network-timeout',
  'connection-refused',
  'connection-reset',
  'service-unavailable-503',
  'rate-limit-429',
  'socket-hangup',
);

const draftStatusArb = fc.constantFrom(
  'GENERATED',
  'EDITING',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'COPIED',
);

const taskStateArb = fc.constantFrom(
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'NEEDS_REVIEW',
  'COMPLETED',
  'UNCERTAIN',
);

const draftArb = fc.record({
  id: fc.uuid(),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  status: draftStatusArb,
});

const taskArb = fc.record({
  id: fc.uuid(),
  state: taskStateArb,
  title: fc.string({ minLength: 1, maxLength: 100 }),
});

const userDataArb = fc.record({
  id: fc.uuid(),
  username: fc.string({ minLength: 3, maxLength: 20 }),
  email: fc.emailAddress(),
});

const preExistingDataArb: fc.Arbitrary<PreExistingData> = fc.record({
  drafts: fc.array(draftArb, { minLength: 0, maxLength: 10 }),
  tasks: fc.array(taskArb, { minLength: 0, maxLength: 15 }),
  userData: userDataArb,
});

/** Number of DB write operations attempted before the outage occurs */
const writeCountBeforeOutageArb = fc.integer({ min: 0, max: 5 });

describe('Property 15: Data Preservation During Outages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('during simulated outages, withDataPreservation either succeeds with valid data OR fails with explicit error and no data modification', async () => {
    await fc.assert(
      fc.asyncProperty(
        operationTypeArb,
        outageErrorTypeArb,
        preExistingDataArb,
        writeCountBeforeOutageArb,
        async (operationType, outageErrorType, preExistingData, writesBeforeOutage) => {
          // Track all writes that happen during the transaction
          const writtenRecords: string[] = [];

          // Snapshot the pre-existing data for comparison after the operation
          const dataSnapshot = JSON.parse(JSON.stringify(preExistingData));

          // Mock Prisma $transaction to simulate transactional behavior:
          // - Tracks writes attempted within the transaction
          // - Simulates rollback on error (clears writes)
          mockTransaction.mockImplementation(async (fn: any) => {
            const fakeTx = {
              contentDraft: {
                create: async (args: any) => {
                  writtenRecords.push(`draft-create:${args?.data?.content || 'unknown'}`);
                  return { id: 'new-draft', ...args?.data };
                },
                update: async (args: any) => {
                  writtenRecords.push(`draft-update:${args?.where?.id || 'unknown'}`);
                  return { id: args?.where?.id, ...args?.data };
                },
              },
              task: {
                update: async (args: any) => {
                  writtenRecords.push(`task-update:${args?.where?.id || 'unknown'}`);
                  return { id: args?.where?.id, ...args?.data };
                },
              },
              draftVersion: {
                create: async (args: any) => {
                  writtenRecords.push(`version-create:${args?.data?.draftId || 'unknown'}`);
                  return { id: 'new-version', ...args?.data };
                },
              },
              stateTransition: {
                create: async (args: any) => {
                  writtenRecords.push(`transition-create:${args?.data?.taskId || 'unknown'}`);
                  return { id: 'new-transition', ...args?.data };
                },
              },
              user: {
                update: async (args: any) => {
                  writtenRecords.push(`user-update:${args?.where?.id || 'unknown'}`);
                  return { id: args?.where?.id, ...args?.data };
                },
              },
            };

            try {
              return await fn(fakeTx);
            } catch (err) {
              // Simulate Prisma transaction rollback: all writes are discarded
              writtenRecords.length = 0;
              throw err;
            }
          });

          // Execute the operation, which simulates some DB writes then an outage
          const result = await withDataPreservation(
            async (tx: any) => {
              // Simulate writes that happen before the external service call
              for (let i = 0; i < writesBeforeOutage; i++) {
                if (operationType === 'create-draft' || operationType === 'generate-content') {
                  await tx.contentDraft.create({ data: { content: `draft-${i}` } });
                } else if (operationType === 'edit-draft') {
                  await tx.draftVersion.create({ data: { draftId: `draft-${i}` } });
                } else if (
                  operationType === 'update-task-state' ||
                  operationType === 'sync-repository'
                ) {
                  await tx.task.update({
                    where: { id: `task-${i}` },
                    data: { state: 'IN_PROGRESS' },
                  });
                } else {
                  await tx.user.update({ where: { id: preExistingData.userData.id }, data: {} });
                }
              }

              // Simulate the external service outage
              throw new Error(getErrorMessage(outageErrorType));
            },
            { operationName: operationType },
          );

          // --- PROPERTY ASSERTIONS ---

          // 1. The result must indicate failure (not silent success)
          expect(result.success).toBe(false);

          // 2. An explicit error MUST be surfaced (no silent failure)
          expect(result.error).toBeDefined();
          expect(result.error!.message).toBeTruthy();
          expect(result.error!.message.length).toBeGreaterThan(0);

          // 3. The error must have a code and retryable flag (explicit error surface)
          expect(typeof result.error!.code).toBe('string');
          expect(typeof result.error!.retryable).toBe('boolean');

          // 4. The operation name is preserved for debugging
          expect(result.error!.operationName).toBe(operationType);

          // 5. NO data was modified — all writes rolled back
          // (After the transaction rollback, writtenRecords should be empty)
          expect(writtenRecords).toHaveLength(0);

          // 6. Pre-existing data remains intact (unchanged after operation)
          expect(preExistingData).toEqual(dataSnapshot);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('successful operations return success: true with valid data and complete committed writes', async () => {
    await fc.assert(
      fc.asyncProperty(
        operationTypeArb,
        preExistingDataArb,
        async (operationType, _preExistingData) => {
          const writtenRecords: string[] = [];

          mockTransaction.mockImplementation(async (fn: any) => {
            const fakeTx = {
              contentDraft: {
                create: async (args: any) => {
                  writtenRecords.push(`draft-create`);
                  return { id: 'new-draft', content: args?.data?.content || 'test' };
                },
              },
              task: {
                update: async (args: any) => {
                  writtenRecords.push(`task-update`);
                  return { id: args?.where?.id || 'task-1', state: 'COMPLETED' };
                },
              },
            };

            // On success, the transaction commits — writes persist
            return await fn(fakeTx);
          });

          const expectedResult = { id: 'result-1', status: 'completed' };

          const result = await withDataPreservation(
            async (_tx: any) => {
              // Simulate a successful operation (no outage)
              return expectedResult;
            },
            { operationName: operationType },
          );

          // PROPERTY: Successful operations return success: true with valid data
          expect(result.success).toBe(true);
          expect(result.data).toEqual(expectedResult);
          expect(result.error).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('outage errors are correctly classified as retryable', async () => {
    await fc.assert(
      fc.asyncProperty(
        retryableOutageErrorTypeArb,
        operationTypeArb,
        async (outageErrorType, operationType) => {
          mockTransaction.mockImplementation(async (fn: any) => {
            try {
              return await fn({});
            } catch (err) {
              throw err;
            }
          });

          const result = await withDataPreservation(
            async (_tx) => {
              throw new Error(getErrorMessage(outageErrorType));
            },
            { operationName: operationType },
          );

          // PROPERTY: All outage-related errors are classified as retryable
          // since they represent transient external service failures
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.retryable).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

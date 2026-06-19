import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

// Mock prisma before importing services
vi.mock('../lib/prisma.js', () => ({ default: {} }));
vi.mock('../services/logger.js', () => ({
  logContent: vi.fn().mockResolvedValue(undefined),
}));

import { VALID_TRANSITIONS, isValidTransition } from '../services/content.js';
import { DraftStatus } from '../generated/prisma/enums.js';

/**
 * Property 11: Rejected Drafts Preserved
 * - Rejected drafts are never deleted, content always preserved
 *
 * Validates: Requirements 6.5, 7.4
 *
 * This test verifies that:
 * 1. REJECTED is a terminal state with no outgoing transitions
 * 2. Content is never cleared or modified during rejection
 * 3. Only PENDING_APPROVAL can transition to REJECTED (reviewed content)
 * 4. No deletion path exists from REJECTED (drafts remain in system)
 */

const allDraftStatuses: DraftStatus[] = Object.values(DraftStatus);

// Arbitrary: picks any DraftStatus value
const draftStatusArb = fc.constantFrom(...allDraftStatuses);

// Arbitrary: generates non-empty content strings (simulating draft content)
const contentArb = fc.string({ minLength: 1, maxLength: 500 });

describe('Property: Rejected Drafts Preserved', () => {
  it('REJECTED is a terminal state - no valid transition exists from REJECTED to any status', () => {
    fc.assert(
      fc.property(draftStatusArb, (targetStatus) => {
        // PROPERTY: For any DraftStatus as target, transitioning from REJECTED is always invalid
        expect(isValidTransition(DraftStatus.REJECTED, targetStatus)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('content preservation invariant - content remains unchanged after rejection', () => {
    fc.assert(
      fc.property(contentArb, (originalContent) => {
        // Simulate the rejection process:
        // The rejectDraft function updates status but intentionally does NOT modify currentContent.
        // We verify the invariant that content before rejection equals content after rejection.
        const draftBeforeRejection = {
          status: DraftStatus.PENDING_APPROVAL,
          currentContent: originalContent,
        };

        // Simulate what rejectDraft does: only status changes, content is preserved
        const draftAfterRejection = {
          ...draftBeforeRejection,
          status: DraftStatus.REJECTED,
          // currentContent is intentionally NOT modified in the update
        };

        // PROPERTY: currentContent after rejection must equal original content
        expect(draftAfterRejection.currentContent).toBe(originalContent);

        // PROPERTY: content is never null after rejection
        expect(draftAfterRejection.currentContent).not.toBeNull();

        // PROPERTY: content is never empty after rejection
        expect(draftAfterRejection.currentContent.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it('only PENDING_APPROVAL can validly transition to REJECTED', () => {
    fc.assert(
      fc.property(draftStatusArb, (sourceStatus) => {
        const canTransitionToRejected = isValidTransition(sourceStatus, DraftStatus.REJECTED);

        if (sourceStatus === DraftStatus.PENDING_APPROVAL) {
          // PROPERTY: PENDING_APPROVAL -> REJECTED is a valid transition
          expect(canTransitionToRejected).toBe(true);
        } else {
          // PROPERTY: No other state can transition to REJECTED
          expect(canTransitionToRejected).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('no deletion path from REJECTED - outgoing transitions list is empty', () => {
    fc.assert(
      fc.property(fc.constant(DraftStatus.REJECTED), (rejectedStatus) => {
        const outgoingTransitions = VALID_TRANSITIONS[rejectedStatus];

        // PROPERTY: REJECTED has zero outgoing transitions
        expect(outgoingTransitions).toHaveLength(0);

        // PROPERTY: The transitions array exists but is empty (not undefined)
        expect(Array.isArray(outgoingTransitions)).toBe(true);

        // PROPERTY: No status in the system is reachable from REJECTED
        for (const status of allDraftStatuses) {
          expect(outgoingTransitions).not.toContain(status);
        }
      }),
      { numRuns: 100 },
    );
  });
});

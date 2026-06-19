import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('../lib/prisma.js', () => ({ default: {} }));
vi.mock('../services/logger.js', () => ({
  logContent: vi.fn().mockResolvedValue(undefined),
}));

import { VALID_TRANSITIONS, isValidTransition, validateTransition } from '../services/content.js';
import { DraftStatus } from '../generated/prisma/enums.js';

/**
 * Property 10: No Auto-Publishing Invariant
 * - No draft reaches SCHEDULED or COPIED status without a prior approval log entry
 *
 * Validates: Requirements 6.6, 7.1
 *
 * This test exercises the state machine transitions to prove that SCHEDULED and COPIED
 * states are unreachable without passing through the approval gate (APPROVED state),
 * which itself requires PENDING_APPROVAL (explicit user submission for review).
 */

const ALL_STATUSES: DraftStatus[] = [
  DraftStatus.GENERATED,
  DraftStatus.EDITING,
  DraftStatus.PENDING_APPROVAL,
  DraftStatus.APPROVED,
  DraftStatus.REJECTED,
  DraftStatus.SCHEDULED,
  DraftStatus.COPIED,
];

/**
 * Finds all valid paths from a starting state using BFS.
 * Returns an array of paths, where each path is an array of states visited in order.
 */
function findAllValidPaths(start: DraftStatus, maxDepth: number = 10): DraftStatus[][] {
  const paths: DraftStatus[][] = [];
  const queue: DraftStatus[][] = [[start]];

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    const currentState = currentPath[currentPath.length - 1];

    // Don't explore beyond max depth to avoid infinite loops (EDITING -> EDITING)
    if (currentPath.length > maxDepth) continue;

    const nextStates = VALID_TRANSITIONS[currentState];

    if (nextStates.length === 0) {
      // Terminal state reached, record path
      paths.push(currentPath);
    } else {
      for (const next of nextStates) {
        // Skip self-transitions to avoid infinite loops
        if (next === currentState) continue;
        const newPath = [...currentPath, next];
        queue.push(newPath);
        // If next is a terminal state, also record the path
        if (VALID_TRANSITIONS[next].length === 0) {
          paths.push(newPath);
        }
      }
    }
  }

  return paths;
}

/**
 * Generates an arbitrary sequence of attempted state transitions from a random starting state.
 */
const statusArb = fc.constantFrom(...ALL_STATUSES);

const transitionSequenceArb = fc.record({
  start: statusArb,
  steps: fc.array(statusArb, { minLength: 1, maxLength: 8 }),
});

describe('Property: No Auto-Publishing Invariant', () => {
  it('no valid path to SCHEDULED or COPIED without APPROVED in the path', () => {
    /**
     * For any valid path through the state machine that reaches SCHEDULED or COPIED,
     * APPROVED must appear in the path before reaching those terminal states.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(DraftStatus.GENERATED, DraftStatus.EDITING, DraftStatus.PENDING_APPROVAL),
        (startState) => {
          const paths = findAllValidPaths(startState);

          for (const path of paths) {
            const lastState = path[path.length - 1];

            if (lastState === DraftStatus.SCHEDULED || lastState === DraftStatus.COPIED) {
              // PROPERTY: APPROVED must appear in the path before SCHEDULED/COPIED
              const approvedIndex = path.indexOf(DraftStatus.APPROVED);
              const terminalIndex = path.length - 1;

              expect(approvedIndex).toBeGreaterThan(-1);
              expect(approvedIndex).toBeLessThan(terminalIndex);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('APPROVED can only be reached from PENDING_APPROVAL (explicit user approval required)', () => {
    /**
     * Verify that APPROVED can only be reached from PENDING_APPROVAL,
     * which means explicit user approval must have occurred.
     */
    fc.assert(
      fc.property(statusArb, (fromState) => {
        if (fromState === DraftStatus.PENDING_APPROVAL) {
          // PENDING_APPROVAL -> APPROVED should be valid
          expect(isValidTransition(fromState, DraftStatus.APPROVED)).toBe(true);
        } else {
          // Any other state -> APPROVED should be invalid
          expect(isValidTransition(fromState, DraftStatus.APPROVED)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('no direct transition from initial states to SCHEDULED or COPIED', () => {
    /**
     * Starting from GENERATED or EDITING, there's no single valid transition
     * that jumps directly to SCHEDULED or COPIED.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(DraftStatus.GENERATED, DraftStatus.EDITING),
        fc.constantFrom(DraftStatus.SCHEDULED, DraftStatus.COPIED),
        (initialState, publishState) => {
          // PROPERTY: Direct transition from initial state to publish state is always invalid
          expect(isValidTransition(initialState, publishState)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('state machine enforces approval gate for arbitrary states', () => {
    /**
     * For any arbitrary DraftStatus that is NOT APPROVED, attempting to transition
     * directly to SCHEDULED or COPIED should always fail validation.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(
          DraftStatus.GENERATED,
          DraftStatus.EDITING,
          DraftStatus.PENDING_APPROVAL,
          DraftStatus.REJECTED,
          DraftStatus.SCHEDULED,
          DraftStatus.COPIED,
        ),
        fc.constantFrom(DraftStatus.SCHEDULED, DraftStatus.COPIED),
        (fromState, targetState) => {
          // PROPERTY: Only APPROVED state can transition to SCHEDULED or COPIED
          // All other states must fail
          expect(isValidTransition(fromState, targetState)).toBe(false);

          // Validate that validateTransition throws for these invalid transitions
          expect(() => validateTransition(fromState, targetState)).toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});

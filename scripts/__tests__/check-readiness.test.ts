// Requirements: 9.1, 9.3, 9.4, 9.5
// Property 3: Readiness checklist aggregation

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  type CheckCategory,
  type CheckResult,
  aggregateResults,
} from '../lib/checks.js';

/**
 * Validates: Requirements 9.1, 9.3, 9.4, 9.5
 *
 * Property 3: Readiness checklist aggregation
 * For any set of check results where each check is classified as automated or manual,
 * the readiness report SHALL recommend 'go' if and only if all automated checks have
 * status 'pass', SHALL list all failed checks with their expected/actual values, and
 * SHALL separately list all manual verification items.
 */

const CATEGORIES: CheckCategory[] = [
  'dns',
  'oidc',
  'stacks',
  'secrets',
  'database',
  'monitoring',
  'bundle',
  'tls',
];

const STATUSES = ['pass', 'fail', 'skip'] as const;

const arbCheckResult: fc.Arbitrary<CheckResult> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  category: fc.constantFrom(...CATEGORIES),
  automated: fc.boolean(),
  status: fc.constantFrom(...STATUSES),
  expected: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
  actual: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
  remediation: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
  durationMs: fc.nat({ max: 60000 }),
});

const arbCheckResults = fc.array(arbCheckResult, { minLength: 0, maxLength: 30 });

describe('Property 3: Readiness checklist aggregation', () => {
  it('recommendation is "go" iff all automated checks have status "pass"', () => {
    fc.assert(
      fc.property(arbCheckResults, (checks) => {
        const report = aggregateResults(checks);
        const automatedChecks = checks.filter((c) => c.automated);
        const allAutomatedPass = automatedChecks.every((c) => c.status === 'pass');

        if (allAutomatedPass) {
          expect(report.recommendation).toBe('go');
        } else {
          expect(report.recommendation).toBe('no-go');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('if any automated check has status "fail" or "skip", recommendation is "no-go"', () => {
    fc.assert(
      fc.property(arbCheckResults, (checks) => {
        const automatedChecks = checks.filter((c) => c.automated);
        const hasFailOrSkip = automatedChecks.some(
          (c) => c.status === 'fail' || c.status === 'skip'
        );

        if (hasFailOrSkip) {
          const report = aggregateResults(checks);
          expect(report.recommendation).toBe('no-go');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('manualItems contains exactly the names of non-automated checks', () => {
    fc.assert(
      fc.property(arbCheckResults, (checks) => {
        const report = aggregateResults(checks);
        const expectedManualNames = checks
          .filter((c) => !c.automated)
          .map((c) => c.name);

        expect(report.manualItems).toEqual(expectedManualNames);
      }),
      { numRuns: 100 }
    );
  });

  it('automatedPassed equals count of automated checks with status "pass"', () => {
    fc.assert(
      fc.property(arbCheckResults, (checks) => {
        const report = aggregateResults(checks);
        const expected = checks.filter((c) => c.automated && c.status === 'pass').length;

        expect(report.automatedPassed).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('automatedFailed equals count of automated checks with status "fail" or "skip"', () => {
    fc.assert(
      fc.property(arbCheckResults, (checks) => {
        const report = aggregateResults(checks);
        const expected = checks.filter(
          (c) => c.automated && (c.status === 'fail' || c.status === 'skip')
        ).length;

        expect(report.automatedFailed).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('automatedTotal equals count of all automated checks', () => {
    fc.assert(
      fc.property(arbCheckResults, (checks) => {
        const report = aggregateResults(checks);
        const expected = checks.filter((c) => c.automated).length;

        expect(report.automatedTotal).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('all input checks appear in report.checks', () => {
    fc.assert(
      fc.property(arbCheckResults, (checks) => {
        const report = aggregateResults(checks);

        expect(report.checks).toEqual(checks);
      }),
      { numRuns: 100 }
    );
  });

  it('vacuous truth: if there are NO automated checks, recommendation is "go"', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            category: fc.constantFrom(...CATEGORIES),
            automated: fc.constant(false as boolean),
            status: fc.constantFrom(...STATUSES),
            expected: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
            actual: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
            remediation: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
            durationMs: fc.nat({ max: 60000 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (manualOnlyChecks) => {
          const report = aggregateResults(manualOnlyChecks);
          expect(report.recommendation).toBe('go');
        }
      ),
      { numRuns: 100 }
    );
  });
});

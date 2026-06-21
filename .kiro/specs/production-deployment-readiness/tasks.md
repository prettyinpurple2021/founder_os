# Implementation Plan: Production Deployment Readiness

## Overview

This plan implements the operational readiness tooling for Solo Founder Launch OS. It covers shared libraries, CLI scripts (bootstrap, secrets, bundle analysis, readiness checklist, monitoring verification), load testing with k6, CI integration, and deployment documentation. All scripts are TypeScript executed via `tsx`, with property-based tests on pure logic components using `fast-check`.

## Tasks

- [x] 1. Set up shared library and project structure
  - [x] 1.1 Create scripts directory structure and shared AWS client library
    - Create `scripts/lib/` directory
    - Create `scripts/lib/aws.ts` with shared AWS SDK client factories (CloudFormation, SecretsManager, CloudWatch, ECS, Route53, ACM, CloudFront, S3)
    - Create `scripts/lib/reporter.ts` with dual-output formatting (human-readable + JSON) using `ReportOptions` interface
    - Add `tsx` as a devDependency in root `package.json` if not already present
    - Add `@aws-sdk/client-cloudformation`, `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-cloudwatch`, `@aws-sdk/client-cloudwatch-logs`, `@aws-sdk/client-ecs`, `@aws-sdk/client-route-53`, `@aws-sdk/client-acm`, `@aws-sdk/client-cloudfront`, `@aws-sdk/client-s3` as devDependencies
    - _Requirements: 3.1, 3.5, 9.1, 9.2_

  - [x] 1.2 Create bundle analyzer pure logic module
    - Create `scripts/lib/bundle-analyzer.ts` implementing the `ChunkInfo`, `BundleAnalysisResult` interfaces
    - Implement `analyzeBundles(chunks: ChunkInfo[]): BundleAnalysisResult` pure function
    - Threshold logic: `'fail'` > 500KB, `'warn'` 400-500KB, `'pass'` < 400KB (all gzipped initial chunks)
    - Classify chunks by type: `main`, `vendor`, `css`, `route`
    - Sum only `isInitial: true` chunks for threshold comparison
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 1.3 Create readiness check definitions and aggregation logic
    - Create `scripts/lib/checks.ts` with `CheckCategory`, `CheckDefinition`, `CheckResult`, `ReadinessReport` types
    - Implement `aggregateResults(checks: CheckResult[]): ReadinessReport` pure function
    - Logic: `'go'` only if all automated checks pass; separate manual items from automated results
    - Include remediation hints for each check category
    - _Requirements: 9.1, 9.3, 9.4, 9.5_

- [x] 2. Property tests for pure logic modules
  - [x] 2.1 Write property test for bundle threshold classification
    - **Property 1: Bundle threshold classification**
    - Generate arbitrary arrays of `ChunkInfo` with non-negative gzip sizes using `fast-check`
    - Assert: total initial gzip > 500KB → `'fail'`, 400-500KB → `'warn'`, < 400KB → `'pass'`
    - Create `scripts/__tests__/bundle-analyzer.test.ts`
    - Minimum 100 iterations
    - **Validates: Requirements 8.1, 8.2, 8.5**

  - [x] 2.2 Write property test for bundle report completeness and round-trip
    - **Property 2: Bundle report completeness and serialization round-trip**
    - Generate arbitrary chunk arrays, format as JSON, parse back, verify equivalence
    - Assert: every input chunk appears in the output with both raw and gzip sizes
    - Add to `scripts/__tests__/bundle-analyzer.test.ts`
    - Minimum 100 iterations
    - **Validates: Requirements 8.3, 8.6**

  - [x] 2.3 Write property test for readiness checklist aggregation
    - **Property 3: Readiness checklist aggregation**
    - Generate arbitrary arrays of `CheckResult` with mixed automated/manual, pass/fail/skip statuses
    - Assert: `'go'` iff all automated checks are `'pass'`; failed checks listed with expected/actual; manual items separately listed
    - Create `scripts/__tests__/check-readiness.test.ts`
    - Minimum 100 iterations
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5**

- [x] 3. Implement bootstrap and secrets scripts
  - [x] 3.1 Implement bootstrap script
    - Create `scripts/bootstrap.ts` implementing `BootstrapOptions`, `DeploymentResult`, `BootstrapOutput` interfaces
    - Parse CLI args: `--stage` (required, `staging` | `production`), `--skip-bootstrap`, `--verbose`
    - Execute `cdk bootstrap` via child_process unless `--skip-bootstrap`
    - Deploy stacks sequentially: network → database → container → cdn → monitoring
    - Poll CloudFormation for terminal status after each deploy
    - On failure: print stack events with errors, suggest rollback, exit 1
    - On success: extract outputs, run ALB health check, print summary
    - Support `--json` output via reporter
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 3.2 Implement secrets setup script
    - Create `scripts/setup-secrets.ts` implementing `SecretsSetupOptions`, `SecretDefinition` interfaces
    - Parse CLI args: `--stage` (required), `--force`
    - Auto-generate session secret (256-bit random hex) and encryption key (256-bit base64)
    - Store generated secrets in Secrets Manager under `/solo-founder-launch-os/{stage}/` paths
    - Skip existing secrets unless `--force` is provided
    - List manual secrets (GitHub OAuth credentials) that need user population
    - Run validation: check all paths exist and are non-empty
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement bundle check and readiness scripts
  - [x] 5.1 Implement bundle check CLI script
    - Create `scripts/check-bundle.ts` as the CLI entry point
    - Run `npm run build:web` or detect existing `packages/web/dist/`
    - Read `.vite/manifest.json` to identify chunks
    - Measure gzipped size of each chunk using `zlib.gzipSync`
    - Call `analyzeBundles()` from `scripts/lib/bundle-analyzer.ts`
    - Format output via `scripts/lib/reporter.ts` (human or JSON based on `--json` flag)
    - Exit 0 (pass/warn) or exit 1 (fail > 500KB)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 5.2 Implement readiness checklist CLI script
    - Create `scripts/check-readiness.ts` as the CLI entry point
    - Parse CLI args: `--stage` (required), `--json`, `--category` (optional filter)
    - Implement automated checks: DNS resolution, OIDC role assumption, CloudFormation stack status, Secrets Manager validation, ECS health, monitoring log group, bundle size, TLS certificate validity, CloudFront response
    - List manual items: email alert confirmation, GitHub OAuth test, domain registration
    - Call `aggregateResults()` for go/no-go recommendation
    - Format output via reporter (human or JSON)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 5.3 Implement monitoring verification script
    - Create `scripts/verify-monitoring.ts`
    - Parse CLI args: `--stage` (required)
    - Check CloudWatch log group has events in last 15 minutes
    - Put a test metric to trigger error-rate alarm
    - Wait up to 5 minutes for SNS notification
    - Run Logs Insights query and verify results
    - Report pass/fail for each check with troubleshooting hints
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 6. Load testing suite
  - [x] 6.1 Create k6 load testing configuration and scripts
    - Create `load-tests/config.json` with baseUrl, scenarios (rampUp, sustained, spike), and thresholds (p95 < 2s, error rate < 5%)
    - Create `load-tests/load-test.js` — main k6 script with health check and authenticated route simulation
    - Create `load-tests/scenarios/ramp-up.js` — gradual ramp from 0 to 50 VUs over 5 minutes, sustain 10 minutes, wind down 3 minutes
    - Create `load-tests/scenarios/sustained.js` — sustained peak load scenario
    - Create `load-tests/scenarios/spike.js` — sudden traffic spike scenario
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7, 5.9_

- [x] 7. CI integration and package.json scripts
  - [x] 7.1 Add new scripts to root package.json
    - Add `"bootstrap": "tsx scripts/bootstrap.ts"`
    - Add `"setup:secrets": "tsx scripts/setup-secrets.ts"`
    - Add `"check:bundle": "tsx scripts/check-bundle.ts"`
    - Add `"check:readiness": "tsx scripts/check-readiness.ts"`
    - Add `"verify:monitoring": "tsx scripts/verify-monitoring.ts"`
    - Add `"test:load": "k6 run load-tests/load-test.js"`
    - Add `"test:scripts": "vitest run --config scripts/vitest.config.ts"`
    - _Requirements: 8.4, 9.2_

  - [x] 7.2 Create vitest config for scripts tests
    - Create `scripts/vitest.config.ts` pointing at `scripts/__tests__/` directory
    - Configure to use the existing vitest setup from the project
    - _Requirements: 8.4_

  - [x] 7.3 Add bundle size check job to CI workflow
    - Add `check-bundle` job to `.github/workflows/ci.yml`
    - Job depends on `lint-and-typecheck` (existing job)
    - Steps: checkout, setup-node (v20), npm ci, run `npm run check:bundle -- --json`
    - Non-zero exit blocks the PR from merging
    - _Requirements: 8.4, 8.7_

- [x] 8. Deployment documentation
  - [x] 8.1 Create DNS setup runbook
    - Create `docs/deployment/dns-setup.md`
    - Cover: domain registration, Route 53 hosted zone creation, NS record delegation, A/AAAA alias records for API and web subdomains, verification steps, troubleshooting (propagation delays, NS mismatch, hosted zone ID)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 8.2 Create AWS account setup guide
    - Create `docs/deployment/aws-account-setup.md`
    - Cover: GitHub OIDC provider creation (thumbprint, audience), IAM role with trust policy, required permissions, GitHub repository secrets configuration, account ID placeholder replacement, validation via test workflow, troubleshooting (trust policy, audience mismatch, repo format)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 8.3 Create first deployment runbook
    - Create `docs/deployment/first-deployment.md`
    - Cover: complete step-by-step from AWS account prep through CDK bootstrap, secrets population, first CI/CD run, DNS configuration, monitoring verification, and load testing
    - Reference other docs for detailed sub-procedures
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 8.4 Create manual migration procedure
    - Create `docs/deployment/manual-migration.md`
    - Cover: AWS CLI commands for `aws ecs run-task` to execute migration ECS task, connection verification, rollback steps, and troubleshooting
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1-3)
- The shared library (wave 0) must be built before scripts that depend on it
- Documentation tasks (wave 2) can run in parallel with script implementation
- Load tests are designed to run manually against a deployed environment, not in CI

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "3.2", "8.1", "8.2"] },
    { "id": 2, "tasks": ["5.1", "5.2", "5.3", "6.1", "8.3", "8.4"] },
    { "id": 3, "tasks": ["7.1", "7.2", "7.3"] }
  ]
}
```

# Implementation Plan: Production Infrastructure

## Overview

This plan transforms Solo Founder Launch OS from a local-only development setup into a production-ready deployment on AWS. The tasks are ordered so that foundational pieces (config, Docker, health check) come first, followed by infrastructure stacks (CDK), CI/CD pipelines, and finally integrations (Sentry, frontend optimization). Each task builds on the previous — no orphaned code.

## Tasks

- [ ] 1. Application configuration module with secrets integration
  - [x] 1.1 Create configuration validation schema and loader
    - Create `packages/api/src/config/validation.ts` with a Zod schema defining all required config fields (port, nodeEnv, database.url, session.secret, github.clientId, github.clientSecret, github.callbackUrl, encryption.key, cors.origin)
    - Create `packages/api/src/config/index.ts` that loads config with hierarchical strategy: Secrets Manager → environment variables → defaults
    - Fail fast at startup with descriptive error messages listing all missing variables
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [-] 1.2 Create AWS Secrets Manager client
    - Create `packages/api/src/config/secrets.ts` that retrieves secrets from AWS Secrets Manager using the `@aws-sdk/client-secrets-manager` package
    - Use IAM role-based access (no static keys) — in local dev, fall back to env vars
    - Support separate secret paths per environment (`/solo-founder-launch-os/{stage}/`)
    - _Requirements: 4.1, 4.5, 4.6, 4.7_

  - [-] 1.3 Write unit tests for configuration validation
    - Test that validation rejects incomplete config with descriptive errors
    - Test that hierarchical override strategy works correctly
    - Test that secrets are never logged or exposed
    - _Requirements: 4.3, 4.4_

- [x] 2. Enhanced health check endpoint
  - [x] 2.1 Implement enhanced GET /health endpoint
    - Create or update `packages/api/src/routes/health.ts` with a GET /health endpoint
    - Return `{ status, timestamp, version, uptime, checks: { database: { status, latencyMs } } }`
    - Read version from package.json; measure DB connectivity via a simple `SELECT 1` query
    - Return HTTP 200 when healthy, HTTP 503 with `status: 'degraded'` when DB is unreachable
    - Endpoint must be accessible without authentication and respond within 3 seconds
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Write integration test for health check endpoint
    - Test GET /health returns 200 with expected response shape when DB is available
    - Test GET /health returns 503 when DB connection fails
    - Test response completes within 3 seconds
    - _Requirements: 3.1, 3.2, 3.4_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Multi-stage Dockerfile and Docker Compose
  - [x] 4.1 Create multi-stage production Dockerfile
    - Create `docker/Dockerfile` with three stages: `deps` (install production dependencies only), `builder` (compile TypeScript, generate Prisma client), `production` (minimal Node.js 20 Alpine image with compiled JS and production node_modules)
    - Run as non-root user (`appuser`) with a dedicated user account
    - Expose configurable port (default 3001)
    - Add HEALTHCHECK instruction that curls `/health` with 5-second timeout
    - Exclude dev dependencies, test files, and source maps from final image
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7_

  - [x] 4.2 Create .dockerignore file
    - Create `docker/.dockerignore` excluding node_modules, .git, dist, test files, .env, and other dev-only files
    - _Requirements: 1.7_

  - [-] 4.3 Create docker-compose.yml for local development
    - Create `docker/docker-compose.yml` with services: api (builds from Dockerfile), web (serves Vite dev or build), and postgres (PostgreSQL database)
    - Map ports, set env vars, configure volumes for hot-reload in dev
    - _Requirements: 1.5_

  - [-] 4.4 Add startup environment variable validation
    - Update the API entrypoint (or config loader from task 1.1) to exit with non-zero code and log which variables are missing if required env vars are absent
    - _Requirements: 1.8_

- [ ] 5. CDK infrastructure package — project setup and network stack
  - [x] 5.1 Initialize packages/infra CDK package
    - Create `packages/infra/` with `package.json`, `tsconfig.json`, `cdk.json`
    - Add `aws-cdk-lib`, `constructs`, and `vitest` as dependencies
    - Create `bin/app.ts` as the CDK app entry point
    - Create `lib/config/environments.ts` with typed `EnvironmentConfig` interface and staging/production configs
    - Create `lib/config/tags.ts` with resource tagging helper (Project, Environment, ManagedBy, CostCenter)
    - _Requirements: 11.11, 11.10_

  - [-] 5.2 Implement network stack (VPC, subnets, security groups)
    - Create `packages/infra/lib/stacks/network-stack.ts`
    - Define VPC with public subnets (ALB, NAT), private subnets (ECS tasks), and isolated subnets (RDS)
    - Configure security groups: ALB allows inbound 443; ECS allows inbound from ALB only; RDS allows inbound from ECS only
    - _Requirements: 11.7_

  - [x] 5.3 Write CDK assertion tests for network stack
    - Verify VPC is created with expected subnet configuration
    - Verify security group rules are correct
    - _Requirements: 11.7_

- [x] 6. CDK database and container stacks
  - [x] 6.1 Implement database stack (RDS, secrets, backups)
    - Create `packages/infra/lib/stacks/database-stack.ts`
    - RDS PostgreSQL 15, db.t3.micro, Multi-AZ enabled
    - Automated daily backups with 30-day retention, backup window 03:00–04:00 UTC
    - Point-in-time recovery enabled, storage encrypted with KMS
    - Store DB credentials in Secrets Manager at `/solo-founder-launch-os/{stage}/database/`
    - Place RDS in isolated subnets (private, no public access)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7, 11.3_

  - [x] 6.2 Implement container stack (ECR, ECS Fargate, ALB, auto-scaling)
    - Create `packages/infra/lib/stacks/container-stack.ts`
    - ECR repository with lifecycle policy (keep 10 tagged images, expire untagged after 7 days)
    - ECS Fargate service with ALB, health check on /health (3 consecutive failures → replace task)
    - Auto-scaling: min 1, max 4, scale out at 70% CPU, scale in at 30%
    - ALB terminates TLS using ACM certificate; HTTP→HTTPS redirect
    - ECS task role with permissions to read Secrets Manager and push CloudWatch logs
    - Deploy with rolling update and deployment circuit breaker for automatic rollback
    - _Requirements: 11.1, 11.2, 11.5, 11.6, 11.8, 11.9, 2.5, 2.9, 7.1, 7.2_

  - [x] 6.3 Write CDK assertion tests for database and container stacks
    - Verify RDS has Multi-AZ, backup retention 30 days, storage encrypted
    - Verify ECS auto-scaling min/max capacity
    - Verify ALB health check configuration
    - Verify ECR lifecycle rules
    - _Requirements: 9.1, 9.4, 11.2, 11.6_

- [x] 7. CDK CDN and monitoring stacks
  - [x] 7.1 Implement CDN stack (CloudFront, S3, certificates)
    - Create `packages/infra/lib/stacks/cdn-stack.ts`
    - S3 bucket for static assets (not publicly accessible, OAI access for CloudFront)
    - CloudFront distribution with S3 origin, gzip + Brotli compression, HTTPS only
    - Custom error response: 403/404 → /index.html (SPA routing support)
    - ACM certificate for the web domain (us-east-1 for CloudFront)
    - _Requirements: 8.4, 8.5, 11.4, 7.1, 7.5_

  - [x] 7.2 Implement monitoring stack (CloudWatch dashboards, alarms, SNS)
    - Create `packages/infra/lib/stacks/monitoring-stack.ts`
    - CloudWatch log group with 90-day retention for ECS container logs (JSON structured)
    - Alarms: error rate > 5% (5 min), p95 latency > 2s (5 min), CPU > 80% (10 min), DB connections > 80% pool max (5 min)
    - SNS topic for alarm notifications (email subscription)
    - CloudWatch dashboard with request volume, error rates, latency percentiles, container health, DB metrics
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 7.3 Write CDK assertion tests for CDN and monitoring stacks
    - Verify CloudFront has compression enabled, custom error responses configured
    - Verify CloudWatch log group has 90-day retention
    - Verify alarm thresholds match requirements
    - _Requirements: 8.4, 10.3, 10.6_

- [x] 8. Checkpoint — Ensure all CDK tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. GitHub Actions CI/CD workflows
  - [x] 9.1 Create CI workflow for pull requests
    - Create `.github/workflows/ci.yml` triggered on pull request events
    - Steps: checkout, setup Node 20, cache npm dependencies, install, lint, type-check, test (API and Web in parallel)
    - Fail if any lint error, type error, or test failure
    - _Requirements: 2.2, 2.3, 2.10, 2.11_

  - [x] 9.2 Create deploy workflow for main branch
    - Create `.github/workflows/deploy.yml` triggered on push to main
    - Steps: install, lint, type-check, test, build Docker image (tag with commit SHA), push to ECR, build web assets, upload to S3 with cache headers (immutable: 1 year, index.html: max 5 min), invalidate CloudFront for index.html, run migration task, update ECS service
    - Store AWS credentials as GitHub secrets; use OIDC or access keys from secrets
    - Configure deployment health check — on failure, ECS circuit breaker rolls back automatically
    - Target full cycle within 15 minutes
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 8.3_

  - [x] 9.3 Create reusable migration workflow
    - Create `.github/workflows/migration.yml` as a reusable workflow
    - Run `prisma migrate deploy` in a dedicated short-lived ECS task (private subnet, no public access)
    - Use same DB credentials from Secrets Manager as the API service
    - On failure: halt deployment, report migration name and error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 10. CloudWatch error tracking integration
  - [x] 10.1 Implement structured error logging middleware for the API
    - Create `packages/api/src/middleware/errorLogger.ts`
    - Capture all unhandled exceptions and rejected promises
    - Write structured JSON error logs to stdout (picked up by CloudWatch via ECS log driver)
    - Include: error message, stack trace, request method, path, user ID (if authenticated), environment, trace ID, timestamp
    - Strip sensitive data: authorization headers, session tokens, password fields from request bodies
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 10.2 Implement frontend error reporter
    - Create `packages/web/src/lib/errorReporter.ts` that catches uncaught errors and unhandled rejections
    - Create `packages/api/src/routes/errors.ts` with a POST /api/errors endpoint that logs frontend errors to the same structured CloudWatch log stream
    - _Requirements: 6.7_

  - [x] 10.3 Write unit tests for error logging sensitive data stripping
    - Verify authorization headers are stripped
    - Verify password fields are removed from request body context
    - Verify user ID, environment, and trace ID are included
    - _Requirements: 6.3_

- [ ] 11. Frontend bundle optimization
  - [x] 11.1 Configure Vite for production bundle optimization
    - Update `packages/web/vite.config.ts` to configure:
      - Code splitting via dynamic imports for route-level splitting
      - Hashed filenames for all static assets (content-based hashing)
      - Vendor chunk extraction (separate chunk for node_modules libraries)
      - Source map generation (for Sentry upload, not public serving)
    - _Requirements: 8.1, 8.2, 8.6, 8.7_

  - [x] 11.2 Add CORS and security headers to API for production
    - Update Express CORS configuration to use production frontend domain from config
    - Add Strict-Transport-Security header (max-age 1 year, includeSubDomains)
    - Set session cookies with Secure, HttpOnly, SameSite=Strict in production mode
    - _Requirements: 7.3, 7.4, 7.7_

- [ ] 12. Wiring and integration
  - [x] 12.1 Wire configuration module into existing API startup
    - Update the API entry point (`packages/api/src/index.ts` or `app.ts`) to use the new `loadConfig()` at startup
    - Replace scattered `process.env` reads with structured config object
    - Wire health check route into the Express app (without auth middleware)
    - Wire error logging middleware into the middleware chain (after all route handlers)
    - _Requirements: 3.5, 3.6, 4.1, 6.1_

  - [x] 12.2 Add packages/infra to workspace and update root package.json
    - Add `"packages/infra"` to root `package.json` workspaces array
    - Add root-level scripts: `cdk:synth`, `cdk:deploy`, `test:infra`
    - _Requirements: 11.11_

  - [x] 12.3 Add request tracing middleware
    - Add middleware that assigns a unique trace ID (UUID) to each request and includes it in all log output
    - Pass trace ID to Sentry context for correlation
    - _Requirements: 10.7_

- [-] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The CDK stacks are tested with snapshot/assertion tests (not property-based tests) per the design's testing strategy
- Unit tests validate configuration, health check, and error logging data stripping
- No property-based tests are included — the design explicitly assessed PBT as not applicable for IaC/CI/CD/deployment work
- Error tracking uses CloudWatch Logs with metric filters and alarms — no external paid services required
- All secrets are loaded from AWS Secrets Manager in production, falling back to env vars in development

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1", "4.2", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "4.3", "4.4", "5.2"] },
    { "id": 2, "tasks": ["2.1", "5.3", "6.1"] },
    { "id": 3, "tasks": ["2.2", "6.2", "6.3"] },
    { "id": 4, "tasks": ["7.1", "7.2", "9.1"] },
    { "id": 5, "tasks": ["7.3", "9.2", "9.3"] },
    { "id": 6, "tasks": ["10.1", "10.2", "11.1", "11.2"] },
    { "id": 7, "tasks": ["10.3", "12.1", "12.2", "12.3"] }
  ]
}
```

# Requirements Document

## Introduction

This document specifies the operational readiness requirements for deploying Solo Founder Launch OS to production. The production infrastructure code (CDK stacks, CI/CD workflows, Docker, monitoring) is already complete. These requirements cover the remaining manual configuration, bootstrapping, validation, and verification steps needed to take the application live — from DNS setup through load testing to monitoring verification.

Each requirement is categorized as either **Manual** (requires AWS Console/CLI interaction or external service configuration) or **Automatable** (can be scripted and potentially integrated into CI/CD or a bootstrap script).

## Glossary

- **System**: The Solo Founder Launch OS production deployment readiness tooling and procedures
- **Bootstrap_Script**: An automated script that executes CDK bootstrap and stack deployment in the correct order
- **DNS_Zone**: An AWS Route 53 hosted zone managing DNS records for the application domain
- **OIDC_Role**: The IAM role (`github-actions-deploy`) assumed by GitHub Actions via OpenID Connect federation
- **Secrets_Store**: AWS Secrets Manager holding production credentials and keys
- **CDK_App**: The AWS CDK application defined in `packages/infra/` that synthesizes CloudFormation stacks
- **Load_Test_Suite**: A set of automated load and stress tests validating auto-scaling behavior
- **Migration_Runner**: The ECS task that executes `prisma migrate deploy` against the production database
- **Monitoring_Stack**: The CloudWatch dashboards, alarms, and log groups provisioned by `monitoring-stack.ts`
- **Bundle_Analyzer**: A script or CI step that measures the frontend bundle size against the 500KB gzipped threshold
- **Deployment_Checklist**: A structured verification checklist ensuring all readiness items are addressed before go-live

## Requirements

### Requirement 1: DNS and Domain Configuration

**User Story:** As a solo founder, I want my production domains configured and resolving correctly, so that users can access the application at memorable, branded URLs.

**Category:** Manual

#### Acceptance Criteria

1. THE System SHALL document the steps to register or transfer the production domain (e.g., `solofounder.app`) to a registrar that supports Route 53 name servers.
2. WHEN the domain is registered, THE System SHALL create a Route 53 hosted zone for the production domain and configure the registrar to use Route 53 name servers.
3. THE System SHALL create DNS A/AAAA alias records pointing the API subdomain (`api.solofounder.app`) to the Application Load Balancer.
4. THE System SHALL create DNS A/AAAA alias records pointing the web subdomain (`app.solofounder.app`) to the CloudFront distribution.
5. THE System SHALL update the `packages/infra/lib/config/environments.ts` file with the actual production domain values replacing the placeholder values.
6. WHEN DNS records are created, THE System SHALL verify resolution of both subdomains returns the correct AWS resource endpoints within 5 minutes of propagation.
7. IF DNS resolution fails after 30 minutes, THEN THE System SHALL provide troubleshooting steps covering NS delegation, propagation delays, and hosted zone ID mismatches.

### Requirement 2: AWS Account and IAM Configuration

**User Story:** As a solo founder, I want my AWS account properly configured with the correct IAM roles and GitHub OIDC federation, so that CI/CD can deploy securely without static access keys.

**Category:** Manual

#### Acceptance Criteria

1. THE System SHALL document the steps to create a GitHub OIDC identity provider in the AWS account with the correct thumbprint and audience (`sts.amazonaws.com`).
2. THE System SHALL create the `github-actions-deploy` IAM role with a trust policy allowing the specific GitHub repository (`repo:<owner>/<repo>:ref:refs/heads/main`) to assume it via OIDC.
3. THE OIDC_Role SHALL have permissions to: push images to ECR, update ECS services, run ECS tasks, upload to S3, invalidate CloudFront, read Secrets Manager, describe/update CloudFormation stacks, and manage CloudWatch resources.
4. THE System SHALL configure the following GitHub repository secrets: `AWS_ACCOUNT_ID`, `AWS_REGION`, `CLOUDFRONT_DISTRIBUTION_ID`.
5. THE System SHALL update the placeholder AWS account ID (`987654321098`) in `packages/infra/lib/config/environments.ts` with the actual production account ID.
6. WHEN the OIDC role is created, THE System SHALL validate the configuration by running a test workflow that assumes the role and calls `aws sts get-caller-identity`.
7. IF the OIDC role assumption fails, THEN THE System SHALL provide troubleshooting steps covering trust policy conditions, audience mismatch, and repository name formatting.

### Requirement 3: CDK Bootstrap and Stack Deployment

**User Story:** As a solo founder, I want an automated bootstrap script that deploys all infrastructure stacks in the correct order, so that the first deployment is reliable and repeatable.

**Category:** Automatable

#### Acceptance Criteria

1. THE Bootstrap_Script SHALL run `cdk bootstrap` in the target AWS account and region before any stack deployment.
2. THE Bootstrap_Script SHALL deploy CDK stacks in the following dependency order: network → database → container → CDN → monitoring.
3. THE Bootstrap_Script SHALL wait for each stack to reach `CREATE_COMPLETE` or `UPDATE_COMPLETE` status before deploying the next dependent stack.
4. IF a stack deployment fails, THEN THE Bootstrap_Script SHALL halt execution, report the failing stack name and CloudFormation error events, and provide rollback guidance.
5. THE Bootstrap_Script SHALL accept a `--stage` parameter to target either `staging` or `production` environments.
6. THE Bootstrap_Script SHALL output the key resource identifiers after successful deployment: ALB DNS name, CloudFront distribution ID, ECR repository URI, RDS endpoint, and ECS cluster ARN.
7. WHEN all stacks deploy successfully, THE Bootstrap_Script SHALL run a smoke test verifying the ALB health check endpoint returns HTTP 200.
8. THE Bootstrap_Script SHALL be idempotent — running it multiple times against an already-deployed environment SHALL update existing stacks without creating duplicates.

### Requirement 4: Environment Secrets Population

**User Story:** As a solo founder, I want all production secrets populated in AWS Secrets Manager with proper values, so that the application can start successfully on first deployment.

**Category:** Manual (credentials) + Automatable (generation script)

#### Acceptance Criteria

1. THE System SHALL document which secrets are auto-generated by AWS (RDS database credentials created by the database stack) and which require manual population.
2. THE System SHALL provide a secrets setup script that generates cryptographically secure values for `session/secret` (256-bit random) and `encryption/key` (256-bit AES key) and stores them in Secrets Manager.
3. THE System SHALL document the steps to create a GitHub OAuth application with the production callback URL (`https://api.solofounder.app/auth/github/callback`) and store the `client-id` and `client-secret` in Secrets Manager.
4. WHEN all secrets are populated, THE System SHALL provide a validation command that checks each secret path exists in Secrets Manager and contains a non-empty value (without revealing the secret content).
5. THE System SHALL store secrets under the path `/solo-founder-launch-os/production/` with sub-paths: `database/url`, `github/client-id`, `github/client-secret`, `github/callback-url`, `session/secret`, `encryption/key`.
6. IF any required secret is missing when the API_Service starts, THEN THE API_Service SHALL exit with a non-zero code listing the missing secret paths (existing behavior from config validation).
7. THE secrets setup script SHALL refuse to overwrite existing secrets unless a `--force` flag is provided, preventing accidental credential rotation.

### Requirement 5: Load and Stress Testing

**User Story:** As a solo founder, I want to validate that auto-scaling works correctly under realistic traffic, so that I am confident the system handles expected load without manual intervention.

**Category:** Automatable

#### Acceptance Criteria

1. THE Load_Test_Suite SHALL simulate realistic traffic patterns against the production API endpoints (health check, authenticated routes, and database-heavy operations).
2. THE Load_Test_Suite SHALL ramp traffic from 0 to the expected peak (50 concurrent users) over a 5-minute period and sustain peak load for 10 minutes.
3. WHEN CPU utilization exceeds 70% on the ECS service, THE Orchestrator SHALL scale out by adding additional tasks (up to the maximum of 4).
4. WHEN CPU utilization drops below 30% after the load test completes, THE Orchestrator SHALL scale in by removing tasks (down to the minimum of 1).
5. THE Load_Test_Suite SHALL report: p50/p95/p99 latency, error rate, throughput (requests per second), and scale-out event timestamps.
6. THE Load_Test_Suite SHALL verify that the p95 response time remains below 2 seconds during sustained load.
7. THE Load_Test_Suite SHALL verify that the error rate stays below 5% during sustained load (excluding intentional 4xx responses).
8. IF the system fails to scale out within 5 minutes of sustained high CPU, THEN THE Load_Test_Suite SHALL flag the auto-scaling configuration as misconfigured.
9. THE Load_Test_Suite SHALL provide a configuration file specifying target URLs, concurrency, duration, and ramp-up schedule for repeatability.

### Requirement 6: Database Migration Execution

**User Story:** As a solo founder, I want the production database schema initialized correctly on first deployment, so that the application can read and write data immediately after launch.

**Category:** Automatable (via existing migration workflow)

#### Acceptance Criteria

1. WHEN the first deployment runs, THE Migration_Runner SHALL execute `prisma migrate deploy` against the production RDS instance to apply all pending migrations.
2. THE Migration_Runner SHALL connect to the production database using credentials retrieved from Secrets Manager at path `/solo-founder-launch-os/production/database/url`.
3. THE Migration_Runner SHALL run in a dedicated ECS task within the private subnet, with network access to the RDS instance but no public internet exposure.
4. WHEN migrations complete successfully, THE System SHALL verify the database schema by running a connection test that validates at least one table from the Prisma schema exists.
5. IF the migration fails, THEN THE Migration_Runner SHALL exit with a non-zero code, log the failing migration filename and error message, and halt the deployment pipeline.
6. THE System SHALL document the procedure for running migrations manually using the AWS CLI (`aws ecs run-task`) as a fallback if the CI/CD workflow is unavailable.
7. WHEN migrations complete, THE System SHALL verify the `_prisma_migrations` table contains entries for all expected migration files from `packages/api/prisma/migrations/`.

### Requirement 7: Monitoring and Alerting Verification

**User Story:** As a solo founder, I want to verify that monitoring, metrics, and alarms work correctly with real data, so that I am confident I will be notified of production issues.

**Category:** Automatable (verification script) + Manual (email confirmation)

#### Acceptance Criteria

1. WHEN the monitoring stack is deployed, THE System SHALL verify that the CloudWatch log group receives structured JSON logs from the running ECS tasks.
2. THE System SHALL verify that the CloudWatch dashboard displays real-time data for: request volume, error rates, latency percentiles, container health, and database connection metrics.
3. THE System SHALL trigger a test alarm (by temporarily lowering a threshold or injecting a test metric) and verify that the SNS notification reaches the configured email address.
4. WHEN a test alarm triggers, THE Monitoring_Service SHALL deliver the notification to the configured email within 5 minutes.
5. THE System SHALL verify that the error-rate metric filter correctly counts error-level log entries by generating a deliberate error and checking the metric increments.
6. THE System SHALL verify that CloudWatch Logs Insights saved queries return results when error logs exist in the log group.
7. IF any metric, alarm, or dashboard widget fails to populate with data within 15 minutes of deployment, THEN THE System SHALL report which component is not functioning and provide troubleshooting steps (IAM permissions, log driver configuration, metric namespace mismatch).

### Requirement 8: Frontend Bundle Size Verification

**User Story:** As a solo founder, I want an automated check that the frontend bundle stays under the 500KB gzipped limit, so that page load performance does not silently degrade.

**Category:** Automatable

#### Acceptance Criteria

1. THE Bundle_Analyzer SHALL build the production frontend (`npm run build:web`) and measure the total gzipped size of the initial page load bundle (excluding lazy-loaded route chunks).
2. THE Bundle_Analyzer SHALL fail with a non-zero exit code and descriptive error message if the initial bundle exceeds 500KB gzipped.
3. THE Bundle_Analyzer SHALL report a breakdown of bundle sizes: main chunk, vendor chunk, and CSS — with both raw and gzipped sizes.
4. THE Bundle_Analyzer SHALL be runnable as a standalone script (`npm run check:bundle`) and integrated into the CI workflow as a pre-deploy gate.
5. WHEN the bundle size exceeds 400KB gzipped (80% of limit), THE Bundle_Analyzer SHALL emit a warning indicating the bundle is approaching the threshold.
6. THE Bundle_Analyzer SHALL output results in both human-readable format (for local development) and machine-readable JSON (for CI integration).
7. THE System SHALL add the bundle size check to the CI workflow so that pull requests that would exceed the limit are blocked before merge.

### Requirement 9: Deployment Readiness Checklist

**User Story:** As a solo founder, I want a single checklist that validates all operational readiness items are complete, so that I can confidently flip the switch to go live.

**Category:** Automatable (verification script)

#### Acceptance Criteria

1. THE Deployment_Checklist SHALL verify each readiness category and report pass/fail status: DNS resolution, OIDC role assumption, stack deployment status, secrets population, database connectivity, monitoring data flow, bundle size compliance, and TLS certificate validity.
2. THE Deployment_Checklist SHALL be runnable as a single command (`npm run check:readiness`) that performs all automated verifications.
3. THE Deployment_Checklist SHALL clearly separate automated checks (DNS, secrets, DB, bundle) from manual verification items (email alert confirmation, GitHub OAuth testing, domain registration).
4. WHEN all automated checks pass, THE Deployment_Checklist SHALL output a summary with a clear go/no-go recommendation.
5. IF any automated check fails, THEN THE Deployment_Checklist SHALL report which specific check failed, the expected vs actual result, and a remediation hint.
6. THE Deployment_Checklist SHALL verify that the TLS certificates for both the API domain and web domain are valid and have more than 30 days until expiration.
7. THE Deployment_Checklist SHALL verify that the ECS service is running at least 1 healthy task and the ALB health check target reports healthy.
8. THE Deployment_Checklist SHALL verify that CloudFront returns the correct `index.html` content with appropriate cache headers when accessed via the web domain.

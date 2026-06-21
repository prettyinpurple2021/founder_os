# Design Document: Production Infrastructure

## Overview

This design defines the production infrastructure for Solo Founder Launch OS — a full-stack TypeScript monorepo (Express API + React SPA). The infrastructure transforms the application from a local-only development setup into a production-ready deployment on AWS, with automated CI/CD, container orchestration, CDN-served frontend, managed database, monitoring, and security hardening.

The design uses AWS CDK (TypeScript) as the Infrastructure as Code tool — a natural fit for a TypeScript monorepo since the infrastructure code shares language, tooling, and type safety with the application itself.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IaC Tool | AWS CDK (TypeScript) | Same language as app; type-safe constructs; native AWS integration |
| Container Orchestration | ECS Fargate | Serverless containers; no EC2 management; built-in ALB integration |
| Database | RDS PostgreSQL 15 | Managed; compatible with existing Prisma setup; Multi-AZ support |
| Frontend Hosting | CloudFront + S3 | Global CDN; immutable asset caching; SPA routing support |
| CI/CD | GitHub Actions | Already using GitHub; native integration with ECR/ECS; free tier |
| Error Tracking | CloudWatch | Structured error logs; metric filters for alerting; Logs Insights for grouping |
| Secrets | AWS Secrets Manager | IAM-based access; rotation support; no static keys |
| Monitoring | CloudWatch | Native AWS metrics/logs + error tracking via metric filters |

---

## Architecture

### High-Level Architecture Diagram

```mermaid
graph TB
    subgraph "Developer"
        DEV[Developer Machine]
        GH[GitHub Repository]
    end

    subgraph "CI/CD"
        GHA[GitHub Actions]
        ECR[AWS ECR]
    end

    subgraph "AWS Cloud"
        subgraph "Edge"
            CF[CloudFront CDN]
            ACM_CF[ACM Certificate - CDN]
        end

        subgraph "VPC"
            subgraph "Public Subnets"
                ALB[Application Load Balancer]
                ACM_ALB[ACM Certificate - API]
            end

            subgraph "Private Subnets"
                subgraph "ECS Fargate"
                    TASK1[API Task 1]
                    TASK2[API Task 2..N]
                end
                RDS[(RDS PostgreSQL)]
            end
        end

        S3[S3 Static Bucket]
        SM[Secrets Manager]
        CW[CloudWatch]
    end

    subgraph "External"
        ERRORS[POST /api/errors - Frontend Error Reporter]
    end

    DEV -->|push| GH
    GH -->|trigger| GHA
    GHA -->|build & push image| ECR
    GHA -->|deploy| TASK1
    GHA -->|upload assets| S3

    CF -->|origin| S3
    CF -.->|API requests /api/*| ALB
    ALB -->|route| TASK1
    ALB -->|route| TASK2
    TASK1 -->|query| RDS
    TASK2 -->|query| RDS
    TASK1 -->|read secrets| SM
    TASK1 -->|logs & metrics| CW
    TASK1 -->|error logs| CW
```

### Network Architecture

```mermaid
graph TB
    subgraph "VPC 10.0.0.0/16"
        subgraph "Public Subnet AZ-a 10.0.1.0/24"
            ALB_A[ALB ENI]
            NAT_A[NAT Gateway]
        end
        subgraph "Public Subnet AZ-b 10.0.2.0/24"
            ALB_B[ALB ENI]
        end
        subgraph "Private Subnet AZ-a 10.0.3.0/24"
            ECS_A[ECS Tasks]
        end
        subgraph "Private Subnet AZ-b 10.0.4.0/24"
            ECS_B[ECS Tasks]
            RDS_STANDBY[RDS Standby]
        end
        subgraph "Isolated Subnet AZ-a 10.0.5.0/24"
            RDS_PRIMARY[RDS Primary]
        end
        subgraph "Isolated Subnet AZ-b 10.0.6.0/24"
            RDS_STANDBY2[RDS Standby]
        end
    end

    ALB_A --> ECS_A
    ALB_B --> ECS_B
    ECS_A --> RDS_PRIMARY
    ECS_B --> RDS_PRIMARY
    ECS_A -->|outbound via| NAT_A
```

### Deployment Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant GHA as GitHub Actions
    participant ECR as ECR
    participant ECS as ECS Fargate
    participant RDS as RDS PostgreSQL
    participant S3 as S3
    participant CF as CloudFront

    Dev->>GH: Push to main
    GH->>GHA: Trigger workflow
    GHA->>GHA: Install, Lint, Type-check, Test
    GHA->>GHA: Build API Docker image
    GHA->>ECR: Push image (tagged: commit SHA)
    GHA->>GHA: Build Web (vite build)
    GHA->>S3: Upload static assets
    GHA->>CF: Create invalidation (index.html)
    GHA->>ECS: Run migration task
    ECS->>RDS: prisma migrate deploy
    GHA->>ECS: Update service (new image)
    ECS->>ECS: Rolling deployment
    ECS->>ECS: Health check passes
    Note over GHA,ECS: If health check fails → automatic rollback
```

---

## Components and Interfaces

### 1. CDK Infrastructure Package

A new `packages/infra` package containing all AWS CDK stacks:

```
packages/infra/
├── bin/
│   └── app.ts                    # CDK app entry point
├── lib/
│   ├── stacks/
│   │   ├── network-stack.ts      # VPC, subnets, security groups
│   │   ├── database-stack.ts     # RDS PostgreSQL, secrets
│   │   ├── container-stack.ts    # ECR, ECS, Fargate, ALB
│   │   ├── cdn-stack.ts          # CloudFront, S3, certificates
│   │   └── monitoring-stack.ts   # CloudWatch dashboards, alarms
│   ├── constructs/
│   │   ├── fargate-api.ts        # Custom construct for API service
│   │   └── static-site.ts       # Custom construct for S3+CF
│   └── config/
│       ├── environments.ts       # Per-environment configuration
│       └── tags.ts               # Resource tagging strategy
├── cdk.json
├── tsconfig.json
└── package.json
```

### 2. Docker Configuration

```
docker/
├── Dockerfile                    # Multi-stage production Dockerfile
├── .dockerignore                 # Exclude dev files, node_modules, .git
└── docker-compose.yml            # Local development orchestration
```

### 3. GitHub Actions Workflows

```
.github/
└── workflows/
    ├── ci.yml                    # PR checks: lint, type-check, test
    ├── deploy.yml                # Main branch: build, push, deploy
    └── migration.yml             # Reusable workflow for DB migrations
```

### 4. Application Configuration Module

```
packages/api/src/config/
├── index.ts                      # Configuration loader with validation
├── secrets.ts                    # AWS Secrets Manager client
└── validation.ts                 # Zod schema for required config
```

### 5. Health Check Enhancement

```
packages/api/src/routes/health.ts  # Enhanced health endpoint with DB check
```

### 6. Error Tracking Integration

```
packages/api/src/middleware/errorLogger.ts   # Structured error logging to CloudWatch
packages/api/src/routes/errors.ts            # POST /api/errors endpoint for frontend errors
packages/web/src/lib/errorReporter.ts        # Frontend error reporter (sends to API)
```

---

### Component Interface Definitions

#### CDK Stack Interfaces

```typescript
// packages/infra/lib/config/environments.ts
interface EnvironmentConfig {
  readonly account: string;
  readonly region: string;
  readonly stage: 'staging' | 'production';
  readonly domain: {
    readonly api: string;       // e.g., "api.solofounder.app"
    readonly web: string;       // e.g., "app.solofounder.app"
    readonly zone: string;      // e.g., "solofounder.app"
  };
  readonly database: {
    readonly instanceClass: string;   // e.g., "db.t3.micro"
    readonly allocatedStorage: number; // GB
    readonly multiAz: boolean;
  };
  readonly ecs: {
    readonly cpu: number;        // 256, 512, 1024, 2048, 4096
    readonly memory: number;     // MB
    readonly minCapacity: number;
    readonly maxCapacity: number;
    readonly scaleOutCpuPercent: number;
    readonly scaleInCpuPercent: number;
  };
  readonly monitoring: {
    readonly alarmEmail: string;
    readonly logRetentionDays: number;
  };
}
```

#### Configuration Loader Interface

```typescript
// packages/api/src/config/index.ts
interface AppConfig {
  readonly port: number;
  readonly nodeEnv: 'development' | 'staging' | 'production';
  readonly database: {
    readonly url: string;
  };
  readonly session: {
    readonly secret: string;
    readonly maxAge: number;
  };
  readonly github: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly callbackUrl: string;
  };
  readonly encryption: {
    readonly key: string;
  };
  readonly sentry: {
    readonly enabled: false;
  };
  readonly errorTracking: {
    readonly logGroupName: string;
    readonly environment: string;
  };
  readonly cors: {
    readonly origin: string;
  };
}

// Loads from Secrets Manager in production, env vars in development
function loadConfig(): Promise<AppConfig>;
```

#### Health Check Response Interface

```typescript
// packages/api/src/routes/health.ts
interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'connected' | 'disconnected';
      latencyMs?: number;
    };
  };
}
```

#### Dockerfile Interface (Multi-stage)

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
# Install production dependencies only

# Stage 2: Build
FROM node:20-alpine AS builder
# Compile TypeScript, generate Prisma client

# Stage 3: Production
FROM node:20-alpine AS production
# Minimal image: compiled JS + production node_modules
# Non-root user, HEALTHCHECK, single exposed port
```

---

## Data Models

### Infrastructure Configuration Data

No new database models are required. The infrastructure uses AWS-managed state:

| Data Store | Purpose | Managed By |
|-----------|---------|-----------|
| RDS PostgreSQL | Application data (existing Prisma schema) | AWS RDS |
| Secrets Manager | Credentials, API keys, DSNs | AWS Secrets Manager |
| ECR | Docker image versions | AWS ECR |
| S3 | Frontend static assets | AWS S3 |
| CloudWatch Logs | Application logs + error tracking (90-day retention) | AWS CloudWatch |
| CloudWatch Metrics | Performance metrics and error rate alarms | AWS CloudWatch |

### Secrets Manager Structure

```
/solo-founder-launch-os/{stage}/
├── database/
│   ├── url              # postgresql://user:pass@host:5432/dbname
│   ├── username         # RDS master username
│   └── password         # RDS master password
├── github/
│   ├── client-id        # GitHub OAuth App ID
│   ├── client-secret    # GitHub OAuth secret
│   └── callback-url     # OAuth callback URL
├── session/
│   └── secret           # Express session secret
├── encryption/
│   └── key              # AES encryption key for access tokens
└── sentry/
    └── dsn              # (removed — using CloudWatch for error tracking)
```

### ECR Lifecycle Policy

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 tagged images",
      "selection": {
        "tagStatus": "tagged",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Remove untagged after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countNumber": 7,
        "countUnit": "days"
      },
      "action": { "type": "expire" }
    }
  ]
}
```

### CloudWatch Alarms Configuration

| Alarm | Metric | Threshold | Period | Action |
|-------|--------|-----------|--------|--------|
| High Error Rate | 5xx count / total requests | > 5% | 5 min | SNS → Email |
| High Latency | p95 response time | > 2000ms | 5 min | SNS → Email |
| High CPU | ECS CPU utilization | > 80% | 10 min | SNS → Email |
| DB Connection Saturation | Active connections | > 80% pool max | 5 min | SNS → Email |

### Resource Tagging Strategy

All AWS resources receive these tags:

```typescript
{
  Project: 'solo-founder-launch-os',
  Environment: 'production' | 'staging',
  ManagedBy: 'cdk',
  CostCenter: 'solo-founder-launch-os'
}
```

---

## Error Handling

### Container Startup Failures

| Failure | Behavior | Recovery |
|---------|----------|----------|
| Missing env vars | Exit code 1, log missing var names to stderr | Fix Secrets Manager, redeploy |
| Database unreachable | Exit code 1, log connection error | ECS replaces task; check RDS/security groups |
| Secrets Manager timeout | Exit code 1, log AWS SDK error | Check IAM role permissions |
| Port already in use | Exit code 1, log port conflict | Should not happen in Fargate (isolated task) |

### Deployment Failures

| Failure | Behavior | Recovery |
|---------|----------|----------|
| Migration failure | Pipeline halts; DB unchanged (transactional) | Fix migration, re-push |
| Health check timeout | ECS marks task unhealthy after 3 failures | ECS auto-replaces; pipeline rolls back |
| Image pull failure | ECS task fails to start | Check ECR permissions and image tag |
| Insufficient resources | ECS cannot place task | Check Fargate quotas / adjust task size |

### Runtime Errors

| Failure | Behavior | Recovery |
|---------|----------|----------|
| Unhandled exception | CloudWatch captures structured error log; alarm fires if threshold exceeded | Investigate via CloudWatch Logs Insights; deploy fix |
| Database connection lost | Health check returns 503; ALB stops routing | Auto-reconnect via Prisma; RDS failover for Multi-AZ |
| Memory exhaustion | ECS OOM kills task | Auto-replaced by ECS; investigate memory leak |
| Rate limiting from GitHub | Exponential backoff (existing retry.ts) | Automatic; logged for visibility |

### Rollback Strategy

1. **Automatic**: ECS deployment circuit breaker detects unhealthy tasks → reverts to previous task definition
2. **Manual**: Re-deploy previous Git commit SHA via GitHub Actions workflow dispatch
3. **Database**: Migrations are forward-only; destructive changes require a separate rollback migration
4. **Frontend**: CloudFront serves previous cached assets until new invalidation completes

---

## Testing Strategy

### Assessment: Property-Based Testing Applicability

This feature is **Infrastructure as Code, CI/CD configuration, and deployment orchestration**. PBT is NOT appropriate because:

- CDK stacks are declarative infrastructure definitions, not functions with variable inputs
- Dockerfiles are deterministic build recipes
- GitHub Actions workflows are declarative pipeline definitions
- The testing surface is "does the infrastructure deploy correctly and pass health checks"

### Recommended Testing Approach

#### 1. CDK Snapshot Tests

Verify CDK synthesizes the expected CloudFormation templates. Catches unintended infrastructure drift.

```typescript
// packages/infra/test/stacks.test.ts
import { Template } from 'aws-cdk-lib/assertions';

test('Network stack creates VPC with expected subnets', () => {
  const template = Template.fromStack(networkStack);
  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::EC2::Subnet', 6); // 2 public, 2 private, 2 isolated
});
```

#### 2. CDK Assertion Tests

Validate specific resource properties match requirements.

```typescript
test('RDS instance has Multi-AZ enabled', () => {
  const template = Template.fromStack(databaseStack);
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    MultiAZ: true,
    BackupRetentionPeriod: 30,
    StorageEncrypted: true,
  });
});

test('ECS service has auto-scaling configured', () => {
  const template = Template.fromStack(containerStack);
  template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
    MinCapacity: 1,
    MaxCapacity: 4,
  });
});
```

#### 3. Docker Build Verification

```bash
# Verify multi-stage build produces minimal image
docker build -t test-api .
docker run --rm test-api node -e "console.log('ok')"

# Verify non-root user
docker run --rm test-api whoami  # → "appuser"

# Verify no dev dependencies
docker run --rm test-api ls node_modules/.package-lock.json | grep -v devDependencies
```

#### 4. Health Check Integration Test

```typescript
// packages/api/src/__tests__/health.integration.test.ts
test('GET /health returns 200 with expected shape', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    status: 'healthy',
    version: expect.any(String),
    checks: { database: { status: 'connected' } },
  });
});
```

#### 5. Configuration Validation Tests

```typescript
// packages/api/src/__tests__/config.test.ts
test('config validation rejects missing required values', () => {
  expect(() => validateConfig({})).toThrow(/DATABASE_URL is required/);
});

test('config validation accepts complete config', () => {
  const config = validateConfig(completeEnvFixture);
  expect(config.database.url).toBeDefined();
});
```

#### 6. Smoke Tests (Post-Deployment)

Run after deployment to verify the live environment:

- Health endpoint returns 200
- CloudFront serves index.html with correct headers
- API returns proper CORS headers
- TLS certificate is valid and not expiring soon
- Error logging writes structured JSON to CloudWatch

#### 7. GitHub Actions Workflow Linting

Use `actionlint` to validate workflow syntax before merge.

### Test Organization

| Test Type | Location | Runner | Frequency |
|-----------|----------|--------|-----------|
| CDK Snapshots | `packages/infra/test/` | `vitest` | Every PR |
| CDK Assertions | `packages/infra/test/` | `vitest` | Every PR |
| Docker Build | CI workflow step | `docker build` | Every deploy |
| Health Check | `packages/api/src/__tests__/` | `vitest` | Every PR |
| Config Validation | `packages/api/src/__tests__/` | `vitest` | Every PR |
| Smoke Tests | `.github/workflows/deploy.yml` | `curl` / scripts | Post-deploy |
| Workflow Lint | `.github/workflows/ci.yml` | `actionlint` | Every PR |

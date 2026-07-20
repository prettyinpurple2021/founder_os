# Structure: Solo Founder Launch OS

## Monorepo Layout

```
founder_os/
├── packages/
│   ├── api/          — Express REST API (TypeScript, Prisma, PostgreSQL)
│   ├── web/          — React SPA frontend (Vite, Tailwind CSS)
│   └── infra/        — AWS CDK infrastructure definitions
├── scripts/          — Operational scripts (readiness checks, bundle analysis, monitoring)
├── load-tests/       — k6 load test scenarios
├── docs/             — Design system docs, deployment guides, architecture review
├── docker/           — Dockerfile and docker-compose for local development
├── .github/workflows/ — CI, deploy, and migration pipelines
└── .kiro/            — Kiro specs and steering documentation
```

npm workspaces root manages all three packages. Root `package.json` provides unified dev/build/test/lint commands.

---

## packages/api

```
src/
├── routes/       — HTTP handling only: parse input, call service, send response (export default Router)
├── services/     — All business logic, DB queries, external API calls
├── lib/          — Shared utilities: prisma.ts, encryption.ts, retry.ts, transaction.ts, bedrock.ts, posthog.ts, sanitize.ts
├── errors/       — AppError class and factory helpers
├── middleware/   — errorHandler, errorLogger, csrf, rateLimit, sessionExpiration, staleDataIndicator, traceId, validate
├── auth/         — Passport GitHub OAuth strategy (passport.ts)
├── config/       — App config, secrets loading, validation, databaseUrl
├── validation/   — Zod schemas (schemas.ts)
├── types/        — express.d.ts (session/user type augmentation)
├── generated/    — Prisma-generated client (never hand-edit)
└── __tests__/    — All test files (flat, named by feature)
```

Key services:
- `sync.ts` — GitHub sync orchestration
- `github.ts` — GitHub API client
- `inference.ts` — Task state inference from evidence
- `checklist.ts` — Launch readiness evaluation
- `content.ts` — Draft generation and lifecycle
- `marketing.ts` — Marketing asset suggestions
- `dashboard.ts` — Aggregated dashboard data
- `scheduler.ts` — Background cron jobs
- `logger.ts` — Structured logging

---

## packages/web

```
src/
├── pages/        — Route-level page components (Dashboard, Checklist, Content, Marketing, DraftDetail, Login, Settings, AuthCallback)
├── components/
│   ├── ui/       — Primitive design system components (Button, Card, Badge, Input, Skeleton, ProgressRail, DiamondEdgePanel)
│   └── ...       — Feature components (Layout, NavigationRail, MobileNav, SyncButton, RepositoryConnection, RejectedDrafts, UtilityBar, ProtectedRoute)
├── contexts/     — AuthContext (global auth state)
├── hooks/        — Custom hooks (useCountUp)
├── lib/          — api.ts (typed fetch wrapper), errorReporter.ts
└── __tests__/    — All test files
```

Routing via `react-router-dom` v7. Auth guard via `ProtectedRoute`. GitHub OAuth callback handled by `AuthCallback.tsx`.

---

## packages/infra

AWS CDK (TypeScript). Defines all AWS infrastructure for production deployment.

```
bin/    — CDK app entry point
lib/    — Stack definitions
test/   — CDK stack tests (vitest)
```

---

## scripts/

Operational TypeScript scripts run via `tsx`:
- `check-readiness.ts` — Pre-deployment readiness checks
- `verify-monitoring.ts` — Validates CloudWatch alarms and dashboards
- `check-bundle.ts` — Analyzes frontend bundle size
- `bootstrap.ts` — Initial environment setup
- `setup-secrets.ts` — AWS Secrets Manager provisioning
- `lib/` — Shared script utilities (aws.ts, checks.ts, reporter.ts, bundle-analyzer.ts)

---

## Data Model (Key Relationships)

```
User → one Repository (unique), many ContentDraft, many Session
Repository → many Task, many Sync
Task → many Evidence, many StateTransition
ContentDraft → many DraftVersion
Task: unique on [repositoryId, githubIssueId]
```

Full schema: `packages/api/prisma/schema.prisma`

---

## Architectural Patterns

- Strict route/service separation — routes are thin HTTP adapters only
- All DB access through shared Prisma client (`src/lib/prisma.ts`)
- AppError hierarchy for all error propagation
- Structured logging via `src/services/logger.ts` (never raw console)
- Encryption at rest for OAuth tokens via `src/lib/encryption.ts`
- Exponential backoff for external API calls via `src/lib/retry.ts`
- Zod for all input validation at route boundaries
- PostHog for analytics events (`src/lib/posthog.ts`)
- AWS Bedrock for AI content generation (`src/lib/bedrock.ts`)

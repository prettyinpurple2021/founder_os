---
inclusion: always
---

# Solo Founder Launch OS — Steering

## Product Context

Solo Founder Launch OS helps solo founders track product progress from GitHub, determine launch readiness, identify missing marketing materials, and generate build-in-public content drafts.

Scope: single user, single connected GitHub repository. No multi-tenant or team features.

## Architecture Overview

Monorepo using `npm workspaces` with two packages:

| Package | Stack | Purpose |
|---------|-------|---------|
| `packages/api` | Express, TypeScript, Prisma (PostgreSQL), Passport GitHub OAuth | REST API |
| `packages/web` | React 18, Vite, Tailwind CSS | SPA frontend |

Both packages use ES modules (`"type": "module"`) and TypeScript strict mode.

## API Package Structure

```
packages/api/src/
├── routes/        — HTTP handling, validation, auth guards (export default Router)
├── services/      — Business logic, DB queries, external API calls
├── lib/           — Shared utils: prisma.ts, encryption.ts, retry.ts, transaction.ts
├── errors/        — AppError class and factory helpers
├── middleware/    — Error handler, session expiration, staleness indicators
├── auth/          — Passport GitHub strategy (passport.ts)
├── types/         — Shared TypeScript interfaces
├── generated/     — Prisma-generated client and types (never hand-edit)
└── __tests__/     — All test files
```

## Code Rules

### Imports

- Use `.js` extension in all relative imports (TS compiles to JS with ESM).
- Import Prisma types from `src/generated/prisma/`. Never hand-write DB model types.

### TypeScript

- Strict mode enabled. Never use `any`; use `unknown` with type guards.
- Prefix unused parameters with `_` (e.g., `_req`, `_next`).

### Route/Service Separation

- Routes handle HTTP concerns only: parse input, call a service, send response.
- Services own all business logic and database access via the shared Prisma client (`src/lib/prisma.ts`).
- Never put DB queries or business logic in route files.

### Route Handler Pattern

```typescript
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await someService.doWork(req.params.id);
    res.json(result);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Descriptive message'));
  }
});
```

### Error Handling

- Always use `AppError` factory helpers: `notFound`, `badRequest`, `unauthorized`, `forbidden`, `conflict`, `validationError`, `internalError`, `rateLimitExceeded`, `serviceUnavailable`, `authenticationError`.
- Never throw raw `Error` in routes. Wrap unexpected errors with `internalError()`.
- All errors carry: `code` (machine-readable), `message` (human-readable), `retryable` (boolean).
- Log via `src/services/logger.ts` with category, action, and non-sensitive context.
- Never expose stack traces or internal details in API responses.

### Security

- Encrypt `accessToken` at rest via `src/lib/encryption.ts`. Never log or return raw tokens.
- Guard all routes with `requireAuth` middleware.
- Validate and sanitize all user inputs before use.

### File Documentation

- Add doc comment at top of each route/service file referencing requirement IDs: `// Requirements: 8.1, 8.2`.

## Testing

| Command | Scope |
|---------|-------|
| `npm run test:api` | API tests (`vitest run`) |
| `npm run test:web` | Web tests (`vitest run`) |
| `npm run test` | Both packages |

### Conventions

- Test files live in `src/__tests__/{feature-or-property}.test.ts`.
- Use `fast-check` for property-based tests covering invariants (state transitions, evidence preservation, content lifecycle, data integrity).
- Use `supertest` for integration/route-level HTTP tests.
- Prefer property-based tests for domain logic correctness; integration tests for HTTP behavior.

## Formatting and Linting

- Prettier for formatting, ESLint for linting.
- Run before committing: `npm run lint` and `npm run format:check`.

## Domain Rules

### Task State Machine

Valid states: `NOT_STARTED` → `IN_PROGRESS` → `BLOCKED` | `NEEDS_REVIEW` | `COMPLETED` | `UNCERTAIN`

- Every transition records evidence in `StateTransition` (with `evidenceIds`).
- Low confidence → `UNCERTAIN`. Never guess a state.
- `BLOCKED` → must populate `blockerReason`.
- `COMPLETED` → must retain linked `Evidence` records (never delete).

### GitHub Sync

- GitHub is the single source of truth for development progress.
- Evidence types: `ISSUE`, `PR`, `COMMIT`, `LABEL`, `STATUS_CHECK`.
- All syncs logged in `Sync` model with status, duration, and error details.
- Use exponential backoff for GitHub API failures (`src/lib/retry.ts`).

### Content Drafts

- Generate drafts from real shipped progress only. Never fabricate content.
- Platforms: `TWITTER`, `LINKEDIN`, `BLOG`.
- Lifecycle: `GENERATED` → `EDITING` → `PENDING_APPROVAL` → `APPROVED`/`REJECTED` → `SCHEDULED`/`COPIED`.
- Never auto-publish. Always require explicit user approval.
- Preserve rejected drafts and maintain version history in `DraftVersion`.

### Launch Readiness Checklist

- Categories: product, quality, deployment, legal/admin, marketing, content readiness.
- Surface blockers first. Always show the next best action.

### Marketing

- Suggest assets based on what is missing for launch.
- Recommend channels appropriate for product stage.
- Prefer practical, low-friction actions a solo founder can execute alone.

## Data Model (Key Relationships)

- `User` → one `Repository` (unique constraint), many `ContentDraft`, many `Session`
- `Repository` → many `Task`, many `Sync`
- `Task` → many `Evidence`, many `StateTransition`
- `ContentDraft` → many `DraftVersion`
- `Task` has unique constraint on `[repositoryId, githubIssueId]`

Reference `#[[file:packages/api/prisma/schema.prisma]]` for the full schema.

## UX Principles

- Dashboard is action-oriented: current status, blockers, next actions, recent progress.
- Make the next best action obvious.
- No clutter or unnecessary settings in first release.
- Prefer simple workflows over configurable dashboards.

# Guidelines: Solo Founder Launch OS

## File Documentation

Every route and service file must start with a requirement reference comment:

```typescript
// Requirements: 8.1, 8.2, 8.3
// Brief description of what this file does.
```

Scripts also include a CLI usage comment immediately after:

```typescript
// CLI: npx tsx scripts/check-readiness.ts --stage production [--json]
```

---

## TypeScript Standards

- Strict mode always on — never use `any`; use `unknown` with type guards
- Use `.js` extension in all relative imports (ESM compilation requirement)
- Prefix unused parameters with `_` (e.g., `_req`, `_next`)
- Import Prisma types from `src/generated/prisma/` — never hand-write DB model types
- Narrow `unknown` errors with `err instanceof Error ? err.message : 'Unknown error'`

```typescript
// Correct error narrowing pattern (used throughout codebase)
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
}
```

---

## Route Handler Pattern

Routes are thin HTTP adapters only — no business logic, no DB queries.

```typescript
// Requirements: X.Y
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await someService.doWork(req.params.id);
    res.json(result);
  } catch (err) {
    next(err instanceof AppError ? err : internalError('Descriptive message'));
  }
});
```

- Parse input → call service → send response
- All errors forwarded to `next()`
- Never throw raw `Error` in routes

---

## Error Handling

Always use `AppError` factory helpers — never throw raw errors:

```typescript
import { notFound, badRequest, unauthorized, forbidden, conflict,
         validationError, internalError, rateLimitExceeded,
         serviceUnavailable, authenticationError } from '../errors/AppError.js';
```

All `AppError` instances carry:
- `code` — machine-readable string
- `message` — human-readable string
- `retryable` — boolean

Never expose stack traces or internal details in API responses.

---

## Logging

Use `src/services/logger.ts` — never use `console.log` in application code:

```typescript
import { logger } from '../services/logger.js';
logger.info({ category: 'sync', action: 'github-fetch', repoId });
```

- Always include `category`, `action`, and non-sensitive context
- Never log raw tokens, passwords, or PII
- Scripts use `console.log`/`console.error` (acceptable for CLI output)

---

## Security Patterns

- Encrypt `accessToken` at rest via `src/lib/encryption.ts` — never log or return raw tokens
- Guard all routes with `requireAuth` middleware
- Validate all user inputs with Zod schemas at route boundaries (`src/validation/schemas.ts`)
- Use `src/lib/sanitize.ts` before using user-supplied strings

---

## Service Patterns

### Retry with Exponential Backoff

Use `src/lib/retry.ts` for all external API calls (GitHub, AWS):

```typescript
import { withRetry } from '../lib/retry.js';
const data = await withRetry(() => githubClient.fetchIssues(repoId));
```

### Database Transactions

Use `src/lib/transaction.ts` for multi-step DB operations:

```typescript
import { withTransaction } from '../lib/transaction.js';
await withTransaction(async (tx) => {
  await tx.task.update(...);
  await tx.stateTransition.create(...);
});
```

### Prisma Client

Always import from the shared client — never instantiate directly:

```typescript
import { prisma } from '../lib/prisma.js';
```

---

## Script Patterns

CLI scripts follow a consistent structure:

1. Requirement comment + CLI usage comment at top
2. `parseArgs(argv: string[])` function — validates required args, calls `process.exit(1)` with usage on error
3. Individual check functions returning a typed result object
4. `main(): Promise<void>` — orchestrates checks, prints output, exits with `0` (pass) or `1` (fail)
5. `main().catch(...)` at bottom for fatal error handling

```typescript
async function main(): Promise<void> { ... }

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
```

Check functions return typed result objects (never throw for expected failures):

```typescript
async function checkSomething(): Promise<{ status: 'pass' | 'fail'; actual: string; remediation?: string }> {
  try {
    // ...
    return { status: 'pass', actual: 'Description of what passed' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'fail', actual: `Error: ${message}`, remediation: REMEDIATION_HINTS.key };
  }
}
```

---

## Testing Conventions

- Test files in `src/__tests__/{feature}.test.ts` (flat, named by feature)
- Use `fast-check` for property-based tests covering invariants
- Use `supertest` for HTTP integration tests
- Prefer property-based tests for domain logic; integration tests for HTTP behavior
- Test files may use `any` (ESLint rule relaxed for `__tests__/`)

```typescript
// Property-based test pattern
import fc from 'fast-check';
it('invariant description', () => {
  fc.assert(fc.property(fc.string(), (input) => {
    // assert invariant
  }));
});
```

---

## Naming Conventions

- Files: `kebab-case.ts` for all source files
- Functions/variables: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE` for module-level constants (e.g., `REMEDIATION_HINTS`, `DIST_DIR`)
- React components: `PascalCase` filename and export

---

## ESLint Rules Summary

- `@typescript-eslint/no-unused-vars`: warn (args with `^_` prefix ignored)
- `@typescript-eslint/no-explicit-any`: warn (off in test files)
- `prettier/prettier`: warn
- `react-hooks/rules-of-hooks`: error
- `react-hooks/exhaustive-deps`: warn
- `react/react-in-jsx-scope`: off (React 18 JSX transform)
- Generated files (`**/generated/**`) and build outputs (`**/dist/**`) are ignored

---

## Formatting (Prettier)

- Single quotes: `'`
- Trailing commas: all
- Print width: 100
- Semicolons: yes
- Tab width: 2 spaces

Run before committing: `npm run lint && npm run format:check`

---

## Domain Rules (Enforced in Code)

### Task State Machine
Valid transitions only: `NOT_STARTED` → `IN_PROGRESS` → `BLOCKED` | `NEEDS_REVIEW` | `COMPLETED` | `UNCERTAIN`
- Every transition must record `evidenceIds` in `StateTransition`
- `BLOCKED` must populate `blockerReason`
- `COMPLETED` evidence records must never be deleted

### Content Drafts
- Generate from real shipped progress only — never fabricate
- Never auto-publish — always require explicit user approval
- Preserve rejected drafts; maintain `DraftVersion` history

### GitHub Sync
- GitHub is the single source of truth
- All syncs logged in `Sync` model with status, duration, error details
- Use exponential backoff for all GitHub API failures

---

## Load Testing

k6 load tests in `load-tests/`. Run with:

```bash
npm run test:load -- --env TEST_SESSION_COOKIE=<value>
```

Thresholds and scenario config in `load-tests/config.json`. Scenarios in `load-tests/scenarios/`.
Health endpoint target: < 500ms. Dashboard endpoint target: < 2000ms.

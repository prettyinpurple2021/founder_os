# Tech: Solo Founder Launch OS

## Languages & Runtimes
- TypeScript 5.3+ (strict mode, ES2022 target, ESNext modules)
- Node.js (ESM — all packages use `"type": "module"`)
- JavaScript (load tests via k6)

## TypeScript Config
- `strict: true` — no implicit any, strict null checks
- `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`
- Relative imports must use `.js` extension (ESM compilation requirement)
- Never use `any`; use `unknown` with type guards

---

## packages/api Stack

| Concern | Library |
|---|---|
| HTTP framework | Express 4 |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Database | PostgreSQL (`pg` 8) |
| Auth | Passport + `passport-github2` (GitHub OAuth) |
| Sessions | `express-session` |
| Validation | Zod 4 |
| Rate limiting | `express-rate-limit` |
| Security headers | `helmet` |
| AI generation | AWS Bedrock (`@aws-sdk/client-bedrock-runtime`) |
| Secrets | AWS Secrets Manager (`@aws-sdk/client-secrets-manager`) |
| Analytics | PostHog (`posthog-node`) |
| Scheduling | `node-cron` |
| Testing | Vitest + Supertest + `fast-check` |
| Dev runner | `tsx watch` |

## packages/web Stack

| Concern | Library |
|---|---|
| UI framework | React 18 |
| Build tool | Vite 8 |
| Routing | `react-router-dom` v7 |
| Styling | Tailwind CSS 3 + PostCSS |
| Utility | `clsx` |
| Fonts | Inter Variable, Space Grotesk Variable (`@fontsource-variable`) |
| Testing | Vitest + `fast-check` |

## packages/infra Stack

| Concern | Library |
|---|---|
| IaC | AWS CDK v2 (`aws-cdk-lib` 2.150+) |
| Constructs | `constructs` 10 |
| Testing | Vitest |

---

## Formatting & Linting

Prettier config (`prettier.config.js`):
- `singleQuote: true`
- `trailingComma: 'all'`
- `printWidth: 100`
- `semi: true`
- `tabWidth: 2`

ESLint: `eslint.config.js` (flat config, ESLint 9)
- `@typescript-eslint` plugin + parser
- `eslint-plugin-react` + `eslint-plugin-react-hooks`
- `eslint-plugin-prettier` (Prettier as ESLint rule)

---

## Development Commands

```bash
# Start both API and web in dev mode
npm run dev

# Individual packages
npm run dev:api
npm run dev:web

# Build
npm run build          # api + web
npm run build:api
npm run build:web

# Test
npm run test           # api + web
npm run test:api
npm run test:web
npm run test:infra
npm run test:scripts   # scripts/ vitest

# Lint & Format
npm run lint
npm run format
npm run format:check

# Infrastructure
npm run cdk:synth
npm run cdk:deploy

# Operational scripts
npm run bootstrap
npm run setup:secrets
npm run check:bundle
npm run check:readiness
npm run verify:monitoring

# Load testing (requires k6)
npm run test:load

# Prisma (from packages/api)
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

---

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- `ci.yml` — lint, test, build on push/PR
- `deploy.yml` — deploy to AWS
- `migration.yml` — run Prisma migrations

Deployment target: AWS (ECS via CDK). Task definition in `task-definition.json`.

## Docker

`docker/docker-compose.yml` for local development (PostgreSQL + API).
`docker/Dockerfile` for API container image.

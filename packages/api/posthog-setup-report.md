<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the `@solo-founder/api` Express application. A singleton `posthog-node` client was created in `src/lib/posthog.ts`, wired into the Express app with `setupExpressRequestContext` (for automatic session/distinct-ID header propagation from the frontend) and `setupExpressErrorHandler` (for automatic exception capture). Graceful shutdown handlers flush all queued events on `SIGINT`/`SIGTERM`. User identification fires on every successful GitHub OAuth login, setting `username` and `email` as person properties and recording `first_login_at` once. Error tracking is wired into the centralized error handler for all unhandled server errors. The CORS header allowlist was extended to permit `X-Posthog-Distinct-Id` and `X-Posthog-Session-Id` so the frontend can correlate its PostHog sessions with server-side events.

| Event name | Description | File |
|---|---|---|
| `user_logged_in` | User successfully authenticated via GitHub OAuth. | `src/routes/auth.ts` |
| `user_logged_out` | User explicitly logged out and their session was destroyed. | `src/routes/auth.ts` |
| `repository_connected` | User connected a GitHub repository to their account. | `src/routes/repos.ts` |
| `repository_disconnected` | User disconnected their currently connected GitHub repository. | `src/routes/repos.ts` |
| `sync_triggered` | User manually triggered a repository sync. | `src/routes/sync.ts` |
| `sync_completed` | A repository sync completed, recording whether it succeeded or failed. | `src/routes/sync.ts` |
| `content_draft_generated` | A build-in-public content draft was generated for a platform. | `src/routes/content.ts` |
| `content_draft_submitted_for_review` | User submitted a content draft for review. | `src/routes/content.ts` |
| `content_draft_approved` | User approved a content draft, moving it to approved status. | `src/routes/content.ts` |
| `content_draft_rejected` | User rejected a content draft with an optional reason. | `src/routes/content.ts` |
| `content_draft_scheduled` | User scheduled or copied an approved content draft for publishing. | `src/routes/content.ts` |
| `marketing_asset_completed` | User marked a marketing asset as completed. | `src/routes/marketing.ts` |
| `checklist_item_updated` | User manually overrode the status of a launch readiness checklist item. | `src/routes/checklist.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/520251/dashboard/1874312)
- [User logins over time (wizard)](https://us.posthog.com/project/520251/insights/eZq2K6qH)
- [Content draft creation funnel (wizard)](https://us.posthog.com/project/520251/insights/0jJ2OlXK)
- [Sync results by status (wizard)](https://us.posthog.com/project/520251/insights/fbawzanu)
- [Repository connections (wizard)](https://us.posthog.com/project/520251/insights/JWroK8zu)
- [Marketing assets completed (wizard)](https://us.posthog.com/project/520251/insights/scJvXETY)

## Verify before merging

- [ ] Run `npm install` from the monorepo root (`/Users/solosuccess_ai/projects/founder_os`) to install `posthog-node` — the sandbox could not write to the root `node_modules` during this run.
- [ ] Run a full production build (`npm run build --workspace=packages/api`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `POSTHOG_API_KEY` and `POSTHOG_HOST` to any CI/CD secrets, deployment environment configs, or bootstrap scripts so the production server has these values at runtime.
- [ ] Configure [`tracing_headers`](https://posthog.com/docs/libraries/js/config#tracing-headers) in the frontend PostHog JS SDK pointing at this API's hostname so browser requests automatically include `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` headers — this links frontend and backend events to the same person and session.
- [ ] Confirm the returning-visitor path also calls `identify` — the current implementation only identifies on fresh GitHub OAuth login, so returning users who restore a session from cookie will be on anonymous distinct IDs until they log in again.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>

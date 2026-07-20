# Product: Solo Founder Launch OS

## Purpose
Solo Founder Launch OS helps solo founders track product progress from GitHub, determine launch readiness, identify missing marketing materials, and generate build-in-public content drafts.

## Scope
- Single user, single connected GitHub repository
- No multi-tenant or team features

## Key Features

### GitHub Progress Tracking
- Syncs issues, PRs, commits, labels, and status checks from a connected GitHub repo
- GitHub is the single source of truth for development progress
- Evidence types: `ISSUE`, `PR`, `COMMIT`, `LABEL`, `STATUS_CHECK`
- All syncs logged with status, duration, and error details
- Exponential backoff for GitHub API failures

### Task State Machine
- States: `NOT_STARTED` → `IN_PROGRESS` → `BLOCKED` | `NEEDS_REVIEW` | `COMPLETED` | `UNCERTAIN`
- Every transition records evidence with `evidenceIds`
- Low confidence → `UNCERTAIN`; `BLOCKED` requires `blockerReason`
- `COMPLETED` tasks retain all linked Evidence records permanently

### Launch Readiness Checklist
- Categories: product, quality, deployment, legal/admin, marketing, content readiness
- Surfaces blockers first with next best action always visible

### Content Draft Generation
- Generates drafts from real shipped progress only — never fabricates content
- Platforms: `TWITTER`, `LINKEDIN`, `BLOG`
- Lifecycle: `GENERATED` → `EDITING` → `PENDING_APPROVAL` → `APPROVED`/`REJECTED` → `SCHEDULED`/`COPIED`
- Never auto-publishes; always requires explicit user approval
- Preserves rejected drafts and maintains version history in `DraftVersion`

### Marketing Guidance
- Suggests missing assets needed for launch
- Recommends channels appropriate for product stage
- Practical, low-friction actions a solo founder can execute alone

## Target Users
Solo founders building and launching a software product who want to:
- Understand their real launch readiness from actual GitHub activity
- Generate authentic build-in-public content without manual effort
- Know what marketing assets are missing before launch

## UX Principles
- Dashboard is action-oriented: current status, blockers, next actions, recent progress
- Next best action is always obvious
- No clutter or unnecessary settings in first release
- Simple workflows over configurable dashboards

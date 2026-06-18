# Design Document

## Overview

Solo Founder Launch OS is a full-stack web application that connects to a single GitHub repository per user, infers task states from repository activity, generates launch-readiness checklists, identifies missing marketing assets, and produces build-in-public content drafts. The architecture prioritizes simplicity, reliability, and production safety for solo founders.

## Architecture

### System Architecture

The application follows a layered architecture with clear separation between the frontend, API layer, business logic, and data persistence.

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
│  Dashboard │ Checklist │ Content │ Marketing │ Auth  │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────┴──────────────────────────────┐
│                  API Layer (Express)                  │
│  Auth Middleware │ Routes │ Validation │ Error Handler│
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│              Business Logic Services                  │
│  SyncService │ InferenceEngine │ ChecklistGenerator  │
│  ContentGenerator │ MarketingAnalyzer │ Scheduler    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│              Data Layer (PostgreSQL)                  │
│  Users │ Repos │ Tasks │ Syncs │ Drafts │ Logs      │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│            External Services                         │
│  GitHub API │ LLM API (content generation)           │
└─────────────────────────────────────────────────────┘
```

### Technology Stack

- **Frontend**: React with TypeScript, Tailwind CSS for styling
- **Backend**: Node.js with Express, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Passport.js with GitHub OAuth strategy
- **Job Scheduling**: node-cron for periodic syncs
- **Content Generation**: OpenAI API for draft generation
- **Testing**: Vitest for unit/property tests, fast-check for property-based testing

### Key Design Decisions

1. **Single repository per user**: Simplifies the data model and inference logic for v1.
2. **PostgreSQL over NoSQL**: Structured data with relationships (tasks, evidence, drafts) benefits from relational modeling.
3. **Server-side rendering not needed**: The app is a logged-in dashboard, so a React SPA with API is appropriate.
4. **LLM for content generation**: Drafts are generated via an LLM API to handle platform-specific tone and formatting.
5. **No direct social publishing in v1**: The system copies content or schedules reminders, avoiding OAuth complexity with multiple social platforms.

## Components

### 1. Authentication Module

**Purpose**: Handles user authentication via GitHub OAuth and session management.

**Interfaces**:
- `POST /auth/github` — Initiates GitHub OAuth flow
- `GET /auth/github/callback` — Handles OAuth callback
- `POST /auth/logout` — Destroys session
- `GET /auth/session` — Returns current session status

**Behavior**:
- Uses Passport.js GitHub strategy
- Issues secure, HTTP-only session cookies with encrypted tokens
- Stores GitHub access tokens encrypted at rest using AES-256
- Sessions expire after 24 hours of inactivity
- Redirects to login on invalid/expired sessions

### 2. Repository Connection Module

**Purpose**: Manages the single GitHub repository connection per user.

**Interfaces**:
- `GET /api/repos/available` — Lists user's GitHub repos for selection
- `POST /api/repos/connect` — Connects a repository
- `DELETE /api/repos/disconnect` — Disconnects current repository
- `GET /api/repos/current` — Returns connected repository info

**Behavior**:
- Enforces one-repository-per-user constraint at the database level (unique constraint on user_id)
- On connect, stores repo metadata and triggers initial sync
- On disconnect, preserves historical data but stops syncing

### 3. Sync Service

**Purpose**: Fetches data from GitHub and reconciles it with the local database.

**Interfaces**:
- `POST /api/sync/trigger` — Manual sync trigger
- `GET /api/sync/status` — Last sync status and timestamp
- `GET /api/sync/history` — Sync history log

**Behavior**:
- Fetches issues, pull requests, commits, labels, and status checks via GitHub REST API
- Runs automatically every 30 minutes (configurable per user)
- Implements retry with exponential backoff (3 attempts, base delay 1s, factor 2x)
- Logs every sync: timestamp, duration, items fetched, outcome
- On failure after retries: preserves last successful state, notifies user

**Retry Logic**:
```
attempt 1: immediate
attempt 2: wait 1s
attempt 3: wait 2s
If all fail: mark sync as failed, log error, notify user
```

### 4. Task Inference Engine

**Purpose**: Determines task states from GitHub evidence using rule-based inference.

**Interfaces**:
- Internal service called by SyncService after data fetch
- `GET /api/tasks` — Returns all tasks with current states
- `GET /api/tasks/:id/evidence` — Returns evidence for a specific task

**Inference Rules** (evaluated in priority order):
1. **Completed**: Issue is closed OR linked PR is merged
2. **Blocked**: Issue has label matching `/block/i` OR comment contains dependency indicator
3. **Needs Review**: Open PR with pending review requests
4. **In Progress**: Linked branch with commits in last 30 days OR open PR (no review requests)
5. **Not Started**: No linked branch, no commits, no assignee activity
6. **Uncertain**: None of the above rules match with confidence

**Evidence Preservation**:
- Every state transition stores: previous state, new state, timestamp, and array of evidence artifacts (issue URL, PR URL, commit SHA, label names)

### 5. Launch Readiness Checklist Generator

**Purpose**: Generates and maintains a categorized launch checklist based on current project state.

**Interfaces**:
- `GET /api/checklist` — Returns current checklist
- `PUT /api/checklist/items/:id` — Manual override of checklist item status

**Categories**:
- **Product**: Core features complete, critical bugs resolved
- **Quality**: Tests passing, no open critical issues
- **Deployment**: CI/CD configured, environment ready, domain set up
- **Legal/Admin**: Terms of service, privacy policy, business registration
- **Marketing**: Landing page, social profiles, announcement posts
- **Content**: Launch post drafted, changelog prepared

**Behavior**:
- Derives item status from task states and evidence
- Places blockers at top of list regardless of category
- Computes "next best action" as the highest-priority incomplete non-blocked item
- Updates reactively when task states change

### 6. Marketing Analyzer

**Purpose**: Identifies missing marketing assets and recommends actions.

**Interfaces**:
- `GET /api/marketing/status` — Returns marketing readiness analysis
- `POST /api/marketing/assets/:id/complete` — Marks an asset as completed

**Recommended Asset Set**:
- Landing page copy
- Social media announcement posts (Twitter/X, LinkedIn)
- Product changelog
- Product screenshots / demo GIF
- README with clear value proposition

**Behavior**:
- Compares user's completed assets against the recommended set
- Suggests missing assets sorted by impact and effort (low-friction first)
- Recommends channels based on product type (developer tool → Twitter/X, HackerNews; B2B → LinkedIn, ProductHunt)
- Updates checklist when assets are marked complete

### 7. Content Generator

**Purpose**: Generates build-in-public content drafts from shipped progress.

**Interfaces**:
- `POST /api/content/generate` — Generate a new draft (body: platform, time range)
- `GET /api/content/drafts` — List all drafts (filterable by status)
- `PUT /api/content/drafts/:id` — Edit a draft
- `POST /api/content/drafts/:id/approve` — Approve a draft
- `POST /api/content/drafts/:id/reject` — Reject a draft
- `POST /api/content/drafts/:id/schedule` — Schedule a draft
- `GET /api/content/drafts/:id/versions` — Get version history

**Draft Lifecycle**:
```
generated → [editing] → pending_approval → approved → scheduled/copied
                                         → rejected (preserved)
```

**Platform Tailoring**:
- Twitter/X: ≤280 characters, casual tone, hashtags optional
- LinkedIn: Professional tone, 1-3 paragraphs, engagement hooks
- Blog post: Longer form, technical detail, code snippets when relevant

**Behavior**:
- Uses LLM API with platform-specific prompts
- Stores every edit as a version (version number, content, timestamp)
- Rejected drafts move to a separate queue, content preserved
- No auto-publishing; user must explicitly approve then choose schedule or copy
- Logs every state transition (generate, edit, approve, reject, schedule)

### 8. Dashboard Aggregator

**Purpose**: Assembles the dashboard view from multiple services.

**Interfaces**:
- `GET /api/dashboard` — Returns aggregated dashboard data

**Response Shape**:
```typescript
{
  projectStatus: { total: number, byState: Record<TaskState, number> },
  blockers: Array<{ taskId: string, title: string, reason: string }>,
  nextAction: { description: string, category: string, priority: number },
  recentProgress: Array<{ taskId: string, title: string, completedAt: Date }>,
  lastSync: { timestamp: Date, status: string },
  launchReadiness: { percentage: number, blockerCount: number }
}
```

**Behavior**:
- Aggregates from TaskInferenceEngine, ChecklistGenerator, and SyncService
- Recent progress = tasks completed in last 7 days
- Minimal, action-oriented structure — no nested settings or config

### 9. Logging Service

**Purpose**: Centralized structured logging for all system events.

**Log Categories**:
- `sync`: Sync operations (timestamp, duration, outcome)
- `state_change`: Task state transitions (previous, new, evidence)
- `content`: Draft actions (generate, edit, approve, reject, schedule)
- `auth`: Authentication events (login, logout, session expiry)
- `error`: Errors with full context (operation, input, stack trace)

**Behavior**:
- All logs are structured JSON with consistent schema
- Logs are stored in a `system_logs` table for queryability
- Errors include operation context, input summary, and stack trace
- Retention: 90 days default

## Data Model

### Database Schema (Prisma)

```prisma
model User {
  id             String    @id @default(uuid())
  githubId       String    @unique
  username       String
  email          String?
  accessToken    String    // Encrypted at rest
  syncInterval   Int       @default(30) // minutes
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  repository     Repository?
  contentDrafts  ContentDraft[]
  sessions       Session[]
}

model Repository {
  id          String   @id @default(uuid())
  userId      String   @unique // Enforces one repo per user
  owner       String
  name        String
  fullName    String
  githubId    Int
  connectedAt DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])
  tasks       Task[]
  syncs       Sync[]
}

model Task {
  id           String      @id @default(uuid())
  repositoryId String
  githubIssueId Int
  title        String
  state        TaskState   @default(NOT_STARTED)
  blockerReason String?
  lastInferredAt DateTime?
  repository   Repository  @relation(fields: [repositoryId], references: [id])
  evidence     Evidence[]
  stateHistory StateTransition[]
}

model Evidence {
  id        String       @id @default(uuid())
  taskId    String
  type      EvidenceType // ISSUE, PR, COMMIT, LABEL, STATUS_CHECK
  url       String
  metadata  Json
  fetchedAt DateTime     @default(now())
  task      Task         @relation(fields: [taskId], references: [id])
}

model StateTransition {
  id           String    @id @default(uuid())
  taskId       String
  previousState TaskState
  newState     TaskState
  evidenceIds  String[]
  timestamp    DateTime  @default(now())
  task         Task      @relation(fields: [taskId], references: [id])
}

model Sync {
  id           String     @id @default(uuid())
  repositoryId String
  status       SyncStatus // PENDING, IN_PROGRESS, SUCCESS, FAILED
  startedAt    DateTime
  completedAt  DateTime?
  duration     Int?       // milliseconds
  itemsFetched Int?
  errorMessage String?
  retryCount   Int        @default(0)
  repository   Repository @relation(fields: [repositoryId], references: [id])
}

model ContentDraft {
  id          String        @id @default(uuid())
  userId      String
  platform    Platform      // TWITTER, LINKEDIN, BLOG
  status      DraftStatus   // GENERATED, EDITING, PENDING_APPROVAL, APPROVED, REJECTED, SCHEDULED, COPIED
  currentContent String
  scheduledAt DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  user        User          @relation(fields: [userId], references: [id])
  versions    DraftVersion[]
}

model DraftVersion {
  id        String   @id @default(uuid())
  draftId   String
  version   Int
  content   String
  editedAt  DateTime @default(now())
  draft     ContentDraft @relation(fields: [draftId], references: [id])
}

model MarketingAsset {
  id          String   @id @default(uuid())
  userId      String
  type        String   // landing_page, social_post, changelog, screenshots, readme
  status      String   // missing, in_progress, completed
  completedAt DateTime?
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  lastActiveAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}

model SystemLog {
  id        String   @id @default(uuid())
  category  String   // sync, state_change, content, auth, error
  action    String
  details   Json
  userId    String?
  timestamp DateTime @default(now())
}

enum TaskState {
  NOT_STARTED
  IN_PROGRESS
  BLOCKED
  NEEDS_REVIEW
  COMPLETED
  UNCERTAIN
}

enum EvidenceType {
  ISSUE
  PR
  COMMIT
  LABEL
  STATUS_CHECK
}

enum SyncStatus {
  PENDING
  IN_PROGRESS
  SUCCESS
  FAILED
}

enum Platform {
  TWITTER
  LINKEDIN
  BLOG
}

enum DraftStatus {
  GENERATED
  EDITING
  PENDING_APPROVAL
  APPROVED
  REJECTED
  SCHEDULED
  COPIED
}
```

## Correctness Properties

### Property 1: Single Repository Invariant
**Requirement**: 1.3
**Property**: For any sequence of repository connection operations by a single user, the system maintains at most one connected repository. Formally: `count(repositories WHERE userId = u) <= 1` for all users u.
**Type**: Invariant

### Property 2: Sync Retry Bounded
**Requirement**: 2.5, 11.2
**Property**: For any failed sync operation, the retry count never exceeds 3. The backoff delay for attempt n equals `baseDelay * 2^(n-1)` seconds. After 3 failures, the system marks sync as failed without further retries.
**Type**: Invariant

### Property 3: Last Successful State Preservation
**Requirement**: 2.6, 11.1
**Property**: After a failed sync (all retries exhausted), all task states and evidence remain identical to the state after the last successful sync. No task data is modified by a failed sync.
**Type**: Invariant

### Property 4: Task State Inference Completeness
**Requirement**: 3.1, 3.7
**Property**: For any set of GitHub evidence associated with a task, the inference engine assigns exactly one Task_State. The function `infer(evidence) → TaskState` is total — it always produces a result, defaulting to "uncertain" when no confident match exists.
**Type**: Invariant (totality)

### Property 5: Evidence Preservation on State Transition
**Requirement**: 3.8
**Property**: For every state transition recorded in the system, the associated evidence array is non-empty and references valid evidence records. Formally: `∀ transition: transition.evidenceIds.length > 0 ∧ ∀ id ∈ transition.evidenceIds: exists(evidence[id])`.
**Type**: Invariant

### Property 6: Checklist Category Completeness
**Requirement**: 4.1
**Property**: Every generated launch readiness checklist contains exactly 6 categories: product, quality, deployment, legal/admin, marketing, content. No category is ever omitted or duplicated.
**Type**: Invariant

### Property 7: Blockers-First Ordering
**Requirement**: 4.3
**Property**: In the rendered checklist, all items with blocker status appear before any non-blocker items. Formally: `∀ i,j: items[i].isBlocker ∧ ¬items[j].isBlocker → indexOf(i) < indexOf(j)`.
**Type**: Invariant (ordering)

### Property 8: Marketing Asset Suggestions are Complement
**Requirement**: 5.1
**Property**: The set of suggested marketing assets equals the recommended set minus the completed set. `suggestions = recommendedAssets \ completedAssets`. No completed asset appears in suggestions; no missing asset is omitted.
**Type**: Metamorphic

### Property 9: Content Draft Version History Monotonicity
**Requirement**: 6.4
**Property**: For any content draft, the version count is monotonically increasing and equals the number of edits plus one (the initial generation). After N edits, exactly N+1 versions exist. Versions are never deleted.
**Type**: Invariant

### Property 10: No Auto-Publishing Invariant
**Requirement**: 6.6, 7.1
**Property**: No content draft transitions to SCHEDULED or COPIED status without an explicit approval action recorded in the system log. Formally: `∀ draft: draft.status ∈ {SCHEDULED, COPIED} → ∃ log WHERE log.action = 'approve' ∧ log.draftId = draft.id`.
**Type**: Invariant

### Property 11: Rejected Drafts Preserved
**Requirement**: 6.5, 7.4
**Property**: Once a draft is rejected, its content is preserved and accessible in the rejected queue. Rejected drafts are never deleted from the database. `∀ draft: draft.status = REJECTED → draft.currentContent ≠ null ∧ draft.deletedAt = null`.
**Type**: Invariant

### Property 12: Logging Completeness for State Changes
**Requirement**: 10.2
**Property**: For every task state transition, a corresponding system log entry exists with category "state_change" containing the previous state, new state, and evidence references. `count(state_transitions) = count(logs WHERE category = 'state_change')`.
**Type**: Invariant

### Property 13: Dashboard Recent Progress Time Bound
**Requirement**: 8.4
**Property**: All tasks shown in the dashboard's recent progress section have a completion timestamp within the last 7 days. `∀ task ∈ recentProgress: now() - task.completedAt ≤ 7 days`.
**Type**: Invariant (filter correctness)

### Property 14: Session Expiration Enforcement
**Requirement**: 9.3, 9.5
**Property**: No API request succeeds with a session whose `lastActiveAt` is more than 24 hours ago. Any such request results in a redirect to the login flow.
**Type**: Invariant

### Property 15: Data Preservation During Outages
**Requirement**: 11.4
**Property**: During any external service outage (GitHub API, LLM API), all user data, drafts, and task states remain intact. No write operation to user data tables fails silently — either the operation succeeds or an explicit error is surfaced without data loss.
**Type**: Invariant

## API Design

### Authentication Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /auth/github | Redirect to GitHub OAuth |
| GET | /auth/github/callback | Handle OAuth callback |
| POST | /auth/logout | End session |
| GET | /auth/session | Check session validity |

### Core API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/repos/available | List user's GitHub repos |
| POST | /api/repos/connect | Connect a repository |
| DELETE | /api/repos/disconnect | Disconnect repository |
| GET | /api/repos/current | Get connected repo info |
| POST | /api/sync/trigger | Trigger manual sync |
| GET | /api/sync/status | Get last sync status |
| GET | /api/sync/history | Get sync history |
| GET | /api/tasks | List all tasks with states |
| GET | /api/tasks/:id/evidence | Get task evidence |
| GET | /api/checklist | Get launch readiness checklist |
| PUT | /api/checklist/items/:id | Update checklist item |
| GET | /api/marketing/status | Get marketing analysis |
| POST | /api/marketing/assets/:id/complete | Mark asset complete |
| GET | /api/dashboard | Get dashboard data |

### Content Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/content/generate | Generate new draft |
| GET | /api/content/drafts | List drafts |
| PUT | /api/content/drafts/:id | Edit draft |
| POST | /api/content/drafts/:id/approve | Approve draft |
| POST | /api/content/drafts/:id/reject | Reject draft |
| POST | /api/content/drafts/:id/schedule | Schedule draft |
| GET | /api/content/drafts/:id/versions | Get version history |

## Error Handling Strategy

All errors follow a consistent response format:

```typescript
{
  error: {
    code: string,        // Machine-readable error code
    message: string,     // Human-readable description
    retryable: boolean,  // Whether the client should retry
    context?: object     // Additional debugging context (non-sensitive)
  }
}
```

External service failures trigger the retry pipeline (3 attempts, exponential backoff). If all retries fail, the system returns the last known good state with a staleness indicator.

## Security Considerations

1. **Token encryption**: GitHub access tokens encrypted with AES-256-GCM at rest
2. **Session security**: HTTP-only, Secure, SameSite=Strict cookies
3. **Input validation**: All API inputs validated with zod schemas
4. **Rate limiting**: API rate limiting to prevent abuse
5. **CORS**: Strict origin policy matching the frontend domain
6. **Secrets management**: Environment variables for all secrets, never committed to repo

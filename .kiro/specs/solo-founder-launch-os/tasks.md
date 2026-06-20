# Implementation Plan: Solo Founder Launch OS

## Overview

This implementation plan breaks down the Solo Founder Launch OS into incremental coding tasks. The system is a full-stack TypeScript application (Express API + React SPA) that connects to a GitHub repository, infers task states, generates launch checklists, identifies missing marketing assets, and produces build-in-public content drafts. Tasks are ordered so each builds on previous work, with checkpoints for validation.

## Tasks

- [x] 1. Project Setup and Infrastructure
  - [x] 1.1 Initialize Node.js/TypeScript project with Express backend and React frontend (monorepo structure with `packages/api` and `packages/web`)
    - Create directory structure and configure workspaces
    - _Requirements: 1.1, 9.1_
  - [x] 1.2 Configure PostgreSQL with Prisma ORM, create initial schema migration with all models (User, Repository, Task, Evidence, StateTransition, Sync, ContentDraft, DraftVersion, MarketingAsset, Session, SystemLog)
    - Define all enums and relations per the design data model
    - _Requirements: 1.2, 1.3_
  - [x] 1.3 Set up Vitest and fast-check for unit and property-based testing
    - Configure test runner and property testing library
    - _Requirements: N/A (infrastructure)_
  - [x] 1.4 Configure environment variables (.env.example) for database URL, GitHub OAuth credentials, encryption key, LLM API key, and session secret
    - _Requirements: 9.4_
  - [x] 1.5 Set up centralized error handling middleware with consistent error response format (code, message, retryable, context)
    - _Requirements: 11.3_
  - [x] 1.6 Configure ESLint, Prettier, and TypeScript strict mode for both packages
    - _Requirements: N/A (infrastructure)_

- [x] 2. Authentication and Session Management
  - [x] 2.1 Implement GitHub OAuth flow using Passport.js GitHub strategy (routes: GET /auth/github, GET /auth/github/callback)
    - _Requirements: 1.1, 9.1_
  - [x] 2.2 Implement session management with secure HTTP-only cookies (Secure, SameSite=Strict flags)
    - _Requirements: 9.2_
  - [x] 2.3 Implement AES-256-GCM encryption/decryption utilities for storing GitHub access tokens at rest
    - _Requirements: 9.4_
  - [x] 2.4 Implement session expiration check middleware (invalidate after 24 hours of inactivity based on lastActiveAt)
    - _Requirements: 9.3, 9.5_
  - [x] 2.5 Implement POST /auth/logout endpoint that destroys session
    - _Requirements: 10.4_
  - [x] 2.6 Implement GET /auth/session endpoint returning current session validity
    - _Requirements: 9.2_
  - [x] 2.7 Implement auth error handling: descriptive error on OAuth failure, redirect to login on expired/invalid session
    - _Requirements: 1.4, 9.5_
  - [x] 2.8 Write tests for session expiration logic, token encryption round-trip, and auth middleware behavior
    - Test session invalidation after 24h inactivity
    - Test AES-256-GCM encrypt/decrypt round-trip
    - _Requirements: 9.3, 9.4_

- [x] 3. Repository Connection Module
  - [x] 3.1 Implement GET /api/repos/available endpoint that lists user's GitHub repositories using their access token
    - _Requirements: 1.2_
  - [x] 3.2 Implement POST /api/repos/connect endpoint with unique constraint enforcement (one repo per user), storing repo metadata and triggering initial sync
    - _Requirements: 1.2, 1.3_
  - [x] 3.3 Implement DELETE /api/repos/disconnect endpoint (preserves historical data, stops syncing)
    - _Requirements: 1.3_
  - [x] 3.4 Implement GET /api/repos/current endpoint returning connected repository info
    - _Requirements: 1.3_
  - [x] 3.5 Write property test for single repository invariant
    - **Property 1: Single Repository Invariant**
    - For any sequence of connect operations by a single user, at most one repository is connected
    - **Validates: Requirements 1.3**

- [x] 4. Checkpoint - Core infrastructure and auth
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Sync Service
  - [x] 5.1 Implement GitHub API client module that fetches issues, pull requests, commits, labels, and status checks for a repository
    - _Requirements: 2.1_
  - [x] 5.2 Implement POST /api/sync/trigger endpoint for manual sync
    - _Requirements: 2.2_
  - [x] 5.3 Implement automatic sync scheduler using node-cron with configurable interval (default 30 minutes)
    - _Requirements: 2.3_
  - [x] 5.4 Implement retry logic with exponential backoff (3 attempts, base delay 1s, factor 2x)
    - _Requirements: 2.5_
  - [x] 5.5 Implement sync logging: store timestamp, duration, items fetched, outcome, and error message in Sync table
    - _Requirements: 2.4, 10.1_
  - [x] 5.6 Implement failure handling: preserve last successful state on failure, notify user via API response
    - _Requirements: 2.6, 11.1_
  - [x] 5.7 Implement GET /api/sync/status and GET /api/sync/history endpoints
    - _Requirements: 2.4_
  - [x] 5.8 Write property test for sync retry bounds
    - **Property 2: Sync Retry Bounded**
    - Retry count never exceeds 3 and backoff delay follows formula baseDelay * 2^(n-1)
    - **Validates: Requirements 2.5, 11.2**
  - [x] 5.9 Write property test for last successful state preservation
    - **Property 3: Last Successful State Preservation**
    - After failed sync, task states remain unchanged from last successful sync
    - **Validates: Requirements 2.6, 11.1**

- [x] 6. Task State Inference Engine
  - [x] 6.1 Implement inference rule: "completed" when issue is closed or linked PR is merged
    - _Requirements: 3.5_
  - [x] 6.2 Implement inference rule: "blocked" when issue has label matching /block/i or dependency-indicating comment, record blocker reason
    - _Requirements: 3.6_
  - [x] 6.3 Implement inference rule: "needs review" when open PR has pending review requests
    - _Requirements: 3.4_
  - [x] 6.4 Implement inference rule: "in progress" when linked branch has recent commits (last 30 days) or open PR without review requests
    - _Requirements: 3.3_
  - [x] 6.5 Implement inference rule: "not started" when no linked branch, no commits, no assignee activity
    - _Requirements: 3.2_
  - [x] 6.6 Implement fallback rule: "uncertain" when no rule matches confidently, display available evidence
    - _Requirements: 3.7_
  - [x] 6.7 Implement evidence preservation: store evidence artifacts (URLs, SHAs, labels) for every state transition in StateTransition table
    - _Requirements: 3.8_
  - [x] 6.8 Implement GET /api/tasks and GET /api/tasks/:id/evidence endpoints
    - _Requirements: 3.1_
  - [x] 6.9 Write property test for inference completeness
    - **Property 4: Task State Inference Completeness**
    - Inference function is total — always produces exactly one TaskState for any evidence input
    - **Validates: Requirements 3.1, 3.7**
  - [x] 6.10 Write property test for evidence preservation
    - **Property 5: Evidence Preservation on State Transition**
    - Every state transition has non-empty evidence array referencing valid evidence records
    - **Validates: Requirements 3.8**

- [x] 7. Checkpoint - Sync and inference
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Launch Readiness Checklist Generator
  - [x] 8.1 Implement checklist generation with 6 fixed categories: product, quality, deployment, legal/admin, marketing, content
    - _Requirements: 4.1_
  - [x] 8.2 Implement checklist item status derivation from current task states and repository evidence
    - _Requirements: 4.2_
  - [x] 8.3 Implement blockers-first ordering: all blocker items appear before non-blocker items regardless of category
    - _Requirements: 4.3_
  - [x] 8.4 Implement "next best action" computation: highest-priority incomplete non-blocked item
    - _Requirements: 4.4_
  - [x] 8.5 Implement reactive checklist updates when task states change (within same session)
    - _Requirements: 4.5_
  - [x] 8.6 Implement GET /api/checklist and PUT /api/checklist/items/:id endpoints
    - _Requirements: 4.1, 4.2_
  - [x] 8.7 Write property test for checklist category completeness
    - **Property 6: Checklist Category Completeness**
    - Generated checklist always contains exactly 6 categories, no duplicates
    - **Validates: Requirements 4.1**
  - [x] 8.8 Write property test for blockers-first ordering
    - **Property 7: Blockers-First Ordering**
    - All blocker items appear before all non-blocker items in rendered list
    - **Validates: Requirements 4.3**

- [x] 9. Marketing Analyzer
  - [x] 9.1 Define recommended marketing asset set (landing page, social posts, changelog, screenshots, README)
    - _Requirements: 5.1, 5.2_
  - [x] 9.2 Implement GET /api/marketing/status endpoint comparing user's completed assets against recommended set
    - _Requirements: 5.1_
  - [x] 9.3 Implement suggestion logic: missing assets = recommended set minus completed set, sorted by effort (low-friction first)
    - _Requirements: 5.2, 5.4_
  - [x] 9.4 Implement channel recommendations based on product type (developer tool → Twitter/X, HackerNews; B2B → LinkedIn, ProductHunt)
    - _Requirements: 5.3_
  - [x] 9.5 Implement POST /api/marketing/assets/:id/complete endpoint that marks asset complete and updates launch checklist
    - _Requirements: 5.5_
  - [x] 9.6 Write property test for marketing asset suggestions
    - **Property 8: Marketing Asset Suggestions are Complement**
    - Suggestions always equal the set difference between recommended and completed assets
    - **Validates: Requirements 5.1**

- [~] 10. Checkpoint - Checklist and marketing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Content Generator
  - [x] 11.1 Implement POST /api/content/generate endpoint that generates a draft from recently completed tasks using LLM API with platform-specific prompts
    - _Requirements: 6.1, 6.2_
  - [x] 11.2 Implement platform tailoring: Twitter/X (≤280 chars, casual), LinkedIn (professional, 1-3 paragraphs), Blog (longer form, technical)
    - _Requirements: 6.2_
  - [x] 11.3 Implement PUT /api/content/drafts/:id endpoint for editing drafts, creating a new DraftVersion on each edit
    - _Requirements: 6.3, 6.4_
  - [x] 11.4 Implement GET /api/content/drafts endpoint with filtering by status
    - _Requirements: 6.6_
  - [x] 11.5 Implement GET /api/content/drafts/:id/versions endpoint returning version history
    - _Requirements: 6.4_
  - [x] 11.6 Write property test for version history monotonicity
    - **Property 9: Content Draft Version History Monotonicity**
    - After N edits, exactly N+1 versions exist for a draft, versions never deleted
    - **Validates: Requirements 6.4**

- [x] 12. Content Approval and Publishing Control
  - [x] 12.1 Implement POST /api/content/drafts/:id/approve endpoint that transitions draft to APPROVED status and logs the action
    - _Requirements: 7.1, 7.3_
  - [x] 12.2 Implement POST /api/content/drafts/:id/reject endpoint that moves draft to REJECTED status, preserves content, and logs the action
    - _Requirements: 7.4, 6.5_
  - [x] 12.3 Implement POST /api/content/drafts/:id/schedule endpoint (only accessible after approval) allowing user to set publish time or copy content
    - _Requirements: 7.2_
  - [x] 12.4 Implement draft lifecycle state machine enforcing valid transitions (generated → editing → pending_approval → approved → scheduled/copied; pending_approval → rejected)
    - _Requirements: 7.1, 6.6_
  - [x] 12.5 Write property test for no auto-publishing invariant
    - **Property 10: No Auto-Publishing Invariant**
    - No draft reaches SCHEDULED or COPIED status without a prior approval log entry
    - **Validates: Requirements 6.6, 7.1**
  - [x] 12.6 Write property test for rejected drafts preservation
    - **Property 11: Rejected Drafts Preserved**
    - Rejected drafts are never deleted, content always preserved
    - **Validates: Requirements 6.5, 7.4**

- [x] 13. Dashboard Aggregator
  - [x] 13.1 Implement GET /api/dashboard endpoint aggregating project status (total tasks, count by state)
    - _Requirements: 8.1_
  - [x] 13.2 Implement blockers section: query all tasks with BLOCKED state, include blocker reasons
    - _Requirements: 8.2_
  - [x] 13.3 Implement next action computation: pull highest-priority item from checklist generator
    - _Requirements: 8.3_
  - [x] 13.4 Implement recent progress section: tasks completed in last 7 days
    - _Requirements: 8.4_
  - [x] 13.5 Include last sync timestamp and status, launch readiness percentage
    - _Requirements: 8.1, 8.5_
  - [x] 13.6 Write property test for recent progress time bound
    - **Property 13: Dashboard Recent Progress Time Bound**
    - All tasks in recent progress have completedAt within last 7 days
    - **Validates: Requirements 8.4**

- [~] 14. Checkpoint - Content and dashboard
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Logging Service
  - [x] 15.1 Implement structured logging utility that writes to SystemLog table with consistent schema (category, action, details JSON, userId, timestamp)
    - _Requirements: 10.5_
  - [x] 15.2 Add sync logging: log every sync operation with timestamp, duration, outcome
    - _Requirements: 10.1_
  - [x] 15.3 Add state change logging: log every task state transition with previous/new state and evidence references
    - _Requirements: 10.2_
  - [x] 15.4 Add content action logging: log every draft generate, edit, approve, reject, schedule action
    - _Requirements: 10.3_
  - [x] 15.5 Add authentication event logging: login, logout, session expiration
    - _Requirements: 10.4_
  - [x] 15.6 Add error logging: log errors with operation context, input summary, and stack trace
    - _Requirements: 10.5_
  - [x] 15.7 Write property test for logging completeness
    - **Property 12: Logging Completeness for State Changes**
    - For every state transition, a corresponding log entry exists
    - **Validates: Requirements 10.2**

- [x] 16. Error Handling and Graceful Degradation
  - [x] 16.1 Implement global retry utility (3 attempts, exponential backoff) usable by sync service and content generator
    - _Requirements: 11.2_
  - [x] 16.2 Implement stale-data indicator: when GitHub API is unreachable, responses include staleness flag and last successful sync timestamp
    - _Requirements: 11.1_
  - [x] 16.3 Implement data preservation guarantee: wrap external service calls in transactions, rollback on failure
    - _Requirements: 11.4_
  - [x] 16.4 Implement user notification mechanism for failed operations (API response field + optional in-app notification)
    - _Requirements: 11.3_
  - [x] 16.5 Write property test for data preservation during outages
    - **Property 15: Data Preservation During Outages**
    - During simulated outages, all user data and drafts remain intact
    - **Validates: Requirements 11.4**

- [x] 17. Frontend - Core Layout and Dashboard
  - [x] 17.1 Set up React app with TypeScript, React Router, Tailwind CSS, and API client (axios/fetch wrapper with auth headers)
    - _Requirements: 8.5_
  - [x] 17.2 Implement authentication flow UI: GitHub login button, OAuth callback handler, session check on app load
    - _Requirements: 1.1, 9.1_
  - [x] 17.3 Implement Dashboard page: project status summary, blockers list, next action card, recent progress list, last sync indicator
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 17.4 Implement repository connection UI: repo selection dropdown, connect/disconnect actions
    - _Requirements: 1.2, 1.3_
  - [x] 17.5 Implement manual sync trigger button with loading state and last-synced timestamp
    - _Requirements: 2.2_

- [ ] 18. Frontend - Checklist, Marketing, and Content
  - [x] 18.1 Implement Launch Readiness Checklist page: categorized view with blockers at top, progress indicators per category
    - _Requirements: 4.1, 4.3_
  - [x] 18.2 Implement Marketing Readiness section: missing assets list, channel recommendations, mark-as-complete action
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 18.3 Implement Content Drafts page: draft list with status filters, generate new draft form (platform selector)
    - _Requirements: 6.1, 6.6_
  - [x] 18.4 Implement draft detail view: edit interface, version history sidebar, approve/reject/schedule actions
    - _Requirements: 6.3, 6.4, 7.1, 7.2_
  - [x] 18.5 Implement rejected drafts queue view for reuse/learning
    - _Requirements: 6.5, 7.4_

- [ ] 19. Input Validation, Rate Limiting, and Security Hardening
  - [-] 19.1 Add zod validation schemas for all API request bodies and query parameters
    - _Requirements: 9.1_
  - [-] 19.2 Add API rate limiting middleware (e.g., express-rate-limit)
    - _Requirements: 9.1_
  - [-] 19.3 Configure CORS with strict origin policy matching frontend domain
    - _Requirements: 9.1_
  - [-] 19.4 Add security headers (helmet middleware): X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security
    - _Requirements: 9.2_
  - [~] 19.5 Write property test for session expiration enforcement
    - **Property 14: Session Expiration Enforcement**
    - No request succeeds with session inactive > 24 hours
    - **Validates: Requirements 9.3, 9.5**

- [~] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout implementation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Tasks 1.1-1.6 and 2.1-2.6 are already completed (project setup and core auth)
- The implementation uses TypeScript throughout (Express backend + React frontend)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["2.7", "2.8"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 5, "tasks": ["3.5"] },
    { "id": 6, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 7, "tasks": ["5.4", "5.5", "5.6", "5.7"] },
    { "id": 8, "tasks": ["5.8", "5.9"] },
    { "id": 9, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6"] },
    { "id": 10, "tasks": ["6.7", "6.8"] },
    { "id": 11, "tasks": ["6.9", "6.10"] },
    { "id": 12, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 13, "tasks": ["8.7", "8.8", "9.1", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 14, "tasks": ["9.6"] },
    { "id": 15, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 16, "tasks": ["11.6", "12.1", "12.2", "12.3", "12.4"] },
    { "id": 17, "tasks": ["12.5", "12.6"] },
    { "id": 18, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5"] },
    { "id": 19, "tasks": ["13.6", "15.1"] },
    { "id": 20, "tasks": ["15.2", "15.3", "15.4", "15.5", "15.6"] },
    { "id": 21, "tasks": ["15.7", "16.1", "16.2", "16.3", "16.4"] },
    { "id": 22, "tasks": ["16.5", "17.1"] },
    { "id": 23, "tasks": ["17.2", "17.3", "17.4", "17.5"] },
    { "id": 24, "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5"] },
    { "id": 25, "tasks": ["19.1", "19.2", "19.3", "19.4"] },
    { "id": 26, "tasks": ["19.5"] }
  ]
}
```

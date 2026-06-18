# Requirements Document

## Introduction

Solo Founder Launch OS is a production-ready operating system for solo founders, freelancers, and solo business owners. It tracks product progress from a single GitHub repository, determines launch readiness, identifies missing marketing materials, and generates build-in-public content drafts. The system treats GitHub as the source of truth for development progress and never auto-publishes content without explicit user approval.

## Glossary

- **System**: The Solo Founder Launch OS application
- **User**: A solo founder, freelancer, or solo business owner using the application
- **Repository**: A single GitHub repository connected to the System as the source of truth
- **Task**: A unit of work inferred from GitHub issues, pull requests, or commits
- **Task_State**: One of: not started, in progress, blocked, needs review, completed, uncertain
- **Evidence**: The GitHub artifact (issue, PR, commit, label, or status check) used to infer a Task_State
- **Launch_Readiness_Checklist**: A generated checklist grouping work into product, quality, deployment, legal/admin, marketing, and content readiness categories
- **Blocker**: A dependency or reason preventing a Task from progressing
- **Marketing_Asset**: A recommended piece of marketing material needed for launch (e.g., landing page, social post, changelog)
- **Content_Draft**: A build-in-public social media draft generated from shipped progress
- **Sync**: The process of fetching and reconciling data from the connected GitHub Repository
- **Dashboard**: The primary user interface showing status, blockers, next actions, and recent progress

## Requirements

### Requirement 1: GitHub Repository Connection

**User Story:** As a solo founder, I want to connect my GitHub repository to the system, so that my development progress is automatically tracked.

#### Acceptance Criteria

1. WHEN the User authenticates with GitHub, THE System SHALL establish a secure OAuth connection and store the access token using encrypted session handling.
2. WHEN the User selects a Repository, THE System SHALL store the Repository reference and initiate the first Sync.
3. THE System SHALL support connecting exactly one Repository per User account in the first release.
4. IF the GitHub OAuth flow fails, THEN THE System SHALL display a descriptive error message and allow the User to retry.

### Requirement 2: Repository Sync

**User Story:** As a solo founder, I want the system to sync with my GitHub repository, so that my task progress stays current.

#### Acceptance Criteria

1. WHEN a Sync is triggered, THE System SHALL fetch open issues, pull requests, commits, labels, and status checks from the connected Repository.
2. THE System SHALL allow the User to trigger a manual Sync at any time.
3. THE System SHALL perform automatic Syncs at a configurable interval with a default of every 30 minutes.
4. THE System SHALL log the timestamp, status, and result of every Sync operation.
5. IF a Sync fails due to a GitHub API error, THEN THE System SHALL retry up to 3 times with exponential backoff before marking the Sync as failed.
6. IF a Sync fails after all retries, THEN THE System SHALL display a notification to the User and preserve the last successful Sync state.

### Requirement 3: Task State Inference

**User Story:** As a solo founder, I want the system to infer the state of my tasks from GitHub activity, so that I do not have to manually update task status.

#### Acceptance Criteria

1. WHEN a Sync completes, THE System SHALL infer the Task_State for each Task based on GitHub Evidence.
2. THE System SHALL assign the Task_State "not started" when an issue has no linked branch, no commits, and no assignee activity.
3. THE System SHALL assign the Task_State "in progress" when an issue has a linked branch with recent commits or an open pull request.
4. THE System SHALL assign the Task_State "needs review" when an issue has an open pull request with review requests pending.
5. THE System SHALL assign the Task_State "completed" when an issue is closed or a linked pull request is merged.
6. THE System SHALL assign the Task_State "blocked" when an issue has a label containing "blocked" or a comment indicating a dependency, and THE System SHALL record the Blocker reason.
7. IF the System cannot confidently determine the Task_State, THEN THE System SHALL assign the state "uncertain" and display the available Evidence to the User.
8. THE System SHALL preserve the Evidence used to infer each Task_State transition.

### Requirement 4: Launch Readiness Checklist

**User Story:** As a solo founder, I want to see a launch-readiness checklist based on my current project state, so that I know what remains before I can launch.

#### Acceptance Criteria

1. WHEN the User views the Launch_Readiness_Checklist, THE System SHALL generate checklist items grouped into: product, quality, deployment, legal/admin, marketing, and content readiness categories.
2. THE System SHALL derive checklist item status from the current Task_States and Repository Evidence.
3. THE System SHALL display Blockers at the top of the Launch_Readiness_Checklist before all other items.
4. THE System SHALL highlight the next best action the User should take toward launch readiness.
5. WHEN a Task_State changes, THE System SHALL update the corresponding Launch_Readiness_Checklist items within the same session.

### Requirement 5: Marketing Asset Identification

**User Story:** As a solo founder, I want the system to identify missing marketing materials, so that I can prepare everything needed for launch.

#### Acceptance Criteria

1. WHEN the User views the marketing readiness section, THE System SHALL compare existing Marketing_Assets against a recommended set for the current project stage.
2. THE System SHALL suggest Marketing_Assets that are missing for launch, including landing page copy, social announcement posts, changelog, and product screenshots.
3. THE System SHALL recommend marketing channels that fit the product type and current stage.
4. THE System SHALL prioritize low-friction marketing actions suitable for a solo founder.
5. WHEN a Marketing_Asset is marked as completed by the User, THE System SHALL update the Launch_Readiness_Checklist accordingly.

### Requirement 6: Build-in-Public Content Generation

**User Story:** As a solo founder, I want to generate build-in-public content drafts from my shipped progress, so that I can share updates without spending time writing from scratch.

#### Acceptance Criteria

1. WHEN the User requests a Content_Draft, THE System SHALL generate a draft based on recently completed Tasks and their Evidence.
2. THE System SHALL tailor the Content_Draft to the platform selected by the User (e.g., Twitter/X, LinkedIn, blog post).
3. THE System SHALL allow the User to edit a Content_Draft before approval.
4. THE System SHALL preserve version history for each Content_Draft edit.
5. THE System SHALL preserve rejected Content_Drafts for future reuse or learning.
6. THE System SHALL display Content_Drafts in a review queue requiring explicit User approval before any scheduling or publishing action.

### Requirement 7: Content Approval and Publishing Control

**User Story:** As a solo founder, I want full control over when and where my content is published, so that nothing goes live without my explicit approval.

#### Acceptance Criteria

1. THE System SHALL require explicit User approval before scheduling or publishing any Content_Draft.
2. WHEN the User approves a Content_Draft, THE System SHALL allow the User to schedule a publish time or copy the content for manual posting.
3. THE System SHALL log every approval, rejection, and scheduling action with a timestamp.
4. IF the User rejects a Content_Draft, THEN THE System SHALL move the draft to a rejected queue and retain the draft content.

### Requirement 8: Dashboard

**User Story:** As a solo founder, I want a simple, action-oriented dashboard, so that I can quickly see what to do next.

#### Acceptance Criteria

1. THE Dashboard SHALL display the current overall project status derived from Task_States.
2. THE Dashboard SHALL display active Blockers with their associated reasons.
3. THE Dashboard SHALL display the next recommended action toward launch readiness.
4. THE Dashboard SHALL display recent shipping progress based on the last 7 days of completed Tasks.
5. THE Dashboard SHALL present information without clutter, avoiding unnecessary settings or configuration options in the first release.

### Requirement 9: Authentication and Security

**User Story:** As a solo founder, I want secure authentication and session handling, so that my data and GitHub connection remain protected.

#### Acceptance Criteria

1. THE System SHALL authenticate Users using a secure method (OAuth or email-based authentication with strong password requirements).
2. THE System SHALL manage sessions with secure, HTTP-only, encrypted tokens.
3. THE System SHALL invalidate sessions after 24 hours of inactivity.
4. THE System SHALL encrypt stored GitHub access tokens at rest.
5. IF a session token is invalid or expired, THEN THE System SHALL redirect the User to the login flow.

### Requirement 10: Logging and Observability

**User Story:** As a solo founder, I want the system to log important events, so that I can troubleshoot issues and audit actions.

#### Acceptance Criteria

1. THE System SHALL log all Sync operations including timestamp, duration, and outcome.
2. THE System SHALL log all Task_State changes including the previous state, new state, and Evidence.
3. THE System SHALL log all Content_Draft approval, rejection, and scheduling actions.
4. THE System SHALL log all authentication events including login, logout, and session expiration.
5. IF an error occurs during any operation, THEN THE System SHALL log the error with context sufficient for debugging.

### Requirement 11: Error Handling and Graceful Degradation

**User Story:** As a solo founder, I want the system to handle failures gracefully, so that temporary issues do not lose my data or block my workflow.

#### Acceptance Criteria

1. IF the GitHub API is unreachable, THEN THE System SHALL display the last known state and notify the User that data may be stale.
2. IF an external service call fails, THEN THE System SHALL retry the operation up to 3 times with exponential backoff.
3. IF all retries are exhausted, THEN THE System SHALL log the failure and present a clear error message to the User.
4. THE System SHALL preserve all User data and drafts during external service outages.

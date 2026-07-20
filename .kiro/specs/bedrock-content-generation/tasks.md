# Implementation Plan: Bedrock Content Generation

## Overview

Replace the OpenAI-based `callLLM` function with Amazon Bedrock's InvokeModel API using `@aws-sdk/client-bedrock-runtime`. The implementation creates a new `lib/bedrock.ts` singleton module, enriches prompts with evidence context from PR descriptions and commit messages, adds error classification with retry logic for transient failures, and updates IAM permissions for the ECS task role.

## Tasks

- [x] 1. Install dependencies and set up Bedrock client module
  - [x] 1.1 Install `@aws-sdk/client-bedrock-runtime` dependency
    - Run `npm install @aws-sdk/client-bedrock-runtime` in the `packages/api` directory
    - Verify the package is added to `packages/api/package.json` dependencies
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 Create `packages/api/src/lib/bedrock.ts` with singleton client and configuration
    - Define `BedrockConfig` interface with `modelId`, `region`, `enabled` fields
    - Define `InferenceParams` interface and `PLATFORM_MAX_TOKENS` record (TWITTER: 300, LINKEDIN: 1024, BLOG: 2048)
    - Read `BEDROCK_MODEL_ID` (default: `amazon.nova-pro-v1:0`), `BEDROCK_REGION` (default: `us-east-1`), `BEDROCK_ENABLED` from `process.env` at module load
    - Create `BedrockRuntimeClient` singleton (skip if disabled)
    - Export `isBedrockEnabled()` and `getBedrockConfig()` functions
    - Use `.js` extension in imports; import Platform from `../generated/prisma/enums.js`
    - _Requirements: 1.1, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1_

  - [x] 1.3 Implement `callBedrock` function with InvokeModel call and response extraction
    - Build the messages-format request body with system prompt, user prompt, temperature 0.7, and platform-specific maxTokens
    - Call `InvokeModelCommand` on the singleton client
    - Extract and trim text content from response body
    - Throw error if response body is empty or contains no text
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.4 Implement error classification and retry logic in `callBedrock`
    - Create `classifyBedrockError` function mapping SDK error names to `throttling | model_unavailable | validation | other`
    - Wrap throttling errors with `withRetry` from `../lib/retry.js` (maxAttempts: 3, baseDelayMs: 1000, factor: 2)
    - Map classified errors to AppError factories: throttling→`serviceUnavailable`, model_unavailable→`serviceUnavailable`, validation→`badRequest`, other→`internalError`
    - Log failures via logger with category `content`, action `bedrock_invocation_failed`, including error type, model ID, platform but excluding prompts and tokens
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 2. Enhance prompt builder with evidence context
  - [x] 2.1 Add `EvidenceItem` interface and update `TaskSummary` in `content-prompts.ts`
    - Add `EvidenceItem` interface with `type: 'PR' | 'COMMIT'` and `content: string`
    - Add optional `evidenceItems?: EvidenceItem[]` field to `TaskSummary` interface
    - Ensure backward compatibility with existing `evidence?: string` field
    - _Requirements: 4.1, 4.2_

  - [x] 2.2 Update `buildPrompt` to render evidence items under each task entry
    - When `evidenceItems` is present and non-empty, render each item under the task line
    - Format: `  PR: {description}` or `  Commit: {message}`
    - If `evidenceItems` is empty or undefined, fall back to existing `evidence` field behavior
    - _Requirements: 4.1, 4.2, 4.4, 7.4_

  - [x] 2.3 Write property test for evidence appearing in built prompt (Property 6)
    - **Property 6: Evidence items appear in built prompt for completed tasks**
    - Generate random tasks with PR and COMMIT evidence items; assert descriptions/messages appear in the user prompt output
    - **Validates: Requirements 4.1, 4.2**

  - [x] 2.4 Write property test for evidence truncation (Property 8)
    - **Property 8: Evidence content is truncated to platform-safe limits**
    - Generate PR descriptions of length 0–5000 and commit messages of length 0–5000; assert output never exceeds 500 chars for PR or 200 chars for commits
    - **Validates: Requirements 4.5**

- [x] 3. Update content service with evidence fetching and Bedrock integration
  - [x] 3.1 Add evidence fetching logic to `generateDraft` in `content.ts`
    - For each completed task, query Evidence records with type PR or COMMIT, ordered by `fetchedAt` desc, limit 10
    - Extract `description` from PR metadata and `message` from COMMIT metadata
    - Skip records with malformed metadata (missing expected key)
    - Truncate PR descriptions to 500 chars, commit messages to 200 chars
    - Build enriched `TaskSummary` objects with `evidenceItems` array
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x] 3.2 Replace `callLLM` with `callBedrock` and implement fallback logic
    - Import `callBedrock` and `isBedrockEnabled` from `../lib/bedrock.js`
    - If `isBedrockEnabled()` returns false, use template fallback directly
    - If enabled, call `callBedrock(system, user, platform)` with proper try/catch
    - On credentials error, fall back to template and log warning with category `content`, action `bedrock_credentials_error`
    - Preserve existing draft creation and version logic unchanged
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 7.1, 7.2, 7.5_

  - [x] 3.3 Write property test for evidence count cap (Property 7)
    - **Property 7: Evidence count is capped at 10 per task**
    - Generate tasks with 1–50 evidence records; assert exactly 10 most recent (by fetchedAt) are included
    - **Validates: Requirements 4.3**

  - [x] 3.4 Write property test for malformed evidence metadata (Property 9)
    - **Property 9: Malformed evidence metadata is skipped without affecting other records**
    - Generate evidence arrays mixing valid and invalid metadata shapes; assert invalid are excluded and valid are included
    - **Validates: Requirements 4.6**

- [x] 4. Checkpoint — Ensure core integration compiles and passes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Bedrock module property tests
  - [x] 5.1 Write property test for request body construction (Property 1)
    - **Property 1: Request body construction preserves prompts and applies platform-specific parameters**
    - Generate random platforms and prompt strings; assert messages structure contains both prompts, temperature=0.7, and correct maxTokens per platform
    - **Validates: Requirements 1.1, 1.5**

  - [x] 5.2 Write property test for response extraction (Property 2)
    - **Property 2: Response extraction always returns trimmed content**
    - Generate random strings with varying whitespace padding; assert extracted text equals `content.trim()`
    - **Validates: Requirements 1.3**

  - [x] 5.3 Write property test for configuration resolution (Property 3)
    - **Property 3: Configuration resolution uses environment values with correct defaults**
    - Generate random env var values including empty/undefined; assert config resolves to expected values with `amazon.nova-pro-v1:0` and `us-east-1` defaults
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x] 5.4 Write property test for feature flag (Property 4)
    - **Property 4: Feature flag disables Bedrock for all case variations of "false"**
    - Generate random case variations of "false"; assert `isBedrockEnabled()` returns false and template fallback is used
    - **Validates: Requirements 3.1**

  - [x] 5.5 Write property test for template fallback (Property 5)
    - **Property 5: Template fallback output contains required structural elements**
    - Generate random user prompt strings; assert output contains emoji, intro line, prompt content verbatim, and `#buildinpublic` hashtag
    - **Validates: Requirements 3.4**

  - [x] 5.6 Write property test for log safety (Property 10)
    - **Property 10: Failure logs never contain prompt content or access tokens**
    - Generate random errors with random prompt content and token patterns; assert logged details exclude prompts and tokens
    - **Validates: Requirements 5.5**

- [x] 6. Write unit tests for error handling scenarios
  - [x] 6.1 Write unit tests for Bedrock error classification and retry behavior
    - Test ThrottlingException → retry → success
    - Test ThrottlingException → 3 failures → serviceUnavailable with retryable: true
    - Test ModelNotReadyException → immediate serviceUnavailable (no retry)
    - Test ValidationException → immediate badRequest
    - Test AccessDeniedException → serviceUnavailable
    - Test unknown exception → internalError
    - Test credentials error → fallback + log warning
    - Test empty response body → error raised
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 6.2 Write integration tests for content generation endpoint
    - Test POST /api/content/generate → 201 with Bedrock mock returning content
    - Test POST /api/content/generate with Bedrock failure → error response with retryable flag
    - Test evidence enrichment end-to-end (tasks with evidence produce richer prompts)
    - Mock Bedrock SDK — never make real AWS calls
    - _Requirements: 7.1, 7.2, 7.5, 7.6_

- [x] 7. Update IAM permissions and environment configuration
  - [x] 7.1 Add Bedrock InvokeModel permission to `deploy-permissions.json`
    - Add a new statement with Sid `BedrockInvokeModel`, Effect `Allow`, Action `bedrock:InvokeModel`, Resource `arn:aws:bedrock:us-east-1::foundation-model/*`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.2 Add Bedrock environment variables to `.env.example` files
    - Add `BEDROCK_MODEL_ID`, `BEDROCK_REGION`, `BEDROCK_ENABLED` entries with comments to `packages/api/.env.example` and `docker/.env.example`
    - _Requirements: 2.1, 2.3, 3.1_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific error scenarios and edge cases
- All tests mock the Bedrock SDK — no real AWS calls in CI
- The existing `callLLM` function can be kept temporarily for reference but should be deprecated once Bedrock is wired in

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "7.1", "7.2"] },
    { "id": 2, "tasks": ["1.3", "2.2"] },
    { "id": 3, "tasks": ["1.4", "2.3", "2.4"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 6, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 7, "tasks": ["6.1", "6.2"] }
  ]
}
```

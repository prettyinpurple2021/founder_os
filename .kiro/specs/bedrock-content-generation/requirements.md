# Requirements Document

## Introduction

This feature replaces the existing OpenAI-based content generation in Solo Founder Launch OS with Amazon Bedrock's InvokeModel API. The system will use Amazon Nova Pro as the default foundation model to generate build-in-public content drafts (Twitter, LinkedIn, Blog) from recently completed tasks. The integration leverages the existing ECS task role for authentication (no API keys), enriches prompts with PR descriptions and commit messages for higher-quality output, and maintains the existing content draft lifecycle and approval flow.

## Glossary

- **Bedrock_Client**: The AWS SDK Bedrock Runtime client responsible for invoking foundation models via the InvokeModel API
- **Content_Service**: The service module (`packages/api/src/services/content.ts`) that orchestrates content draft generation, editing, and lifecycle management
- **Prompt_Builder**: The module (`packages/api/src/services/content-prompts.ts`) that constructs platform-specific system and user prompts for LLM consumption
- **Evidence_Context**: PR descriptions, commit messages, and other development artifacts associated with completed tasks, used to enrich content generation prompts
- **Foundation_Model**: An Amazon Bedrock foundation model identified by a model ID (e.g., `amazon.nova-pro-v1:0`) used to generate content
- **Template_Fallback**: A simple template-based content generation path used when Bedrock is unavailable or unconfigured in local development
- **Retry_Utility**: The existing `withRetry` function in `packages/api/src/lib/retry.ts` providing exponential backoff for transient failures
- **ECS_Task_Role**: The IAM role attached to the ECS Fargate task that provides AWS credentials to the application without explicit API keys

## Requirements

### Requirement 1: Bedrock Model Invocation

**User Story:** As a solo founder, I want content to be generated using Amazon Bedrock so that I can leverage AWS-native AI capabilities without managing separate API keys.

#### Acceptance Criteria

1. WHEN a content generation request is received, THE Bedrock_Client SHALL invoke the Foundation_Model (amazon.nova-pro-v1:0) using the AWS SDK BedrockRuntime InvokeModel API with the messages-format request body containing the system prompt and user prompt
2. THE Bedrock_Client SHALL authenticate using IAM credentials provided by the ECS_Task_Role without requiring explicit API keys or secrets in environment variables or configuration files
3. WHEN the Foundation_Model returns a response in the current request, THE Content_Service SHALL extract the generated text content from the response body and return it as a trimmed string; the system SHALL NOT use cached or previously returned content
4. IF the Foundation_Model response contains no text content or an empty body, THEN THE Content_Service SHALL raise an error indicating that content generation produced no output
5. THE Content_Service SHALL set inference parameters including a temperature of 0.7 and a maximum token limit of 300 for TWITTER, 1024 for LINKEDIN, and 2048 for BLOG platform requests
6. IF the Bedrock InvokeModel API call fails or times out within 30 seconds, THEN THE Content_Service SHALL raise a retryable error indicating that the model invocation failed

### Requirement 2: Configurable Model Selection

**User Story:** As a solo founder, I want to configure which Bedrock model is used for content generation so that I can switch models without code changes.

#### Acceptance Criteria

1. THE Content_Service SHALL read the model ID from the `BEDROCK_MODEL_ID` environment variable at service startup and use that value for all subsequent Bedrock API calls; changes to the environment variable after startup SHALL NOT affect the running service
2. IF the `BEDROCK_MODEL_ID` environment variable is not set or is an empty string, THEN THE Content_Service SHALL use `amazon.nova-pro-v1:0` as the model ID
3. THE Content_Service SHALL read the AWS region from the `BEDROCK_REGION` environment variable at service startup and use that value when initializing the Bedrock client; changes to the environment variable after startup SHALL NOT affect the running service
4. IF the `BEDROCK_REGION` environment variable is not set or is an empty string, THEN THE Content_Service SHALL use `us-east-1` as the region
5. IF the configured model ID is rejected by the Bedrock API at generation time, THEN THE Content_Service SHALL return an error indicating the model is unavailable without exposing internal API details

### Requirement 3: Template Fallback for Local Development

**User Story:** As a developer, I want content generation to fall back to templates when Bedrock is unavailable so that I can develop and test locally without AWS credentials.

#### Acceptance Criteria

1. WHEN the `BEDROCK_ENABLED` environment variable is set to `false` (case-insensitive), THE Content_Service SHALL use the Template_Fallback for all content generation requests without attempting to initialize or invoke the Bedrock_Client
2. WHEN the `BEDROCK_ENABLED` environment variable is not set, THE Content_Service SHALL attempt to initialize the Bedrock_Client and, IF initialization fails, THEN THE Content_Service SHALL use the Template_Fallback for the current request and log a warning via the logger with category `content` and action `bedrock_fallback`
3. IF the Bedrock_Client throws a credentials error during invocation (e.g., missing or expired IAM credentials), THEN THE Content_Service SHALL both fall back to the Template_Fallback AND log a warning via the logger with category `content`, action `bedrock_credentials_error`, and details including the error type; if logging fails, the fallback SHALL still proceed to prioritize content generation availability
4. THE Template_Fallback SHALL return a string containing: an emoji header line, a descriptive intro line, the user prompt content representing shipped tasks, and trailing hashtags, matching the structure of the existing `generateTemplateFallback` function output
5. WHEN the `BEDROCK_ENABLED` environment variable is set to `true` (case-insensitive) and Bedrock_Client initialization succeeds, THE Content_Service SHALL use the Bedrock_Client for content generation without falling back to the Template_Fallback

### Requirement 4: Evidence Context Enrichment

**User Story:** As a solo founder, I want content drafts to include context from PR descriptions and commit messages so that the generated content is richer and more specific about what was shipped.

#### Acceptance Criteria

1. WHEN building prompts for content generation, THE Prompt_Builder SHALL include PR descriptions extracted from the `metadata` JSON field of Evidence records with type PR linked to each completed task, appended under the task entry in the user prompt; only Evidence linked to completed tasks SHALL be included
2. WHEN building prompts for content generation, THE Prompt_Builder SHALL include commit messages extracted from the `metadata` JSON field of Evidence records with type COMMIT linked to each completed task, appended under the task entry in the user prompt; only Evidence records specifically of type COMMIT SHALL be used for commit messages
3. THE Prompt_Builder SHALL include a maximum of 10 Evidence records per task, ordered by `fetchedAt` descending, selecting the most recent PR and COMMIT records
4. IF a completed task has no associated Evidence records with type PR or COMMIT, THEN THE Prompt_Builder SHALL use only the task title and completion date as context for that task
5. THE Prompt_Builder SHALL truncate individual PR descriptions to 500 characters and individual commit messages to 200 characters to prevent exceeding model input limits
6. IF the `metadata` JSON field of an Evidence record does not contain the expected key (description for type PR, message for type COMMIT), THEN THE Prompt_Builder SHALL skip that Evidence record and continue processing remaining records

### Requirement 5: Bedrock Error Handling and Retry

**User Story:** As a solo founder, I want content generation to handle Bedrock errors gracefully so that transient failures do not disrupt my workflow.

#### Acceptance Criteria

1. IF the Bedrock_Client receives a throttling error (ThrottlingException or TooManyRequestsException), THEN THE Content_Service SHALL retry the request using the Retry_Utility with exponential backoff using a maximum of 3 attempts, a base delay of 1000 milliseconds, and a backoff factor of 2
2. IF the Bedrock_Client receives a model-not-available error (ModelNotReadyException or ModelTimeoutException), THEN THE Content_Service SHALL return a service-unavailable error with a message indicating which model is unavailable and that the request can be retried later
3. IF the Bedrock_Client receives a validation error (ValidationException), THEN THE Content_Service SHALL return a bad-request error indicating the prompt could not be processed
4. IF all 3 retry attempts are exhausted for a throttling error, THEN THE Content_Service SHALL return a service-unavailable error indicating temporary capacity limits with the retryable flag set to true
5. THE Content_Service SHALL log all Bedrock invocation failures via the logger with category "content", action "bedrock_invocation_failed", and details including error type, model ID, and platform, but SHALL exclude prompt content and access tokens from the log details
6. IF the Bedrock_Client receives an error not classified as throttling, model-not-available, or validation (e.g., AccessDeniedException, InternalServerException, or any other unrecognized exception), THEN THE Content_Service SHALL return an internal-error with a message indicating content generation failed and SHALL NOT retry the request

### Requirement 6: IAM Permission Configuration

**User Story:** As a solo founder deploying on ECS, I want the task role to have the correct Bedrock permissions so that the application can invoke models without manual credential management.

#### Acceptance Criteria

1. THE ECS_Task_Role SHALL include an Allow policy statement granting the `bedrock:InvokeModel` action on the resource ARN `arn:aws:bedrock:{deployment_region}::foundation-model/*`, where `{deployment_region}` is the region defined in the environment configuration
2. THE ECS_Task_Role Bedrock policy statement SHALL grant `bedrock:InvokeModel` as the sole action, with no other Bedrock API actions included
3. THE ECS_Task_Role Bedrock policy statement SHALL use a wildcard (`*`) for the model ID segment of the resource ARN to permit invocation of any foundation model configurable at runtime via the `BEDROCK_MODEL_ID` environment variable
4. IF the ECS task receives an AccessDeniedException from Bedrock due to a missing or misconfigured policy, THEN THE Content_Service SHALL return an appropriate error based on the specific failure context: service-unavailable when permissions are not configured, or the error type matching the Bedrock error classification from Requirement 5

### Requirement 7: Backward Compatibility

**User Story:** As a solo founder, I want the Bedrock integration to preserve the existing content draft lifecycle so that my approval workflow continues to work unchanged.

#### Acceptance Criteria

1. WHEN a draft is successfully generated via Bedrock, THE Content_Service SHALL create a ContentDraft record with status GENERATED, a currentContent field containing the generated text, and createdAt and updatedAt timestamps that are identical at creation time
2. WHEN a draft is successfully generated via Bedrock, THE Content_Service SHALL create an initial DraftVersion record with version number 1 and content matching the draft's currentContent
3. WHEN a draft is generated via Bedrock, THE Content_Service SHALL enforce the state transitions: GENERATED → EDITING or PENDING_APPROVAL, EDITING → EDITING or PENDING_APPROVAL, PENDING_APPROVAL → APPROVED or REJECTED, APPROVED → SCHEDULED or COPIED
4. THE Content_Service SHALL pass the platform-specific prompt structure (system prompt, user prompt, tone, and constraints) from the Prompt_Builder to the Bedrock integration in the same format previously used for the OpenAI integration
5. THE Content_Service SHALL maintain the existing POST /api/content/generate endpoint accepting request body { platform: 'TWITTER' | 'LINKEDIN' | 'BLOG', timeRangeDays?: number } with timeRangeDays defaulting to 7, returning HTTP 201 with a response containing fields: id, userId, platform, status, currentContent, createdAt, updatedAt, and versions array
6. IF the Bedrock content generation call fails, THEN THE Content_Service SHALL return an error response with a retryable flag and an error message indicating generation failure, without exposing provider-specific details

/**
 * Bedrock Runtime Client Module
 *
 * Singleton module encapsulating all Amazon Bedrock Runtime SDK interaction.
 * Reads configuration from environment variables at module load, creates a
 * BedrockRuntimeClient singleton, and exposes platform-specific inference params.
 *
 * Requirements: 1.1, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Platform } from '../generated/prisma/enums.js';
import { badRequest, internalError, serviceUnavailable } from '../errors/AppError.js';
import { withRetry } from './retry.js';
import { log } from '../services/logger.js';

// --- Interfaces ---

/** Configuration read once at module load */
export interface BedrockConfig {
  modelId: string;
  region: string;
  enabled: boolean;
}

/** Platform-specific inference parameters */
export interface InferenceParams {
  temperature: number;
  maxTokens: number;
}

// --- Constants ---

/** Maximum token limits per platform */
export const PLATFORM_MAX_TOKENS: Record<Platform, number> = {
  TWITTER: 300,
  LINKEDIN: 1024,
  BLOG: 2048,
};

// --- Error Classification ---

/** Classification categories for Bedrock SDK errors */
export type BedrockErrorClass = 'throttling' | 'model_unavailable' | 'validation' | 'other';

/**
 * Classifies a Bedrock SDK error based on its name property.
 * Used to determine retry behavior and error response mapping.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.6
 */
export function classifyBedrockError(error: unknown): BedrockErrorClass {
  if (error instanceof Error && 'name' in error) {
    switch (error.name) {
      case 'ThrottlingException':
      case 'TooManyRequestsException':
        return 'throttling';
      case 'ModelNotReadyException':
      case 'ModelTimeoutException':
        return 'model_unavailable';
      case 'ValidationException':
        return 'validation';
      default:
        return 'other';
    }
  }
  return 'other';
}

// --- Module-level initialization ---

/**
 * Resolves configuration from environment variables at module load.
 * Values are read once and cached for the lifetime of the process.
 */
function resolveConfig(): BedrockConfig {
  const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0';
  const region = process.env.BEDROCK_REGION || 'us-east-1';

  const enabledEnv = process.env.BEDROCK_ENABLED;
  const enabled = enabledEnv?.toLowerCase() !== 'false';

  return { modelId, region, enabled };
}

const config: BedrockConfig = resolveConfig();

/**
 * Singleton BedrockRuntimeClient instance.
 * Created only when Bedrock is enabled to avoid unnecessary SDK initialization.
 */
let client: BedrockRuntimeClient | null = null;

if (config.enabled) {
  client = new BedrockRuntimeClient({ region: config.region });
}

// --- Exported functions ---

/**
 * Returns whether Bedrock is enabled based on configuration.
 * Used by the content service to decide between Bedrock and template fallback.
 */
export function isBedrockEnabled(): boolean {
  return config.enabled;
}

/**
 * Returns the loaded Bedrock configuration.
 * Used for logging and diagnostics; never exposes credentials.
 */
export function getBedrockConfig(): BedrockConfig {
  return config;
}

/**
 * Returns the singleton BedrockRuntimeClient instance.
 * Returns null if Bedrock is disabled.
 *
 * @internal Used by callBedrock
 */
export function getClient(): BedrockRuntimeClient | null {
  return client;
}

/**
 * Invokes the configured Bedrock foundation model with the given prompts.
 * Builds a messages-format request body, calls InvokeModel, and extracts
 * the trimmed text content from the response.
 *
 * Handles error classification and retry logic:
 * - Throttling errors are retried up to 3 times with exponential backoff
 * - Model unavailable errors return immediate serviceUnavailable
 * - Validation errors return immediate badRequest
 * - Other errors return immediate internalError
 *
 * Logs all failures with category 'content', action 'bedrock_invocation_failed',
 * including error type, model ID, and platform. Never logs prompts or tokens.
 *
 * @throws AppError (serviceUnavailable) if the Bedrock client is not available
 * @throws AppError (serviceUnavailable) if throttling retries are exhausted or model is unavailable
 * @throws AppError (badRequest) if the request fails validation
 * @throws AppError (internalError) if the response body is empty or an unknown error occurs
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export async function callBedrock(
  systemPrompt: string,
  userPrompt: string,
  platform: Platform,
): Promise<string> {
  const bedrockClient = getClient();
  if (!bedrockClient) {
    throw serviceUnavailable('Bedrock client is not available');
  }

  const requestBody = {
    messages: [
      { role: 'user', content: [{ text: userPrompt }] },
    ],
    system: [{ text: systemPrompt }],
    inferenceConfig: {
      temperature: 0.7,
      maxTokens: PLATFORM_MAX_TOKENS[platform],
    },
  };

  const command = new InvokeModelCommand({
    modelId: config.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody),
  });

  const sendFn = async () => bedrockClient.send(command);

  try {
    const response = await withRetry(sendFn, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      factor: 2,
      isRetryable: (err: Error) => classifyBedrockError(err) === 'throttling',
    });

    if (!response.body) {
      throw internalError('Content generation produced no output');
    }

    const responseText = new TextDecoder().decode(response.body);
    const responseJson = JSON.parse(responseText) as {
      output?: { message?: { content?: Array<{ text?: string }> } };
    };

    const text = responseJson.output?.message?.content?.[0]?.text;
    if (!text) {
      throw internalError('Content generation produced no output');
    }

    return text.trim();
  } catch (error: unknown) {
    const errorClass = classifyBedrockError(error);
    const errorType = error instanceof Error ? error.name : 'UnknownError';

    // Log failure — never include prompts or tokens
    await log({
      category: 'content',
      action: 'bedrock_invocation_failed',
      details: {
        errorType,
        modelId: config.modelId,
        platform,
      },
    });

    // If it's already an AppError (e.g., from "no output" checks above), re-throw
    if (error instanceof Error && error.name === 'AppError') {
      throw error;
    }

    switch (errorClass) {
      case 'throttling':
        throw serviceUnavailable(
          'Content generation temporarily unavailable due to capacity limits. Please try again later.',
        );
      case 'model_unavailable':
        throw serviceUnavailable(
          `Model ${config.modelId} is currently unavailable. Please try again later.`,
        );
      case 'validation':
        throw badRequest('The prompt could not be processed by the content generation model.');
      default:
        throw internalError('Content generation failed.');
    }
  }
}

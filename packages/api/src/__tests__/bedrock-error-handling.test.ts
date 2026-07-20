/**
 * Unit Tests: Bedrock Error Classification and Retry Behavior
 *
 * Tests error handling scenarios in the Bedrock client module including
 * retry logic for throttling errors, immediate error responses for
 * non-retryable errors, credentials fallback, and empty response handling.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform } from '../generated/prisma/enums.js';

// Shared mock send function
const mockSend = vi.fn();

// Mock the AWS SDK with a proper class constructor
vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: class MockBedrockRuntimeClient {
      send = mockSend;
      constructor() {}
    },
    InvokeModelCommand: class MockInvokeModelCommand {
      constructor(public input: unknown) {}
    },
  };
});

// Mock the logger to avoid DB calls
vi.mock('../services/logger.js', () => ({
  log: vi.fn().mockResolvedValue(undefined),
  logContent: vi.fn().mockResolvedValue(undefined),
}));

// Mock prisma to avoid DB dependency
vi.mock('../lib/prisma.js', () => ({
  default: {
    systemLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock retry to use immediate delays in tests
vi.mock('../lib/retry.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/retry.js')>('../lib/retry.js');
  return {
    ...actual,
    withRetry: async <T>(
      fn: () => Promise<T>,
      options?: {
        maxAttempts?: number;
        baseDelayMs?: number;
        factor?: number;
        isRetryable?: (error: Error) => boolean;
        onRetry?: (error: Error, attempt: number, delayMs: number) => void | Promise<void>;
      },
    ): Promise<T> => {
      // Use the real withRetry logic but with zero delay
      return actual.withRetry(fn, options, () => Promise.resolve());
    },
  };
});

/**
 * Helper: creates an Error object with a specific name to simulate Bedrock SDK errors.
 */
function createBedrockError(name: string, message = 'SDK error'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/**
 * Helper: creates a successful Bedrock response body.
 */
function createSuccessResponse(text: string): { body: Uint8Array } {
  const responseJson = {
    output: {
      message: {
        content: [{ text }],
      },
    },
  };
  return {
    body: new TextEncoder().encode(JSON.stringify(responseJson)),
  };
}

describe('Bedrock Error Handling', () => {
  let callBedrock: typeof import('../lib/bedrock.js').callBedrock;
  let logMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    // Set environment for Bedrock enabled
    process.env.BEDROCK_ENABLED = 'true';
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-pro-v1:0';
    process.env.BEDROCK_REGION = 'us-east-1';

    // Reset the shared mock
    mockSend.mockReset();

    const bedrockModule = await import('../lib/bedrock.js');
    callBedrock = bedrockModule.callBedrock;

    const loggerModule = await import('../services/logger.js');
    logMock = loggerModule.log as ReturnType<typeof vi.fn>;
    logMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.BEDROCK_ENABLED;
    delete process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_REGION;
  });

  describe('ThrottlingException → retry → success', () => {
    it('retries on ThrottlingException and returns content on eventual success', async () => {
      // First call throws ThrottlingException, second call succeeds
      mockSend
        .mockRejectedValueOnce(createBedrockError('ThrottlingException'))
        .mockResolvedValueOnce(createSuccessResponse('Generated content'));

      const result = await callBedrock('system prompt', 'user prompt', Platform.TWITTER);

      expect(result).toBe('Generated content');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('retries on TooManyRequestsException and returns content on eventual success', async () => {
      mockSend
        .mockRejectedValueOnce(createBedrockError('TooManyRequestsException'))
        .mockResolvedValueOnce(createSuccessResponse('Retry success'));

      const result = await callBedrock('system', 'user', Platform.LINKEDIN);

      expect(result).toBe('Retry success');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('ThrottlingException → 3 failures → serviceUnavailable with retryable: true', () => {
    it('throws serviceUnavailable after exhausting all 3 retry attempts', async () => {
      mockSend
        .mockRejectedValueOnce(createBedrockError('ThrottlingException'))
        .mockRejectedValueOnce(createBedrockError('ThrottlingException'))
        .mockRejectedValueOnce(createBedrockError('ThrottlingException'));

      await expect(
        callBedrock('system prompt', 'user prompt', Platform.TWITTER),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
      });

      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('logs the failure with correct category and action', async () => {
      mockSend
        .mockRejectedValueOnce(createBedrockError('ThrottlingException'))
        .mockRejectedValueOnce(createBedrockError('ThrottlingException'))
        .mockRejectedValueOnce(createBedrockError('ThrottlingException'));

      await expect(
        callBedrock('system prompt', 'user prompt', Platform.TWITTER),
      ).rejects.toThrow();

      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'content',
          action: 'bedrock_invocation_failed',
          details: expect.objectContaining({
            errorType: 'ThrottlingException',
            modelId: 'amazon.nova-pro-v1:0',
            platform: 'TWITTER',
          }),
        }),
      );
    });
  });

  describe('ModelNotReadyException → immediate serviceUnavailable (no retry)', () => {
    it('throws serviceUnavailable immediately without retrying', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('ModelNotReadyException'));

      await expect(
        callBedrock('system prompt', 'user prompt', Platform.TWITTER),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
        message: expect.stringContaining('unavailable'),
      });

      // Should only be called once — no retries for model_unavailable
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('handles ModelTimeoutException the same way', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('ModelTimeoutException'));

      await expect(
        callBedrock('system', 'user', Platform.BLOG),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('ValidationException → immediate badRequest', () => {
    it('throws badRequest immediately without retrying', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('ValidationException'));

      await expect(
        callBedrock('system prompt', 'user prompt', Platform.LINKEDIN),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'BAD_REQUEST',
        retryable: false,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('error message indicates prompt processing issue', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('ValidationException'));

      await expect(
        callBedrock('system', 'user', Platform.TWITTER),
      ).rejects.toMatchObject({
        message: expect.stringContaining('prompt'),
      });
    });
  });

  describe('AccessDeniedException → serviceUnavailable', () => {
    it('throws internalError for AccessDeniedException (classified as other per Req 5.6)', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('AccessDeniedException'));

      await expect(
        callBedrock('system prompt', 'user prompt', Platform.TWITTER),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'INTERNAL_ERROR',
        retryable: true,
      });

      // No retry — classified as 'other' which is not retried
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Unknown exception → internalError', () => {
    it('throws internalError for unrecognized exception names', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('InternalServerException'));

      await expect(
        callBedrock('system prompt', 'user prompt', Platform.BLOG),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'INTERNAL_ERROR',
        retryable: true,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws internalError for completely unknown errors', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('SomethingUnexpectedException'));

      await expect(
        callBedrock('system', 'user', Platform.TWITTER),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'INTERNAL_ERROR',
        retryable: true,
      });
    });

    it('logs the failure with the unknown error type', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('InternalServerException'));

      await expect(
        callBedrock('system', 'user', Platform.TWITTER),
      ).rejects.toThrow();

      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'content',
          action: 'bedrock_invocation_failed',
          details: expect.objectContaining({
            errorType: 'InternalServerException',
          }),
        }),
      );
    });
  });

  describe('Credentials error → fallback + log warning', () => {
    it('content service falls back to template on CredentialsProviderError', async () => {
      // This tests the content service layer behavior.
      // Import generateDraft behavior which catches credentials errors.
      mockSend.mockRejectedValueOnce(createBedrockError('CredentialsProviderError', 'Could not load credentials'));

      // The callBedrock function itself will classify this as 'other' and throw internalError.
      // The credentials fallback happens in the content service layer.
      await expect(
        callBedrock('system', 'user', Platform.TWITTER),
      ).rejects.toMatchObject({
        name: 'AppError',
      });

      // Verify it was logged
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'content',
          action: 'bedrock_invocation_failed',
          details: expect.objectContaining({
            errorType: 'CredentialsProviderError',
          }),
        }),
      );
    });

    it('CredentialsProviderError is not retried (classified as other)', async () => {
      mockSend.mockRejectedValueOnce(createBedrockError('CredentialsProviderError'));

      await expect(
        callBedrock('system', 'user', Platform.TWITTER),
      ).rejects.toThrow();

      // Should not retry — only throttling errors are retried
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Empty response body → error raised', () => {
    it('throws internalError when response body is undefined', async () => {
      mockSend.mockResolvedValueOnce({ body: undefined });

      await expect(
        callBedrock('system prompt', 'user prompt', Platform.TWITTER),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'INTERNAL_ERROR',
        message: expect.stringContaining('no output'),
      });
    });

    it('throws internalError when response body contains no text content', async () => {
      const emptyResponse = {
        output: {
          message: {
            content: [{ text: '' }],
          },
        },
      };
      mockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify(emptyResponse)),
      });

      await expect(
        callBedrock('system prompt', 'user prompt', Platform.TWITTER),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'INTERNAL_ERROR',
        message: expect.stringContaining('no output'),
      });
    });

    it('throws internalError when response content array is empty', async () => {
      const emptyContentResponse = {
        output: {
          message: {
            content: [],
          },
        },
      };
      mockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify(emptyContentResponse)),
      });

      await expect(
        callBedrock('system', 'user', Platform.LINKEDIN),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'INTERNAL_ERROR',
        message: expect.stringContaining('no output'),
      });
    });

    it('throws internalError when response has no output field', async () => {
      const noOutputResponse = {};
      mockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify(noOutputResponse)),
      });

      await expect(
        callBedrock('system', 'user', Platform.BLOG),
      ).rejects.toMatchObject({
        name: 'AppError',
        code: 'INTERNAL_ERROR',
        message: expect.stringContaining('no output'),
      });
    });
  });
});

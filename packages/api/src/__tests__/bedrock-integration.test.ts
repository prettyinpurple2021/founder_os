/**
 * Integration Tests for Content Generation Endpoint (Bedrock)
 *
 * Tests the POST /api/content/generate endpoint with mocked Bedrock SDK,
 * verifying HTTP 201 success responses, error responses with retryable flags,
 * and evidence enrichment end-to-end.
 *
 * Requirements: 7.1, 7.2, 7.5, 7.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
    evidence: {
      findMany: vi.fn(),
    },
    contentDraft: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    draftVersion: {
      count: vi.fn(),
      create: vi.fn(),
    },
    systemLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock logger
vi.mock('../services/logger.js', () => ({
  logContent: vi.fn().mockResolvedValue(undefined),
  logSync: vi.fn().mockResolvedValue(undefined),
  logStateChange: vi.fn().mockResolvedValue(undefined),
  logAuth: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn().mockResolvedValue(undefined),
  log: vi.fn().mockResolvedValue(undefined),
}));

// Mock bedrock module
vi.mock('../lib/bedrock.js', () => ({
  isBedrockEnabled: vi.fn(),
  callBedrock: vi.fn(),
  getBedrockConfig: vi.fn().mockReturnValue({
    modelId: 'amazon.nova-pro-v1:0',
    region: 'us-east-1',
    enabled: true,
  }),
}));

import prisma from '../lib/prisma.js';
import { isBedrockEnabled, callBedrock } from '../lib/bedrock.js';
import { AppError } from '../errors/AppError.js';
import contentRouter from '../routes/content.js';

const mockIsBedrockEnabled = vi.mocked(isBedrockEnabled);
const mockCallBedrock = vi.mocked(callBedrock);
const mockRepoFindUnique = vi.mocked(prisma.repository.findUnique);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);
const mockEvidenceFindMany = vi.mocked(prisma.evidence.findMany);
const mockDraftCreate = vi.mocked(prisma.contentDraft.create);

// --- Test App Setup ---

const mockUser = {
  id: 'user-integration-1',
  githubId: 'gh-789',
  username: 'integrationuser',
  email: 'integration@example.com',
  accessToken: 'encrypted-token',
  syncInterval: 30,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Express.User;

function createTestApp(user?: Express.User | null) {
  const app = express();
  app.use(express.json());

  // Simulate authentication middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) {
      req.user = user;
      (req as unknown as Record<string, unknown>).isAuthenticated = () => true;
    } else {
      (req as unknown as Record<string, unknown>).isAuthenticated = () => false;
    }
    next();
  });

  app.use('/api/content', contentRouter);

  // Error handler matching the app pattern
  app.use(
    (
      err: Error & { statusCode?: number; code?: string; message?: string; retryable?: boolean },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message,
          retryable: err.retryable ?? true,
        },
      });
    },
  );

  return app;
}

// --- Test Helpers ---

const mockRepo = {
  id: 'repo-int-1',
  userId: 'user-integration-1',
  owner: 'integrationuser',
  name: 'test-repo',
  fullName: 'integrationuser/test-repo',
  githubId: 99999,
  connectedAt: new Date(),
};

const now = new Date('2024-06-15T10:00:00Z');

const mockTasks = [
  { id: 'task-1', title: 'Implement user authentication', lastInferredAt: now },
  { id: 'task-2', title: 'Add rate limiting middleware', lastInferredAt: now },
];

function createMockDraftResult(content: string) {
  return {
    id: 'draft-int-1',
    userId: 'user-integration-1',
    platform: 'TWITTER',
    status: 'GENERATED',
    currentContent: content,
    createdAt: now,
    updatedAt: now,
    scheduledAt: null,
    versions: [
      {
        id: 'version-int-1',
        draftId: 'draft-int-1',
        version: 1,
        content,
        editedAt: now,
      },
    ],
  };
}

// --- Tests ---

describe('POST /api/content/generate - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvidenceFindMany.mockResolvedValue([]);
  });

  describe('Success: Bedrock returns content → 201', () => {
    it('should return 201 with correct response shape when Bedrock generates content', async () => {
      const app = createTestApp(mockUser);
      const generatedContent = 'Just shipped user auth and rate limiting! 🚀 #buildinpublic';

      mockIsBedrockEnabled.mockReturnValue(true);
      mockCallBedrock.mockResolvedValue(generatedContent);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue(mockTasks as never);
      mockDraftCreate.mockResolvedValue(createMockDraftResult(generatedContent) as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'TWITTER' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('userId', 'user-integration-1');
      expect(res.body).toHaveProperty('platform', 'TWITTER');
      expect(res.body).toHaveProperty('status', 'GENERATED');
      expect(res.body).toHaveProperty('currentContent', generatedContent);
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
      expect(res.body).toHaveProperty('versions');
      expect(res.body.versions).toHaveLength(1);
      expect(res.body.versions[0]).toHaveProperty('version', 1);
      expect(res.body.versions[0]).toHaveProperty('content', generatedContent);
      expect(res.body.versions[0]).toHaveProperty('editedAt');
    });

    it('should create a ContentDraft with status GENERATED and initial DraftVersion', async () => {
      const app = createTestApp(mockUser);
      const generatedContent = 'Built pagination and search features this week.';

      mockIsBedrockEnabled.mockReturnValue(true);
      mockCallBedrock.mockResolvedValue(generatedContent);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue(mockTasks as never);
      mockDraftCreate.mockResolvedValue(createMockDraftResult(generatedContent) as never);

      await request(app).post('/api/content/generate').send({ platform: 'LINKEDIN' });

      expect(mockDraftCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-integration-1',
          platform: 'LINKEDIN',
          status: 'GENERATED',
          currentContent: generatedContent,
          versions: {
            create: {
              version: 1,
              content: generatedContent,
            },
          },
        }),
        include: { versions: true },
      });
    });

    it('should use default timeRangeDays of 7 when not specified', async () => {
      const app = createTestApp(mockUser);

      mockIsBedrockEnabled.mockReturnValue(true);
      mockCallBedrock.mockResolvedValue('Content here');
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue(mockTasks as never);
      mockDraftCreate.mockResolvedValue(createMockDraftResult('Content here') as never);

      await request(app).post('/api/content/generate').send({ platform: 'BLOG' });

      // Verify the tasks query was called with a cutoff ~7 days ago
      const taskCallArgs = mockTaskFindMany.mock.calls[0][0] as Record<string, unknown>;
      const where = taskCallArgs.where as Record<string, unknown>;
      const lastInferredAt = where.lastInferredAt as { gte: Date };
      const expectedCutoff = new Date();
      expectedCutoff.setDate(expectedCutoff.getDate() - 7);

      expect(Math.abs(lastInferredAt.gte.getTime() - expectedCutoff.getTime())).toBeLessThan(2000);
    });

    it('should accept custom timeRangeDays parameter', async () => {
      const app = createTestApp(mockUser);

      mockIsBedrockEnabled.mockReturnValue(true);
      mockCallBedrock.mockResolvedValue('Content here');
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue(mockTasks as never);
      mockDraftCreate.mockResolvedValue(createMockDraftResult('Content here') as never);

      await request(app)
        .post('/api/content/generate')
        .send({ platform: 'TWITTER', timeRangeDays: 14 });

      const taskCallArgs = mockTaskFindMany.mock.calls[0][0] as Record<string, unknown>;
      const where = taskCallArgs.where as Record<string, unknown>;
      const lastInferredAt = where.lastInferredAt as { gte: Date };
      const expectedCutoff = new Date();
      expectedCutoff.setDate(expectedCutoff.getDate() - 14);

      expect(Math.abs(lastInferredAt.gte.getTime() - expectedCutoff.getTime())).toBeLessThan(2000);
    });
  });

  describe('Failure: Bedrock error → error response with retryable flag', () => {
    it('should return error response with retryable flag when Bedrock throws serviceUnavailable', async () => {
      const app = createTestApp(mockUser);

      mockIsBedrockEnabled.mockReturnValue(true);
      // Simulate Bedrock throwing a serviceUnavailable AppError (throttling exhaustion)
      const bedrockError = new AppError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Content generation temporarily unavailable due to capacity limits. Please try again later.',
        statusCode: 503,
        retryable: true,
      });
      mockCallBedrock.mockRejectedValue(bedrockError);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue(mockTasks as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'TWITTER' });

      expect(res.status).toBe(503);
      expect(res.body.error).toHaveProperty('code', 'SERVICE_UNAVAILABLE');
      expect(res.body.error).toHaveProperty('retryable', true);
      expect(res.body.error.message).not.toContain('Bedrock');
      expect(res.body.error.message).not.toContain('aws');
    });

    it('should return error response with retryable:false for validation errors', async () => {
      const app = createTestApp(mockUser);

      mockIsBedrockEnabled.mockReturnValue(true);
      const validationError = new AppError({
        code: 'BAD_REQUEST',
        message: 'The prompt could not be processed by the content generation model.',
        statusCode: 400,
        retryable: false,
      });
      mockCallBedrock.mockRejectedValue(validationError);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue(mockTasks as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'LINKEDIN' });

      expect(res.status).toBe(400);
      expect(res.body.error).toHaveProperty('code', 'BAD_REQUEST');
      expect(res.body.error).toHaveProperty('retryable', false);
    });

    it('should return 500 with retryable:true for internal errors', async () => {
      const app = createTestApp(mockUser);

      mockIsBedrockEnabled.mockReturnValue(true);
      const internalErr = new AppError({
        code: 'INTERNAL_ERROR',
        message: 'Content generation failed.',
        statusCode: 500,
        retryable: true,
      });
      mockCallBedrock.mockRejectedValue(internalErr);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue(mockTasks as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'BLOG' });

      expect(res.status).toBe(500);
      expect(res.body.error).toHaveProperty('code', 'INTERNAL_ERROR');
      expect(res.body.error).toHaveProperty('retryable', true);
      // Should not expose provider-specific details
      expect(res.body.error.message).not.toContain('Bedrock');
      expect(res.body.error.message).not.toContain('InvokeModel');
    });

    it('should not expose provider-specific details in error responses', async () => {
      const app = createTestApp(mockUser);

      mockIsBedrockEnabled.mockReturnValue(true);
      const modelError = new AppError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Model is currently unavailable. Please try again later.',
        statusCode: 503,
        retryable: true,
      });
      mockCallBedrock.mockRejectedValue(modelError);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue(mockTasks as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'TWITTER' });

      expect(res.status).toBe(503);
      // The error is passed through as-is from the service layer, but it must not
      // expose internal AWS SDK details like ARN, region internals, or access tokens
      expect(res.body.error.message).not.toContain('arn:aws');
      expect(res.body.error.message).not.toContain('AccessKey');
    });
  });

  describe('Evidence enrichment end-to-end', () => {
    it('should pass enriched prompts with evidence to Bedrock when tasks have PR/COMMIT evidence', async () => {
      const app = createTestApp(mockUser);
      const generatedContent = 'Shipped auth with OAuth integration! 🔐';

      mockIsBedrockEnabled.mockReturnValue(true);
      mockCallBedrock.mockResolvedValue(generatedContent);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue([
        { id: 'task-ev-1', title: 'Add OAuth login', lastInferredAt: now },
      ] as never);

      // Mock evidence records for the task
      mockEvidenceFindMany.mockResolvedValue([
        {
          id: 'ev-1',
          taskId: 'task-ev-1',
          type: 'PR',
          metadata: { description: 'Implemented GitHub OAuth flow with PKCE' },
          fetchedAt: new Date('2024-06-14T10:00:00Z'),
          sourceUrl: 'https://github.com/test/repo/pull/1',
          rawPayload: {},
          createdAt: now,
        },
        {
          id: 'ev-2',
          taskId: 'task-ev-1',
          type: 'COMMIT',
          metadata: { message: 'feat: add passport github strategy' },
          fetchedAt: new Date('2024-06-14T09:00:00Z'),
          sourceUrl: 'https://github.com/test/repo/commit/abc',
          rawPayload: {},
          createdAt: now,
        },
      ] as never);

      mockDraftCreate.mockResolvedValue(createMockDraftResult(generatedContent) as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'TWITTER' });

      expect(res.status).toBe(201);

      // Verify callBedrock received enriched prompts containing evidence
      expect(mockCallBedrock).toHaveBeenCalledTimes(1);
      const [systemPrompt, userPrompt] = mockCallBedrock.mock.calls[0];

      // User prompt should contain evidence context
      expect(userPrompt).toContain('Add OAuth login');
      expect(userPrompt).toContain('Implemented GitHub OAuth flow with PKCE');
      expect(userPrompt).toContain('feat: add passport github strategy');

      // System prompt should contain platform-specific instructions
      expect(systemPrompt).toContain('Twitter');
    });

    it('should produce a prompt without evidence lines when tasks have no evidence records', async () => {
      const app = createTestApp(mockUser);
      const generatedContent = 'Shipped some features this week 🎉';

      mockIsBedrockEnabled.mockReturnValue(true);
      mockCallBedrock.mockResolvedValue(generatedContent);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue([
        { id: 'task-no-ev', title: 'Simple bug fix', lastInferredAt: now },
      ] as never);
      mockEvidenceFindMany.mockResolvedValue([]);
      mockDraftCreate.mockResolvedValue(createMockDraftResult(generatedContent) as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'LINKEDIN' });

      expect(res.status).toBe(201);

      // Verify callBedrock received prompts with just task title (no evidence lines)
      const [_systemPrompt, userPrompt] = mockCallBedrock.mock.calls[0];
      expect(userPrompt).toContain('Simple bug fix');
      expect(userPrompt).not.toContain('PR:');
      expect(userPrompt).not.toContain('Commit:');
    });

    it('should skip malformed evidence metadata and still include valid evidence', async () => {
      const app = createTestApp(mockUser);
      const generatedContent = 'Productive week! Built new features.';

      mockIsBedrockEnabled.mockReturnValue(true);
      mockCallBedrock.mockResolvedValue(generatedContent);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue([
        { id: 'task-mixed', title: 'Build API', lastInferredAt: now },
      ] as never);

      // Mix of valid and malformed evidence metadata
      mockEvidenceFindMany.mockResolvedValue([
        {
          id: 'ev-valid',
          taskId: 'task-mixed',
          type: 'PR',
          metadata: { description: 'Added REST endpoints for users' },
          fetchedAt: new Date('2024-06-14T10:00:00Z'),
          sourceUrl: 'https://github.com/test/repo/pull/2',
          rawPayload: {},
          createdAt: now,
        },
        {
          id: 'ev-malformed-1',
          taskId: 'task-mixed',
          type: 'PR',
          metadata: { title: 'Missing description field' }, // No 'description' key
          fetchedAt: new Date('2024-06-14T09:00:00Z'),
          sourceUrl: 'https://github.com/test/repo/pull/3',
          rawPayload: {},
          createdAt: now,
        },
        {
          id: 'ev-malformed-2',
          taskId: 'task-mixed',
          type: 'COMMIT',
          metadata: { sha: 'no-message-field' }, // No 'message' key
          fetchedAt: new Date('2024-06-14T08:00:00Z'),
          sourceUrl: 'https://github.com/test/repo/commit/def',
          rawPayload: {},
          createdAt: now,
        },
        {
          id: 'ev-valid-commit',
          taskId: 'task-mixed',
          type: 'COMMIT',
          metadata: { message: 'refactor: clean up API layer' },
          fetchedAt: new Date('2024-06-14T07:00:00Z'),
          sourceUrl: 'https://github.com/test/repo/commit/ghi',
          rawPayload: {},
          createdAt: now,
        },
      ] as never);

      mockDraftCreate.mockResolvedValue(createMockDraftResult(generatedContent) as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'BLOG' });

      expect(res.status).toBe(201);

      // Verify valid evidence is included, malformed is skipped
      const [_systemPrompt, userPrompt] = mockCallBedrock.mock.calls[0];
      expect(userPrompt).toContain('Added REST endpoints for users');
      expect(userPrompt).toContain('refactor: clean up API layer');
      // Malformed records should not appear in prompt
      expect(userPrompt).not.toContain('Missing description field');
      expect(userPrompt).not.toContain('no-message-field');
    });

    it('should truncate long PR descriptions to 500 chars and commit messages to 200 chars', async () => {
      const app = createTestApp(mockUser);
      const generatedContent = 'Working on big features!';

      const longDescription = 'A'.repeat(1000);
      const longMessage = 'B'.repeat(500);

      mockIsBedrockEnabled.mockReturnValue(true);
      mockCallBedrock.mockResolvedValue(generatedContent);
      mockRepoFindUnique.mockResolvedValue(mockRepo as never);
      mockTaskFindMany.mockResolvedValue([
        { id: 'task-long', title: 'Big feature', lastInferredAt: now },
      ] as never);

      mockEvidenceFindMany.mockResolvedValue([
        {
          id: 'ev-long-pr',
          taskId: 'task-long',
          type: 'PR',
          metadata: { description: longDescription },
          fetchedAt: new Date('2024-06-14T10:00:00Z'),
          sourceUrl: 'https://github.com/test/repo/pull/10',
          rawPayload: {},
          createdAt: now,
        },
        {
          id: 'ev-long-commit',
          taskId: 'task-long',
          type: 'COMMIT',
          metadata: { message: longMessage },
          fetchedAt: new Date('2024-06-14T09:00:00Z'),
          sourceUrl: 'https://github.com/test/repo/commit/xyz',
          rawPayload: {},
          createdAt: now,
        },
      ] as never);

      mockDraftCreate.mockResolvedValue(createMockDraftResult(generatedContent) as never);

      const res = await request(app).post('/api/content/generate').send({ platform: 'TWITTER' });

      expect(res.status).toBe(201);

      const [_systemPrompt, userPrompt] = mockCallBedrock.mock.calls[0];

      // Full 1000-char description should NOT appear
      expect(userPrompt).not.toContain(longDescription);
      // Truncated to 500 chars
      expect(userPrompt).toContain('A'.repeat(500));

      // Full 500-char message should NOT appear
      expect(userPrompt).not.toContain(longMessage);
      // Truncated to 200 chars
      expect(userPrompt).toContain('B'.repeat(200));
    });
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      const app = createTestApp(null);

      const res = await request(app).post('/api/content/generate').send({ platform: 'TWITTER' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});

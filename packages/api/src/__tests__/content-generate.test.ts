/**
 * Unit Tests for Content Generation Service
 *
 * Tests the generateDraft function which creates build-in-public
 * content drafts from recently completed tasks using LLM or fallback.
 *
 * Requirements: 6.1, 6.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  default: {
    repository: {
      findUnique: vi.fn(),
    },
    task: {
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
    $transaction: vi.fn(),
  },
}));

import prisma from '../lib/prisma.js';
import { generateDraft, callLLM, PLATFORM_PROMPTS } from '../services/content.js';

const mockRepoFindUnique = vi.mocked(prisma.repository.findUnique);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);
const mockDraftCreate = vi.mocked(prisma.contentDraft.create);

describe('generateDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure no LLM_API_KEY is set so fallback is used
    delete process.env.LLM_API_KEY;
  });

  it('should create a draft with correct platform and GENERATED status', async () => {
    const userId = 'user-1';
    const repoId = 'repo-1';

    mockRepoFindUnique.mockResolvedValue({
      id: repoId,
      userId,
      owner: 'testuser',
      name: 'testrepo',
      fullName: 'testuser/testrepo',
      githubId: 123,
      connectedAt: new Date(),
    } as any);

    mockTaskFindMany.mockResolvedValue([
      { id: 'task-1', title: 'Implement auth flow', lastInferredAt: new Date() },
      { id: 'task-2', title: 'Add user dashboard', lastInferredAt: new Date() },
    ] as any);

    const now = new Date();
    mockDraftCreate.mockResolvedValue({
      id: 'draft-1',
      userId,
      platform: 'TWITTER',
      status: 'GENERATED',
      currentContent: 'Generated content here',
      createdAt: now,
      updatedAt: now,
      scheduledAt: null,
      versions: [
        { id: 'version-1', draftId: 'draft-1', version: 1, content: 'Generated content here', editedAt: now },
      ],
    } as any);

    const result = await generateDraft(userId, 'TWITTER');

    expect(result.platform).toBe('TWITTER');
    expect(result.status).toBe('GENERATED');
    expect(result.userId).toBe(userId);

    // Verify draft was created with correct data
    expect(mockDraftCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        platform: 'TWITTER',
        status: 'GENERATED',
      }),
      include: { versions: true },
    });
  });

  it('should create an initial DraftVersion with version 1', async () => {
    const userId = 'user-1';

    mockRepoFindUnique.mockResolvedValue({
      id: 'repo-1',
      userId,
      owner: 'testuser',
      name: 'testrepo',
      fullName: 'testuser/testrepo',
      githubId: 123,
      connectedAt: new Date(),
    } as any);

    mockTaskFindMany.mockResolvedValue([
      { id: 'task-1', title: 'Build API endpoints', lastInferredAt: new Date() },
    ] as any);

    const now = new Date();
    mockDraftCreate.mockResolvedValue({
      id: 'draft-1',
      userId,
      platform: 'LINKEDIN',
      status: 'GENERATED',
      currentContent: 'Some content',
      createdAt: now,
      updatedAt: now,
      scheduledAt: null,
      versions: [
        { id: 'v-1', draftId: 'draft-1', version: 1, content: 'Some content', editedAt: now },
      ],
    } as any);

    const result = await generateDraft(userId, 'LINKEDIN');

    // Verify version 1 is included
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].version).toBe(1);

    // Verify the create call includes version creation
    expect(mockDraftCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        versions: {
          create: {
            version: 1,
            content: expect.any(String),
          },
        },
      }),
      include: { versions: true },
    });
  });

  it('should fetch recently completed tasks within the time range', async () => {
    const userId = 'user-1';
    const repoId = 'repo-1';
    const timeRangeDays = 14;

    mockRepoFindUnique.mockResolvedValue({
      id: repoId,
      userId,
      owner: 'testuser',
      name: 'testrepo',
      fullName: 'testuser/testrepo',
      githubId: 123,
      connectedAt: new Date(),
    } as any);

    mockTaskFindMany.mockResolvedValue([
      { id: 'task-1', title: 'Ship feature X', lastInferredAt: new Date() },
    ] as any);

    const now = new Date();
    mockDraftCreate.mockResolvedValue({
      id: 'draft-1',
      userId,
      platform: 'BLOG',
      status: 'GENERATED',
      currentContent: 'Blog content',
      createdAt: now,
      updatedAt: now,
      scheduledAt: null,
      versions: [
        { id: 'v-1', draftId: 'draft-1', version: 1, content: 'Blog content', editedAt: now },
      ],
    } as any);

    await generateDraft(userId, 'BLOG', timeRangeDays);

    // Verify tasks query uses correct repository ID, state filter, and date
    expect(mockTaskFindMany).toHaveBeenCalledWith({
      where: {
        repositoryId: repoId,
        state: 'COMPLETED',
        lastInferredAt: {
          gte: expect.any(Date),
        },
      },
      orderBy: { lastInferredAt: 'desc' },
      select: {
        id: true,
        title: true,
        lastInferredAt: true,
      },
    });

    // Verify the cutoff date is approximately timeRangeDays ago
    const callArgs = mockTaskFindMany.mock.calls[0][0] as any;
    const cutoffDate = callArgs.where.lastInferredAt.gte as Date;
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - timeRangeDays);

    // Allow 1 second tolerance for test execution time
    expect(Math.abs(cutoffDate.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
  });

  it('should throw an error when no completed tasks are found', async () => {
    const userId = 'user-1';

    mockRepoFindUnique.mockResolvedValue({
      id: 'repo-1',
      userId,
      owner: 'testuser',
      name: 'testrepo',
      fullName: 'testuser/testrepo',
      githubId: 123,
      connectedAt: new Date(),
    } as any);

    mockTaskFindMany.mockResolvedValue([]);

    await expect(generateDraft(userId, 'TWITTER')).rejects.toThrow(
      /No completed tasks found/,
    );
  });

  it('should throw an error when no repository is connected', async () => {
    mockRepoFindUnique.mockResolvedValue(null);

    await expect(generateDraft('user-no-repo', 'TWITTER')).rejects.toThrow(
      /No connected repository found/,
    );
  });

  it('should use default time range of 7 days when not specified', async () => {
    const userId = 'user-1';

    mockRepoFindUnique.mockResolvedValue({
      id: 'repo-1',
      userId,
      owner: 'testuser',
      name: 'testrepo',
      fullName: 'testuser/testrepo',
      githubId: 123,
      connectedAt: new Date(),
    } as any);

    mockTaskFindMany.mockResolvedValue([
      { id: 'task-1', title: 'Task A', lastInferredAt: new Date() },
    ] as any);

    const now = new Date();
    mockDraftCreate.mockResolvedValue({
      id: 'draft-1',
      userId,
      platform: 'TWITTER',
      status: 'GENERATED',
      currentContent: 'Content',
      createdAt: now,
      updatedAt: now,
      scheduledAt: null,
      versions: [
        { id: 'v-1', draftId: 'draft-1', version: 1, content: 'Content', editedAt: now },
      ],
    } as any);

    await generateDraft(userId, 'TWITTER');

    // Verify cutoff is ~7 days ago
    const callArgs = mockTaskFindMany.mock.calls[0][0] as any;
    const cutoffDate = callArgs.where.lastInferredAt.gte as Date;
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 7);

    expect(Math.abs(cutoffDate.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
  });
});

describe('callLLM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LLM_API_KEY;
  });

  it('should use template fallback when LLM_API_KEY is not set', async () => {
    const result = await callLLM('System prompt', 'User prompt about tasks');

    expect(result).toContain('Build Update');
    expect(result).toContain('User prompt about tasks');
    expect(result).toContain('#buildinpublic');
  });

  it('should call OpenAI API when LLM_API_KEY is set', async () => {
    process.env.LLM_API_KEY = 'test-api-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'AI generated content' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await callLLM('System prompt', 'User prompt');

    expect(result).toBe('AI generated content');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      }),
    );

    vi.unstubAllGlobals();
    delete process.env.LLM_API_KEY;
  });

  it('should throw an error when OpenAI API returns an error', async () => {
    process.env.LLM_API_KEY = 'test-api-key';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded'),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(callLLM('System prompt', 'User prompt')).rejects.toThrow(
      /LLM content generation failed/,
    );

    vi.unstubAllGlobals();
    delete process.env.LLM_API_KEY;
  });
});

describe('PLATFORM_PROMPTS', () => {
  it('should have configs for all three platforms', () => {
    expect(PLATFORM_PROMPTS.TWITTER).toBeDefined();
    expect(PLATFORM_PROMPTS.LINKEDIN).toBeDefined();
    expect(PLATFORM_PROMPTS.BLOG).toBeDefined();
  });

  it('should include systemPrompt in each platform config', () => {
    expect(PLATFORM_PROMPTS.TWITTER.systemPrompt).toContain('Twitter');
    expect(PLATFORM_PROMPTS.LINKEDIN.systemPrompt).toContain('LinkedIn');
    expect(PLATFORM_PROMPTS.BLOG.systemPrompt).toContain('blog');
  });
});

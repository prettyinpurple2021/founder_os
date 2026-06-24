/**
 * Content Service
 *
 * Manages content drafts for social media and blog posts.
 * Supports generation from completed tasks, filtering by status and platform,
 * and editing drafts with version history.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.6
 */

import prisma from '../lib/prisma.js';
import { DraftStatus, Platform } from '../generated/prisma/enums.js';
import { notFound, forbidden, badRequest, internalError } from '../errors/AppError.js';
import { buildPrompt, type TaskSummary } from './content-prompts.js';
import { logContent } from './logger.js';

/** Supported content platforms. */
export type ContentPlatform = 'TWITTER' | 'LINKEDIN' | 'BLOG';

/** States in which a draft can still be edited. */
const EDITABLE_STATES: DraftStatus[] = [
  DraftStatus.GENERATED,
  DraftStatus.EDITING,
  DraftStatus.PENDING_APPROVAL,
];

/**
 * Lists all content drafts for a user with optional filtering.
 *
 * @param userId - The authenticated user's ID
 * @param filters - Optional filters for status and platform
 * @returns Array of content drafts ordered by createdAt descending
 */
export async function listDrafts(userId: string, filters?: { status?: string; platform?: string }) {
  const where: Record<string, unknown> = { userId };

  if (filters?.status) {
    const validStatuses = Object.values(DraftStatus);
    if (!validStatuses.includes(filters.status as DraftStatus)) {
      throw new InvalidFilterError(
        `Invalid status value: '${filters.status}'. Valid values: ${validStatuses.join(', ')}`,
        'status',
      );
    }
    where.status = filters.status;
  }

  if (filters?.platform) {
    const validPlatforms = Object.values(Platform);
    if (!validPlatforms.includes(filters.platform as Platform)) {
      throw new InvalidFilterError(
        `Invalid platform value: '${filters.platform}'. Valid values: ${validPlatforms.join(', ')}`,
        'platform',
      );
    }
    where.platform = filters.platform;
  }

  const drafts = await prisma.contentDraft.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return drafts;
}

/**
 * Custom error for invalid filter values.
 * Used to distinguish validation errors from other failures.
 */
export class InvalidFilterError extends Error {
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'InvalidFilterError';
    this.field = field;
  }
}

/**
 * Edits a content draft and creates a new DraftVersion to preserve version history.
 *
 * - Verifies the draft exists and belongs to the user
 * - Verifies the draft is in an editable state (GENERATED or EDITING)
 * - Updates currentContent and sets status to EDITING
 * - Creates a new DraftVersion with an incremented version number
 *
 * Requirements: 6.3, 6.4
 *
 * @param userId - The authenticated user's ID
 * @param draftId - The draft to edit
 * @param newContent - The new content for the draft
 * @returns The updated draft and the new version record
 */
export async function editDraft(userId: string, draftId: string, newContent: string) {
  // Validate content is non-empty
  if (!newContent || newContent.trim().length === 0) {
    throw badRequest('Content must not be empty');
  }

  // Find the draft
  const draft = await prisma.contentDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw notFound('Draft not found');
  }

  // Verify ownership
  if (draft.userId !== userId) {
    throw forbidden('You do not have access to this draft');
  }

  // Verify the draft is in an editable state
  if (!EDITABLE_STATES.includes(draft.status)) {
    throw badRequest(
      `Draft cannot be edited in its current state: '${draft.status}'. Editable states: ${EDITABLE_STATES.join(', ')}`,
    );
  }

  // Count existing versions to determine the next version number
  const versionCount = await prisma.draftVersion.count({
    where: { draftId },
  });

  // Update the draft and create a new version in a transaction
  const [updatedDraft, newVersion] = await prisma.$transaction([
    prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        currentContent: newContent,
        status: DraftStatus.EDITING,
      },
    }),
    prisma.draftVersion.create({
      data: {
        draftId,
        version: versionCount + 1,
        content: newContent,
      },
    }),
  ]);

  // Log the edit action (Requirement 10.3)
  await logContent(userId, 'edit', {
    draftId,
    version: versionCount + 1,
  });

  return {
    draft: {
      id: updatedDraft.id,
      platform: updatedDraft.platform,
      status: updatedDraft.status,
      currentContent: updatedDraft.currentContent,
      updatedAt: updatedDraft.updatedAt,
    },
    version: {
      id: newVersion.id,
      version: newVersion.version,
      content: newVersion.content,
      editedAt: newVersion.editedAt,
    },
  };
}

// --- Draft Version History (Requirement 6.4) ---

export interface DraftVersionsResult {
  draft: {
    id: string;
    platform: string;
    status: string;
    currentContent: string;
  };
  versions: Array<{
    id: string;
    version: number;
    content: string;
    editedAt: Date;
  }>;
}

/**
 * Retrieves the version history for a content draft.
 *
 * Validates that the draft exists and belongs to the requesting user.
 * Returns basic draft info along with all versions ordered by version number ascending.
 *
 * Requirements: 6.4
 *
 * @param userId - The authenticated user's ID
 * @param draftId - The draft ID to retrieve versions for
 * @returns Draft info and ordered version array
 * @throws 404 if draft not found
 * @throws 403 if draft belongs to a different user
 */
export async function getDraftVersions(
  userId: string,
  draftId: string,
): Promise<DraftVersionsResult> {
  const draft = await prisma.contentDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw notFound('Draft not found');
  }

  if (draft.userId !== userId) {
    throw forbidden('Access denied');
  }

  const versions = await prisma.draftVersion.findMany({
    where: { draftId },
    orderBy: { version: 'asc' },
  });

  return {
    draft: {
      id: draft.id,
      platform: draft.platform,
      status: draft.status,
      currentContent: draft.currentContent,
    },
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      content: v.content,
      editedAt: v.editedAt,
    })),
  };
}

// --- Draft Lifecycle State Machine (Requirements 7.1, 6.6) ---

/**
 * Valid state transitions for content drafts.
 * Defines which target states are reachable from each source state.
 */
export const VALID_TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
  [DraftStatus.GENERATED]: [DraftStatus.EDITING, DraftStatus.PENDING_APPROVAL],
  [DraftStatus.EDITING]: [DraftStatus.EDITING, DraftStatus.PENDING_APPROVAL],
  [DraftStatus.PENDING_APPROVAL]: [DraftStatus.APPROVED, DraftStatus.REJECTED],
  [DraftStatus.APPROVED]: [DraftStatus.SCHEDULED, DraftStatus.COPIED],
  [DraftStatus.REJECTED]: [],
  [DraftStatus.SCHEDULED]: [],
  [DraftStatus.COPIED]: [],
};

/**
 * Checks if a transition from one draft status to another is valid.
 *
 * @param from - The current draft status
 * @param to - The target draft status
 * @returns true if the transition is allowed, false otherwise
 */
export function isValidTransition(from: DraftStatus, to: DraftStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Validates a draft status transition, throwing a 400 error if invalid.
 *
 * @param from - The current draft status
 * @param to - The target draft status
 * @throws 400 BadRequest if the transition is not allowed
 */
export function validateTransition(from: DraftStatus, to: DraftStatus): void {
  if (!isValidTransition(from, to)) {
    throw badRequest(
      `Invalid state transition from '${from}' to '${to}'. Allowed transitions from '${from}': ${VALID_TRANSITIONS[from].length > 0 ? VALID_TRANSITIONS[from].join(', ') : 'none (terminal state)'}`,
    );
  }
}

/**
 * Submits a content draft for review, transitioning it to PENDING_APPROVAL.
 *
 * - Verifies the draft exists and belongs to the user
 * - Validates that the current state allows transition to PENDING_APPROVAL
 * - Updates status to PENDING_APPROVAL
 * - Creates a SystemLog entry recording the submission
 *
 * Requirements: 7.1, 6.6
 *
 * @param userId - The authenticated user's ID
 * @param draftId - The draft to submit for review
 * @returns The updated draft
 * @throws 404 if draft not found
 * @throws 403 if draft belongs to a different user
 * @throws 400 if the current state doesn't allow submission
 */
export async function submitForReview(userId: string, draftId: string) {
  const draft = await prisma.contentDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw notFound('Draft not found');
  }

  if (draft.userId !== userId) {
    throw forbidden('You do not have access to this draft');
  }

  // Validate transition using state machine
  validateTransition(draft.status as DraftStatus, DraftStatus.PENDING_APPROVAL);

  const previousStatus = draft.status;

  const [updatedDraft] = await prisma.$transaction([
    prisma.contentDraft.update({
      where: { id: draftId },
      data: { status: DraftStatus.PENDING_APPROVAL },
    }),
    prisma.systemLog.create({
      data: {
        category: 'content',
        action: 'submit_for_review',
        details: {
          draftId,
          platform: draft.platform,
          previousStatus,
        },
        userId,
      },
    }),
  ]);

  return {
    draft: {
      id: updatedDraft.id,
      platform: updatedDraft.platform,
      status: updatedDraft.status,
      currentContent: updatedDraft.currentContent,
      updatedAt: updatedDraft.updatedAt,
    },
  };
}

// --- Draft Rejection (Requirements 6.5, 7.4) ---

/**
 * Rejects a content draft, moving it to REJECTED status while preserving content.
 *
 * - Verifies the draft exists and belongs to the user
 * - Verifies the draft is in PENDING_APPROVAL state
 * - Updates status to REJECTED (content is preserved, never cleared)
 * - Creates a SystemLog entry recording the rejection
 *
 * Requirements: 6.5, 7.4
 *
 * @param userId - The authenticated user's ID
 * @param draftId - The draft to reject
 * @param reason - Optional rejection reason
 * @returns The updated draft with preserved content
 */
export async function rejectDraft(userId: string, draftId: string, reason?: string) {
  // Find the draft
  const draft = await prisma.contentDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw notFound('Draft not found');
  }

  // Verify ownership
  if (draft.userId !== userId) {
    throw forbidden('You do not have access to this draft');
  }

  // Validate transition using state machine
  validateTransition(draft.status as DraftStatus, DraftStatus.REJECTED);

  // Update status to REJECTED and log the action in a transaction
  const [updatedDraft] = await prisma.$transaction([
    prisma.contentDraft.update({
      where: { id: draftId },
      data: {
        status: DraftStatus.REJECTED,
        // currentContent is intentionally NOT modified - content must be preserved
      },
    }),
    prisma.systemLog.create({
      data: {
        category: 'content',
        action: 'reject',
        details: {
          draftId,
          platform: draft.platform,
          previousStatus: draft.status,
          reason: reason ?? null,
        },
        userId,
      },
    }),
  ]);

  return {
    draft: {
      id: updatedDraft.id,
      platform: updatedDraft.platform,
      status: updatedDraft.status,
      currentContent: updatedDraft.currentContent,
      updatedAt: updatedDraft.updatedAt,
    },
  };
}

// --- Draft Approval (Requirement 7.1, 7.3) ---

/**
 * Approves a content draft, transitioning it from PENDING_APPROVAL to APPROVED.
 *
 * - Verifies the draft exists and belongs to the user
 * - Verifies the draft is in PENDING_APPROVAL state
 * - Updates status to APPROVED
 * - Creates a SystemLog entry recording the approval action
 *
 * Requirements: 7.1, 7.3
 *
 * @param userId - The authenticated user's ID
 * @param draftId - The draft to approve
 * @returns The updated draft
 * @throws 404 if draft not found
 * @throws 403 if draft belongs to a different user
 * @throws 400 if draft is not in PENDING_APPROVAL state
 */
export async function approveDraft(userId: string, draftId: string) {
  const draft = await prisma.contentDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw notFound('Draft not found');
  }

  if (draft.userId !== userId) {
    throw forbidden('You do not have access to this draft');
  }

  // Validate transition using state machine
  validateTransition(draft.status as DraftStatus, DraftStatus.APPROVED);

  const previousStatus = draft.status;

  const [updatedDraft] = await prisma.$transaction([
    prisma.contentDraft.update({
      where: { id: draftId },
      data: { status: DraftStatus.APPROVED },
    }),
    prisma.systemLog.create({
      data: {
        category: 'content',
        action: 'approve',
        details: {
          draftId,
          platform: draft.platform,
          previousStatus,
        },
        userId,
      },
    }),
  ]);

  return {
    draft: {
      id: updatedDraft.id,
      platform: updatedDraft.platform,
      status: updatedDraft.status,
      currentContent: updatedDraft.currentContent,
      updatedAt: updatedDraft.updatedAt,
    },
  };
}

/**
 * Schedules an approved draft for publishing or marks it as copied for manual posting.
 *
 * - Verifies the draft exists and belongs to the user
 * - Verifies the draft is in APPROVED state
 * - If scheduledAt is provided: validates it's in the future, sets status to SCHEDULED
 * - If scheduledAt is NOT provided: sets status to COPIED (manual posting)
 * - Creates a SystemLog entry for the action
 *
 * Requirements: 7.2
 *
 * @param userId - The authenticated user's ID
 * @param draftId - The draft to schedule or copy
 * @param scheduledAt - Optional ISO date string or Date for when to publish
 * @returns The updated draft
 */
export async function scheduleDraft(userId: string, draftId: string, scheduledAt?: string | Date) {
  // Find the draft
  const draft = await prisma.contentDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw notFound('Draft not found');
  }

  // Verify ownership
  if (draft.userId !== userId) {
    throw forbidden('You do not have access to this draft');
  }

  // Determine action: schedule or copy
  let parsedDate: Date | null = null;
  let action: 'schedule' | 'copy';
  let targetStatus: DraftStatus;

  if (scheduledAt !== undefined && scheduledAt !== null) {
    // Parse and validate the scheduled date
    parsedDate = new Date(scheduledAt);
    if (isNaN(parsedDate.getTime())) {
      throw badRequest('Invalid scheduledAt date format');
    }
    if (parsedDate.getTime() <= Date.now()) {
      throw badRequest('scheduledAt must be a future date');
    }
    action = 'schedule';
    targetStatus = DraftStatus.SCHEDULED;
  } else {
    action = 'copy';
    targetStatus = DraftStatus.COPIED;
  }

  // Validate transition using state machine
  validateTransition(draft.status as DraftStatus, targetStatus);

  // Update the draft
  const updatedDraft = await prisma.contentDraft.update({
    where: { id: draftId },
    data: {
      status: targetStatus,
      scheduledAt: parsedDate,
    },
  });

  // Create a SystemLog entry
  await prisma.systemLog.create({
    data: {
      category: 'content',
      action,
      details: {
        draftId,
        platform: draft.platform,
        ...(parsedDate ? { scheduledAt: parsedDate.toISOString() } : {}),
      },
      userId,
    },
  });

  return {
    draft: {
      id: updatedDraft.id,
      platform: updatedDraft.platform,
      status: updatedDraft.status,
      currentContent: updatedDraft.currentContent,
      scheduledAt: updatedDraft.scheduledAt,
      updatedAt: updatedDraft.updatedAt,
    },
  };
}

// --- Re-export for convenience ---

/**
 * Platform prompts re-exported from content-prompts for backward compatibility.
 */
export { PLATFORM_CONFIGS as PLATFORM_PROMPTS } from './content-prompts.js';

// --- LLM Integration ---

/**
 * Calls OpenAI chat completions API to generate content.
 * Falls back to template-based generation if LLM_API_KEY is not set.
 *
 * @param systemPrompt - The system prompt defining the AI's role and constraints
 * @param userPrompt - The user prompt with task details for content generation
 * @returns The generated content string
 */
export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    // Template-based fallback for dev/testing
    return generateTemplateFallback(userPrompt);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      // Consume and discard the response body — it may contain sensitive provider internals
      // that should not propagate to callers. Use text() to ensure the connection is released.
      await response.text().catch(() => {});
      throw new Error(`OpenAI API error (status ${response.status})`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content returned from OpenAI API');
    }

    return content.trim();
  } catch (error) {
    throw internalError('LLM content generation failed', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Template-based fallback when no LLM API key is configured.
 * Generates a simple structured draft from the task list.
 */
function generateTemplateFallback(userPrompt: string): string {
  return `🚀 Build Update\n\nHere's what I shipped recently:\n\n${userPrompt}\n\n#buildinpublic #indiehacker`;
}

// --- Content Generation ---

export interface GeneratedDraft {
  id: string;
  userId: string;
  platform: ContentPlatform;
  status: string;
  currentContent: string;
  createdAt: Date;
  updatedAt: Date;
  versions: {
    id: string;
    version: number;
    content: string;
    editedAt: Date;
  }[];
}

/**
 * Generates a content draft from recently completed tasks.
 *
 * Fetches completed tasks within the specified time range, builds a
 * platform-specific prompt using content-prompts, calls the LLM (or fallback),
 * and persists the draft with an initial version.
 *
 * Requirements: 6.1, 6.2
 *
 * @param userId - The authenticated user's ID
 * @param platform - Target platform (TWITTER, LINKEDIN, or BLOG)
 * @param timeRangeDays - Number of days to look back for completed tasks (default: 7)
 * @returns The created ContentDraft with its initial version
 */
export async function generateDraft(
  userId: string,
  platform: ContentPlatform,
  timeRangeDays: number = 7,
): Promise<GeneratedDraft> {
  // Calculate the time range cutoff
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeRangeDays);

  // Find the user's connected repository
  const repository = await prisma.repository.findUnique({
    where: { userId },
  });

  if (!repository) {
    throw notFound('No connected repository found. Please connect a GitHub repository first.');
  }

  // Fetch recently completed tasks
  const completedTasks = await prisma.task.findMany({
    where: {
      repositoryId: repository.id,
      state: 'COMPLETED',
      lastInferredAt: {
        gte: cutoffDate,
      },
    },
    orderBy: { lastInferredAt: 'desc' },
    select: {
      id: true,
      title: true,
      lastInferredAt: true,
    },
  });

  if (completedTasks.length === 0) {
    throw notFound(
      `No completed tasks found in the last ${timeRangeDays} days. Complete some tasks first to generate content.`,
    );
  }

  // Build task summaries for prompt building
  const taskSummaries: TaskSummary[] = completedTasks.map((task) => ({
    title: task.title,
    completedAt: task.lastInferredAt!,
  }));

  // Build platform-specific prompts using the prompts service
  const platformEnum = Platform[platform];
  const { system, user } = buildPrompt(platformEnum, taskSummaries);

  // Generate content via LLM or fallback
  const generatedContent = await callLLM(system, user);

  // Create the draft and initial version
  const draft = await prisma.contentDraft.create({
    data: {
      userId,
      platform: platformEnum,
      status: 'GENERATED',
      currentContent: generatedContent,
      versions: {
        create: {
          version: 1,
          content: generatedContent,
        },
      },
    },
    include: {
      versions: true,
    },
  });

  // Log the generate action (Requirement 10.3)
  await logContent(userId, 'generate', {
    draftId: draft.id,
    platform: draft.platform,
    taskCount: completedTasks.length,
  });

  return {
    id: draft.id,
    userId: draft.userId,
    platform: draft.platform as ContentPlatform,
    status: draft.status,
    currentContent: draft.currentContent,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    versions: draft.versions.map((v) => ({
      id: v.id,
      version: v.version,
      content: v.content,
      editedAt: v.editedAt,
    })),
  };
}

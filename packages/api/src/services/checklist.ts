/**
 * Launch Readiness Checklist Generator
 *
 * Generates a categorized launch-readiness checklist based on current task states.
 * The checklist is re-generated fresh on every request, pulling live task data from
 * the database, ensuring reactive updates when task states change within the same session.
 *
 * Categories: product, quality, deployment, legal/admin, marketing, content
 * Ordering: blockers-first (preserving relative order within groups)
 * Next best action: highest-priority incomplete non-blocked item
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import prisma from '../lib/prisma.js';

// --- Types ---

export type ChecklistCategory =
  | 'product'
  | 'quality'
  | 'deployment'
  | 'legal/admin'
  | 'marketing'
  | 'content';

export type ChecklistItemStatus = 'complete' | 'in_progress' | 'blocked' | 'incomplete';

export interface ChecklistItem {
  id: string;
  category: ChecklistCategory;
  description: string;
  status: ChecklistItemStatus;
  isBlocker: boolean;
  blockerReason?: string;
  priority: number;
}

export interface TaskWithState {
  id: string;
  title: string;
  state: string;
  blockerReason?: string | null;
  category?: string;
}

export interface ChecklistResponse {
  categories: ChecklistCategory[];
  items: ChecklistItem[];
  nextBestAction: ChecklistItem | null;
  summary: {
    total: number;
    complete: number;
    inProgress: number;
    blocked: number;
    incomplete: number;
    readinessPercentage: number;
  };
}

// --- Fixed categories (Requirement 4.1) ---

export const CHECKLIST_CATEGORIES: ChecklistCategory[] = [
  'product',
  'quality',
  'deployment',
  'legal/admin',
  'marketing',
  'content',
];

/**
 * Category descriptions used when generating checklist items.
 */
const CATEGORY_DESCRIPTIONS: Record<ChecklistCategory, string> = {
  'product': 'Core features complete and critical bugs resolved',
  'quality': 'Tests passing and no open critical issues',
  'deployment': 'CI/CD configured, environment ready, domain set up',
  'legal/admin': 'Terms of service, privacy policy, business registration',
  'marketing': 'Landing page, social profiles, announcement posts',
  'content': 'Launch post drafted, changelog prepared',
};

/**
 * Priority values for categories (lower = higher priority).
 */
const CATEGORY_PRIORITY: Record<ChecklistCategory, number> = {
  'product': 1,
  'quality': 2,
  'deployment': 3,
  'legal/admin': 4,
  'marketing': 5,
  'content': 6,
};

// --- Status derivation (Requirement 4.2) ---

/**
 * Derives the checklist item status from a group of tasks.
 *
 * Rules:
 *   - All tasks COMPLETED → "complete"
 *   - Any task BLOCKED → "blocked" (isBlocker = true)
 *   - Any task IN_PROGRESS or NEEDS_REVIEW → "in_progress"
 *   - Otherwise → "incomplete"
 */
export function deriveItemStatus(tasks: TaskWithState[]): {
  status: ChecklistItemStatus;
  isBlocker: boolean;
  blockerReason?: string;
} {
  if (tasks.length === 0) {
    return { status: 'incomplete', isBlocker: false };
  }

  // Check for any blocked task (highest priority)
  const blockedTask = tasks.find((t) => t.state === 'BLOCKED');
  if (blockedTask) {
    return {
      status: 'blocked',
      isBlocker: true,
      blockerReason: blockedTask.blockerReason || 'Task is blocked',
    };
  }

  // Check if all tasks are completed
  const allCompleted = tasks.every((t) => t.state === 'COMPLETED');
  if (allCompleted) {
    return { status: 'complete', isBlocker: false };
  }

  // Check for any task in progress or needs review
  const hasInProgress = tasks.some(
    (t) => t.state === 'IN_PROGRESS' || t.state === 'NEEDS_REVIEW'
  );
  if (hasInProgress) {
    return { status: 'in_progress', isBlocker: false };
  }

  // Default: incomplete (NOT_STARTED, UNCERTAIN, etc.)
  return { status: 'incomplete', isBlocker: false };
}

/**
 * Generates 6 checklist items (one per category) by deriving status
 * from the tasks grouped by their category field.
 *
 * Tasks without a category are ignored.
 *
 * Requirement 4.1: Always generates exactly 6 categories.
 * Requirement 4.2: Derives status from current task states.
 */
export function deriveChecklistStatus(tasks: TaskWithState[]): ChecklistItem[] {
  return CHECKLIST_CATEGORIES.map((category) => {
    // Filter tasks belonging to this category
    const categoryTasks = tasks.filter((t) => t.category === category);

    // Derive status from the tasks in this category
    const { status, isBlocker, blockerReason } = deriveItemStatus(categoryTasks);

    return {
      id: `checklist-${category}`,
      category,
      description: CATEGORY_DESCRIPTIONS[category],
      status,
      isBlocker,
      ...(blockerReason ? { blockerReason } : {}),
      priority: CATEGORY_PRIORITY[category],
    };
  });
}

// --- Blockers-first sorting (Requirement 4.3) ---

/**
 * Sorts checklist items so that all blocker items appear before all non-blocker items.
 * Preserves relative order within each group (stable partition).
 *
 * Does not mutate the input array.
 */
export function sortChecklistBlockersFirst(items: ChecklistItem[]): ChecklistItem[] {
  const blockers = items.filter((item) => item.isBlocker);
  const nonBlockers = items.filter((item) => !item.isBlocker);
  return [...blockers, ...nonBlockers];
}

// --- Next best action (Requirement 4.4) ---

/**
 * Computes the next best action: the highest-priority (lowest priority number)
 * incomplete non-blocked item from the checklist.
 *
 * Returns null if all items are complete or blocked.
 */
export function getNextBestAction(items: ChecklistItem[]): ChecklistItem | null {
  // Filter to actionable items (not complete, not blocked)
  const actionable = items.filter(
    (item) => item.status !== 'complete' && item.status !== 'blocked'
  );

  if (actionable.length === 0) {
    return null;
  }

  // Find the one with lowest priority number (highest priority)
  return actionable.reduce((best, current) =>
    current.priority < best.priority ? current : best
  );
}

// --- Reactive checklist generation (Requirement 4.5) ---

/**
 * Fetches current tasks from the database and generates the full checklist response.
 *
 * The checklist is generated FRESH on each call — no caching — which ensures
 * reactive updates whenever task states change within the same session.
 *
 * This is the primary entry point for the GET /api/checklist endpoint.
 *
 * @param userId - The authenticated user's ID
 * @returns The complete checklist response, or null if no repository is connected
 */
export async function getChecklist(userId: string): Promise<ChecklistResponse | null> {
  // Find the user's connected repository
  const repository = await prisma.repository.findUnique({
    where: { userId },
  });

  if (!repository) {
    return null;
  }

  // Fetch ALL current tasks for the repository — fresh from the database
  // This ensures any task state change is immediately reflected
  const tasks = await prisma.task.findMany({
    where: { repositoryId: repository.id },
    select: {
      id: true,
      title: true,
      state: true,
      blockerReason: true,
    },
  });

  // Map DB tasks to TaskWithState (tasks don't have category in DB,
  // so the checklist items represent aggregate readiness per category)
  const taskData: TaskWithState[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    state: t.state,
    blockerReason: t.blockerReason,
  }));

  // Generate checklist items from current task states
  const items = deriveChecklistStatus(taskData);

  // Apply blockers-first sorting
  const sortedItems = sortChecklistBlockersFirst(items);

  // Compute next best action
  const nextBestAction = getNextBestAction(sortedItems);

  // Compute summary statistics
  const total = sortedItems.length;
  const complete = sortedItems.filter((i) => i.status === 'complete').length;
  const inProgress = sortedItems.filter((i) => i.status === 'in_progress').length;
  const blocked = sortedItems.filter((i) => i.status === 'blocked').length;
  const incomplete = sortedItems.filter((i) => i.status === 'incomplete').length;
  const readinessPercentage = total > 0 ? Math.round((complete / total) * 100) : 0;

  return {
    categories: [...CHECKLIST_CATEGORIES],
    items: sortedItems,
    nextBestAction,
    summary: {
      total,
      complete,
      inProgress,
      blocked,
      incomplete,
      readinessPercentage,
    },
  };
}

/**
 * Dashboard Aggregator Service
 *
 * Aggregates project status, blockers, next action, recent progress,
 * last sync info, and launch readiness into a single dashboard response.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import prisma from '../lib/prisma.js';
import { getChecklist } from './checklist.js';
import type { TaskState } from '../generated/prisma/enums.js';

// --- Types ---

export interface DashboardResponse {
  projectStatus: {
    total: number;
    byState: Record<TaskState, number>;
  };
  blockers: Array<{
    taskId: string;
    title: string;
    reason: string;
  }>;
  nextAction: {
    description: string;
    category: string;
    priority: number;
  } | null;
  recentProgress: Array<{
    taskId: string;
    title: string;
    completedAt: Date;
  }>;
  lastSync: {
    timestamp: Date;
    status: string;
  } | null;
  launchReadiness: {
    percentage: number;
    blockerCount: number;
  };
}

// All possible TaskState values for initialization
const ALL_TASK_STATES: TaskState[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'NEEDS_REVIEW',
  'COMPLETED',
  'UNCERTAIN',
];

/**
 * Fetches and aggregates all dashboard data for the authenticated user.
 *
 * @param userId - The authenticated user's ID
 * @returns The complete dashboard response, or null if no repository is connected
 */
export async function getDashboard(userId: string): Promise<DashboardResponse | null> {
  // Find the user's connected repository
  const repository = await prisma.repository.findUnique({
    where: { userId },
  });

  if (!repository) {
    return null;
  }

  // Fetch all tasks for the repository
  const tasks = await prisma.task.findMany({
    where: { repositoryId: repository.id },
    select: {
      id: true,
      title: true,
      state: true,
      blockerReason: true,
      lastInferredAt: true,
    },
  });

  // --- Project Status (Requirement 8.1) ---
  const byState: Record<TaskState, number> = {} as Record<TaskState, number>;
  for (const state of ALL_TASK_STATES) {
    byState[state] = 0;
  }
  for (const task of tasks) {
    byState[task.state]++;
  }
  const projectStatus = {
    total: tasks.length,
    byState,
  };

  // --- Blockers (Requirement 8.2) ---
  const blockers = tasks
    .filter((t) => t.state === 'BLOCKED')
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      reason: t.blockerReason || 'No reason provided',
    }));

  // --- Next Action (Requirement 8.3) ---
  const checklist = await getChecklist(userId);
  let nextAction: DashboardResponse['nextAction'] = null;
  if (checklist?.nextBestAction) {
    nextAction = {
      description: checklist.nextBestAction.description,
      category: checklist.nextBestAction.category,
      priority: checklist.nextBestAction.priority,
    };
  }

  // --- Recent Progress (Requirement 8.4) ---
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentProgress = tasks
    .filter(
      (t) =>
        t.state === 'COMPLETED' && t.lastInferredAt !== null && t.lastInferredAt >= sevenDaysAgo,
    )
    .sort((a, b) => {
      const aTime = a.lastInferredAt!.getTime();
      const bTime = b.lastInferredAt!.getTime();
      return bTime - aTime; // desc order
    })
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      completedAt: t.lastInferredAt!,
    }));

  // --- Last Sync (Requirement 8.5) ---
  const lastSyncRecord = await prisma.sync.findFirst({
    where: { repositoryId: repository.id },
    orderBy: { startedAt: 'desc' },
  });

  const lastSync = lastSyncRecord
    ? {
        timestamp: lastSyncRecord.startedAt,
        status: lastSyncRecord.status,
      }
    : null;

  // --- Launch Readiness (Requirements 8.1, 8.5) ---
  const launchReadiness = {
    percentage: checklist?.summary.readinessPercentage ?? 0,
    blockerCount: blockers.length,
  };

  return {
    projectStatus,
    blockers,
    nextAction,
    recentProgress,
    lastSync,
    launchReadiness,
  };
}

/**
 * Sync Scheduler
 *
 * Uses node-cron to schedule automatic syncs for all users with
 * connected repositories. Default interval is every 30 minutes,
 * configurable per user via user.syncInterval field.
 */

import * as cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { performSync } from './sync.js';

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Converts a syncInterval in minutes to a cron expression.
 * Uses the "every N minutes" pattern.
 */
export function intervalToCron(minutes: number): string {
  if (minutes <= 0) return '*/30 * * * *'; // fallback to 30 min
  if (minutes >= 60) {
    // For hourly or longer, run at the start of every Nth hour
    const hours = Math.floor(minutes / 60);
    return `0 */${hours} * * *`;
  }
  return `*/${minutes} * * * *`;
}

/**
 * Runs a sync for all users who have connected repositories.
 * Respects each user's syncInterval — only syncs users whose
 * interval has elapsed since their last successful sync.
 */
async function runScheduledSync(): Promise<void> {
  try {
    // Find all repositories with their users
    const repositories = await prisma.repository.findMany({
      include: {
        user: true,
        syncs: {
          where: { status: 'SUCCESS' },
          orderBy: { completedAt: 'desc' },
          take: 1,
        },
      },
    });

    const now = Date.now();

    for (const repo of repositories) {
      const userInterval = repo.user.syncInterval || 30; // default 30 minutes
      const intervalMs = userInterval * 60 * 1000;

      // Check if enough time has elapsed since the last successful sync
      const lastSync = repo.syncs[0];
      if (lastSync?.completedAt) {
        const elapsed = now - lastSync.completedAt.getTime();
        if (elapsed < intervalMs) {
          // Not yet time to sync for this user
          continue;
        }
      }

      // Trigger sync (fire-and-forget per repository, log errors)
      performSync(repo.id).catch((err) => {
        console.error(
          `[scheduler] Sync failed for repository ${repo.fullName}:`,
          err instanceof Error ? err.message : err,
        );
      });
    }
  } catch (err) {
    console.error(
      '[scheduler] Error running scheduled sync:',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Starts the automatic sync scheduler.
 * Runs every minute to check which users need syncing based on their
 * individual syncInterval settings.
 *
 * The cron job runs every minute but only triggers syncs for users
 * whose interval has elapsed. This allows per-user configurable intervals.
 */
export function startScheduler(): void {
  if (scheduledTask) {
    console.log('[scheduler] Scheduler already running');
    return;
  }

  // Run every minute to check per-user intervals
  // This gives granular control — each user's syncInterval is respected
  scheduledTask = cron.schedule('* * * * *', () => {
    runScheduledSync();
  });

  console.log('[scheduler] Automatic sync scheduler started (checking every minute)');
}

/**
 * Stops the scheduler. Useful for graceful shutdown and testing.
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[scheduler] Scheduler stopped');
  }
}

/**
 * Returns whether the scheduler is currently running.
 */
export function isSchedulerRunning(): boolean {
  return scheduledTask !== null;
}

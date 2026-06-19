/**
 * Structured Logging Utility
 *
 * Writes structured logs to the SystemLog table with a consistent schema.
 * Logging is fire-and-forget safe — failures are caught and logged to console
 * without crashing the application.
 *
 * Requirements: 10.5
 */

import prisma from '../lib/prisma.js';

export type LogCategory = 'sync' | 'state_change' | 'content' | 'auth' | 'error';

export interface LogEntry {
  category: LogCategory;
  action: string;
  details: Record<string, unknown>;
  userId?: string;
}

/**
 * Write a structured log entry to the SystemLog table.
 * Handles errors gracefully — logging should never crash the app.
 */
export async function log(entry: LogEntry): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        category: entry.category,
        action: entry.action,
        details: entry.details,
        userId: entry.userId ?? null,
      },
    });
  } catch (error) {
    console.error('[logger] Failed to write log entry:', error);
  }
}

/** Log a sync-related event */
export async function logSync(userId: string, action: string, details: Record<string, unknown>): Promise<void> {
  return log({ category: 'sync', action, details, userId });
}

/** Log a state change event */
export async function logStateChange(userId: string, action: string, details: Record<string, unknown>): Promise<void> {
  return log({ category: 'state_change', action, details, userId });
}

/** Log a content-related event */
export async function logContent(userId: string, action: string, details: Record<string, unknown>): Promise<void> {
  return log({ category: 'content', action, details, userId });
}

/** Log an auth-related event */
export async function logAuth(userId: string | undefined, action: string, details: Record<string, unknown>): Promise<void> {
  return log({ category: 'auth', action, details, userId });
}

/** Log an error event */
export async function logError(userId: string | undefined, action: string, details: Record<string, unknown>): Promise<void> {
  return log({ category: 'error', action, details, userId });
}

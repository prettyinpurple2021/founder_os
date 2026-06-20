/**
 * User Notification Service
 *
 * Provides a mechanism to notify users when operations fail after all retries
 * are exhausted. Supports two delivery channels:
 *
 * 1. API Response Field: A `notification` field in error responses that tells
 *    the user what failed, whether it's retryable, and what they can do.
 *
 * 2. In-App Notification Storage: Persists notifications in the SystemLog table
 *    (category: "notification") so users can see them on next page load.
 *
 * Requirements: 11.3 — IF all retries are exhausted, THEN THE System SHALL
 * log the failure and present a clear error message to the User.
 */

import prisma from '../lib/prisma.js';

/**
 * Severity levels for user notifications.
 */
export type NotificationSeverity = 'info' | 'warning' | 'error';

/**
 * Structure of a user-facing notification.
 * Designed to be included in API responses and stored for in-app display.
 */
export interface UserNotification {
  /** Unique identifier for the notification */
  id: string;
  /** What operation failed */
  title: string;
  /** Human-readable description of the failure and what the user can do */
  message: string;
  /** Severity level */
  severity: NotificationSeverity;
  /** Whether the user can retry the operation */
  retryable: boolean;
  /** Suggested action the user can take */
  actionHint?: string;
  /** The operation that failed (machine-readable) */
  operation: string;
  /** When the notification was created */
  timestamp: string;
  /** Whether the notification has been read/dismissed by the user */
  read: boolean;
}

/**
 * Options for creating a notification.
 */
export interface CreateNotificationOptions {
  /** The user ID to notify */
  userId: string;
  /** What operation failed (machine-readable, e.g., "sync", "content_generation") */
  operation: string;
  /** Human-readable title of the failure */
  title: string;
  /** Detailed message explaining what happened and what the user can do */
  message: string;
  /** Severity level (default: "error") */
  severity?: NotificationSeverity;
  /** Whether the operation can be retried (default: true) */
  retryable?: boolean;
  /** Suggested next action for the user */
  actionHint?: string;
}

/**
 * Creates a user notification and stores it in the SystemLog table.
 * This serves as the in-app notification store — users can retrieve
 * their notifications on next page load.
 *
 * @param options - The notification details
 * @returns The created notification
 */
export async function createNotification(
  options: CreateNotificationOptions,
): Promise<UserNotification> {
  const {
    userId,
    operation,
    title,
    message,
    severity = 'error',
    retryable = true,
    actionHint,
  } = options;

  try {
    const logEntry = await prisma.systemLog.create({
      data: {
        category: 'notification',
        action: `operation_failed:${operation}`,
        details: {
          title,
          message,
          severity,
          retryable,
          actionHint: actionHint ?? null,
          operation,
          read: false,
        },
        userId,
      },
    });

    return {
      id: logEntry.id,
      title,
      message,
      severity,
      retryable,
      actionHint,
      operation,
      timestamp: logEntry.timestamp.toISOString(),
      read: false,
    };
  } catch (error) {
    // Notification creation should never crash the application
    console.error('[notification] Failed to create notification:', error);

    // Return a transient notification that won't be persisted
    return {
      id: `transient-${Date.now()}`,
      title,
      message,
      severity,
      retryable,
      actionHint,
      operation,
      timestamp: new Date().toISOString(),
      read: false,
    };
  }
}

/**
 * Retrieves unread notifications for a user.
 * Returns notifications ordered by most recent first.
 *
 * @param userId - The user's ID
 * @param limit - Maximum number of notifications to return (default: 20)
 * @returns Array of user notifications
 */
export async function getUnreadNotifications(
  userId: string,
  limit = 20,
): Promise<UserNotification[]> {
  const logs = await prisma.systemLog.findMany({
    where: {
      userId,
      category: 'notification',
      details: {
        path: ['read'],
        equals: false,
      },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return logs.map(mapLogToNotification);
}

/**
 * Retrieves all notifications for a user (both read and unread).
 * Returns notifications ordered by most recent first.
 *
 * @param userId - The user's ID
 * @param limit - Maximum number of notifications to return (default: 50)
 * @returns Array of user notifications
 */
export async function getAllNotifications(userId: string, limit = 50): Promise<UserNotification[]> {
  const logs = await prisma.systemLog.findMany({
    where: {
      userId,
      category: 'notification',
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return logs.map(mapLogToNotification);
}

/**
 * Marks a notification as read/dismissed.
 *
 * @param notificationId - The notification (SystemLog entry) ID
 * @param userId - The user's ID (for authorization check)
 * @returns true if the notification was found and updated
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<boolean> {
  const existing = await prisma.systemLog.findFirst({
    where: {
      id: notificationId,
      userId,
      category: 'notification',
    },
  });

  if (!existing) {
    return false;
  }

  const details = existing.details as Record<string, unknown>;
  await prisma.systemLog.update({
    where: { id: notificationId },
    data: {
      details: { ...details, read: true },
    },
  });

  return true;
}

/**
 * Marks all notifications as read for a user.
 *
 * @param userId - The user's ID
 * @returns The number of notifications marked as read
 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const unread = await prisma.systemLog.findMany({
    where: {
      userId,
      category: 'notification',
      details: {
        path: ['read'],
        equals: false,
      },
    },
  });

  for (const entry of unread) {
    const details = entry.details as Record<string, unknown>;
    await prisma.systemLog.update({
      where: { id: entry.id },
      data: {
        details: { ...details, read: true },
      },
    });
  }

  return unread.length;
}

/**
 * Builds a notification object suitable for including in an API error response.
 * This is the "API response field" part of the notification mechanism.
 *
 * Use this to enrich error responses with user-actionable information
 * when operations fail after retries.
 *
 * @param operation - The operation that failed
 * @param message - Human-readable description
 * @param retryable - Whether the operation can be retried
 * @param actionHint - What the user can do next
 * @returns A notification payload for API responses
 */
export function buildResponseNotification(
  operation: string,
  message: string,
  retryable: boolean,
  actionHint?: string,
): Pick<
  UserNotification,
  'title' | 'message' | 'severity' | 'retryable' | 'actionHint' | 'operation' | 'timestamp'
> {
  return {
    title: `${formatOperationName(operation)} failed`,
    message,
    severity: 'error',
    retryable,
    actionHint,
    operation,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Maps a SystemLog entry to a UserNotification object.
 */
function mapLogToNotification(logEntry: {
  id: string;
  details: unknown;
  timestamp: Date;
}): UserNotification {
  const details = logEntry.details as Record<string, unknown>;

  return {
    id: logEntry.id,
    title: (details.title as string) || 'Operation failed',
    message: (details.message as string) || 'An operation failed. Please try again.',
    severity: (details.severity as NotificationSeverity) || 'error',
    retryable: (details.retryable as boolean) ?? true,
    actionHint: (details.actionHint as string) || undefined,
    operation: (details.operation as string) || 'unknown',
    timestamp: logEntry.timestamp.toISOString(),
    read: (details.read as boolean) ?? false,
  };
}

/**
 * Converts a machine-readable operation name to a human-friendly title.
 * e.g., "sync" → "Sync", "content_generation" → "Content generation"
 */
function formatOperationName(operation: string): string {
  return operation.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

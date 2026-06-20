// Requirements: 2.2
// Manual sync trigger button with loading state and last-synced timestamp

import { useState, useEffect, useCallback } from 'react';
import { syncApi, ApiError } from '../lib/api';
import type { SyncStatus } from '../lib/api';

/** Format a timestamp as relative time (e.g., "5 minutes ago") with absolute fallback */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  // Fallback to absolute time for older timestamps
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export default function SyncButton() {
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch initial sync status on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const status: SyncStatus = await syncApi.getStatus();
        if (!cancelled) {
          setLastSyncAt(status.lastSyncAt);
          if (status.status === 'in_progress') {
            setSyncState('syncing');
          }
        }
      } catch {
        // Silently handle fetch errors on mount - component still usable
      }
    }

    void fetchStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear success/error indicator after 5 seconds
  useEffect(() => {
    if (syncState === 'success' || syncState === 'error') {
      const timer = setTimeout(() => {
        setSyncState('idle');
        setErrorMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [syncState]);

  const handleSync = useCallback(async () => {
    if (syncState === 'syncing') return;

    setSyncState('syncing');
    setErrorMessage(null);

    try {
      const result = await syncApi.trigger();
      setLastSyncAt(result.completedAt);
      setSyncState(result.status === 'success' ? 'success' : 'error');
      if (result.status === 'failed' && result.errorMessage) {
        setErrorMessage(result.errorMessage);
      }
    } catch (err: unknown) {
      setSyncState('error');
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Sync failed. Please try again.');
      }
    }
  }, [syncState]);

  const isSyncing = syncState === 'syncing';

  return (
    <div className="px-4 py-3 border-t border-gray-200">
      {/* Sync button */}
      <button
        onClick={() => void handleSync()}
        disabled={isSyncing}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isSyncing
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : syncState === 'success'
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : syncState === 'error'
                ? 'bg-red-50 text-red-700 hover:bg-red-100'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
        }`}
        aria-label={isSyncing ? 'Syncing in progress' : 'Sync now'}
        aria-busy={isSyncing}
      >
        {/* Icon / spinner */}
        {isSyncing ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : syncState === 'success' ? (
          <span aria-hidden="true">✓</span>
        ) : syncState === 'error' ? (
          <span aria-hidden="true">✕</span>
        ) : (
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        )}

        {/* Button label */}
        <span>
          {isSyncing
            ? 'Syncing…'
            : syncState === 'success'
              ? 'Synced'
              : syncState === 'error'
                ? 'Sync failed'
                : 'Sync Now'}
        </span>
      </button>

      {/* Last synced timestamp */}
      {lastSyncAt && (
        <p className="mt-2 text-xs text-gray-500 text-center" aria-live="polite">
          Last synced: {formatRelativeTime(lastSyncAt)}
        </p>
      )}

      {/* Error message */}
      {errorMessage && (
        <p className="mt-1 text-xs text-red-600 text-center" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

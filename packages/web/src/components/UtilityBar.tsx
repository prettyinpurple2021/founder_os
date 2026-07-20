// Requirements: 4.3, 7.7
// Top-aligned utility bar containing sync status indicator and user controls

import clsx from 'clsx';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'failed';

export interface UtilityBarProps {
  syncStatus?: SyncStatus;
  userName?: string;
  className?: string;
}

const syncStatusConfig: Record<SyncStatus, { color: string; label: string; pulse: boolean }> = {
  idle: { color: 'bg-chrome-steel', label: 'Idle', pulse: false },
  syncing: { color: 'bg-hyper-cyan', label: 'Syncing', pulse: true },
  success: { color: 'bg-launch-lime', label: 'Synced', pulse: false },
  failed: { color: 'bg-alert-red', label: 'Sync failed', pulse: false },
};

export function UtilityBar({ syncStatus = 'idle', userName, className }: UtilityBarProps) {
  const statusConfig = syncStatusConfig[syncStatus];

  return (
    <header
      className={clsx(
        'h-14 bg-carbon border-b border-graphite flex items-center justify-between px-6',
        className,
      )}
    >
      {/* Sync status indicator */}
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'inline-block h-2 w-2 rounded-full',
            statusConfig.color,
            statusConfig.pulse && 'animate-pulse',
          )}
          aria-hidden="true"
        />
        <span className="text-small text-text-secondary">{statusConfig.label}</span>
      </div>

      {/* User controls */}
      <div className="flex items-center gap-4">
        {userName && (
          <span className="text-small text-text-secondary truncate max-w-[160px]">
            {userName}
          </span>
        )}
      </div>
    </header>
  );
}

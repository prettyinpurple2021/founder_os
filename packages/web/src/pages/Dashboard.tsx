// Requirements: 8.1, 8.2, 8.3, 8.4
// Dashboard page - action-oriented main view showing project status, blockers,
// next action, recent progress, and last sync indicator

import { useEffect, useState } from 'react';
import { get } from '../lib/api';

type TaskState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'NEEDS_REVIEW'
  | 'COMPLETED'
  | 'UNCERTAIN';

interface ProjectStatus {
  total: number;
  byState: Record<TaskState, number>;
}

interface Blocker {
  taskId: string;
  title: string;
  reason: string;
}

interface NextAction {
  description: string;
  category: string;
  priority: number;
}

interface RecentProgressItem {
  taskId: string;
  title: string;
  completedAt: string;
}

interface LastSync {
  timestamp: string;
  status: string;
}

interface LaunchReadiness {
  percentage: number;
  blockerCount: number;
}

interface DashboardData {
  projectStatus: ProjectStatus;
  blockers: Blocker[];
  nextAction: NextAction | null;
  recentProgress: RecentProgressItem[];
  lastSync: LastSync | null;
  launchReadiness: LaunchReadiness;
}

const STATE_LABELS: Record<TaskState, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  NEEDS_REVIEW: 'Needs Review',
  COMPLETED: 'Completed',
  UNCERTAIN: 'Uncertain',
};

const STATE_COLORS: Record<TaskState, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  BLOCKED: 'bg-red-100 text-red-700',
  NEEDS_REVIEW: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  UNCERTAIN: 'bg-purple-100 text-purple-700',
};

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      try {
        setLoading(true);
        setError(null);
        const result = await get<DashboardData>('/api/dashboard');
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-sm font-medium text-red-800">Unable to load dashboard</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!data || data.projectStatus.total === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">🚀</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Launch OS</h2>
        <p className="text-gray-600 mb-6">
          Connect your GitHub repository to start tracking your launch readiness.
        </p>
        <a
          href="/settings"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
        >
          Connect a Repository
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with sync indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <SyncIndicator lastSync={data.lastSync} />
      </div>

      {/* Next Action Card — the most important element */}
      {data.nextAction && <NextActionCard action={data.nextAction} />}

      {/* Project Status + Launch Readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ProjectStatusCard status={data.projectStatus} readiness={data.launchReadiness} />
        </div>
        <div>
          <BlockersList blockers={data.blockers} />
        </div>
      </div>

      {/* Recent Progress */}
      <RecentProgressList items={data.recentProgress} />
    </div>
  );
}

function SyncIndicator({ lastSync }: { lastSync: LastSync | null }) {
  if (!lastSync) {
    return <span className="text-xs text-gray-400">No sync data available</span>;
  }

  const isSuccess = lastSync.status === 'SUCCESS';

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span
        className={`inline-block h-2 w-2 rounded-full ${isSuccess ? 'bg-green-400' : 'bg-red-400'}`}
      />
      <span>
        Last synced {formatRelativeDate(lastSync.timestamp)}
        {!isSuccess && <span className="ml-1 text-red-500 font-medium">(failed)</span>}
      </span>
    </div>
  );
}

function NextActionCard({ action }: { action: NextAction }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-start gap-3">
        <span className="text-xl">⚡</span>
        <div className="flex-1">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
            Next Action
          </p>
          <p className="text-base font-medium text-gray-900">{action.description}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
              {action.category}
            </span>
            <span className="text-xs text-gray-500">Priority {action.priority}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectStatusCard({
  status,
  readiness,
}: {
  status: ProjectStatus;
  readiness: LaunchReadiness;
}) {
  const states: TaskState[] = [
    'COMPLETED',
    'IN_PROGRESS',
    'NEEDS_REVIEW',
    'NOT_STARTED',
    'BLOCKED',
    'UNCERTAIN',
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">Project Status</h3>
        <div className="text-right">
          <span className="text-2xl font-bold text-gray-900">{readiness.percentage}%</span>
          <p className="text-xs text-gray-500">launch ready</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 rounded-full mb-4">
        <div
          className="h-2 bg-green-500 rounded-full transition-all"
          style={{ width: `${Math.min(readiness.percentage, 100)}%` }}
        />
      </div>

      {/* State counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {states.map((state) => (
          <div key={state} className={`rounded px-3 py-2 text-center ${STATE_COLORS[state]}`}>
            <div className="text-lg font-semibold">{status.byState[state] ?? 0}</div>
            <div className="text-xs">{STATE_LABELS[state]}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-500">{status.total} total tasks tracked</p>
    </div>
  );
}

function BlockersList({ blockers }: { blockers: Blocker[] }) {
  if (blockers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5 h-full">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Blockers</h3>
        <div className="text-center py-6">
          <span className="text-2xl">✨</span>
          <p className="text-sm text-gray-500 mt-2">No active blockers</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-100 bg-white p-5 h-full">
      <h3 className="text-sm font-medium text-red-700 mb-3">🚧 Blockers ({blockers.length})</h3>
      <ul className="space-y-3">
        {blockers.map((blocker) => (
          <li key={blocker.taskId} className="border-l-2 border-red-300 pl-3">
            <p className="text-sm font-medium text-gray-900">{blocker.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{blocker.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentProgressList({ items }: { items: RecentProgressItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Recent Progress</h3>
        <p className="text-sm text-gray-500">No tasks completed in the last 7 days.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Recent Progress (last 7 days)</h3>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.taskId} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span className="text-sm text-gray-800">{item.title}</span>
            </div>
            <span className="text-xs text-gray-400">{formatDate(item.completedAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

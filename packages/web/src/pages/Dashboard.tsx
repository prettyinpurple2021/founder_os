// Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 14.2, 14.4, 14.5
// Dashboard page - action-oriented main view showing project status, blockers,
// next action, recent progress, and last sync indicator
// Styled with LaunchChrome™ design system

import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { Card } from '../components/ui/Card';
import { DiamondEdgePanel } from '../components/ui/DiamondEdgePanel';
import { ProgressRail } from '../components/ui/ProgressRail';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { useCountUp } from '../hooks/useCountUp';

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
  NOT_STARTED: 'bg-chrome-steel/10 text-chrome-silver',
  IN_PROGRESS: 'bg-hyper-cyan/10 text-hyper-cyan',
  BLOCKED: 'bg-alert-red/10 text-alert-red',
  NEEDS_REVIEW: 'bg-warning-amber/10 text-warning-amber',
  COMPLETED: 'bg-launch-lime/10 text-launch-lime',
  UNCERTAIN: 'bg-plasma-violet/10 text-plasma-violet',
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
      <div className="space-y-6">
        <Skeleton variant="text" lines={1} />
        <Skeleton variant="card" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton variant="card" className="lg:col-span-2" />
          <Skeleton variant="card" />
        </div>
        <Skeleton variant="card" />
      </div>
    );
  }

  if (error) {
    return (
      <Card accent="red">
        <h3 className="text-small font-medium text-alert-red">Unable to load dashboard</h3>
        <p className="mt-1 text-small text-text-secondary">{error}</p>
      </Card>
    );
  }

  if (!data || data.projectStatus.total === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">🚀</div>
        <h2 className="font-display text-h2 text-chrome-white mb-2">Welcome to Launch OS</h2>
        <p className="text-text-secondary mb-6">
          Connect your GitHub repository to start tracking your launch readiness.
        </p>
        <a
          href="/settings"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-founder-pink text-chrome-white rounded-md font-medium shadow-glow-pink hover:bg-neon-magenta transition-colors"
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
        <h2 className="font-display text-h2 text-chrome-white">Dashboard</h2>
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
    return <span className="text-caption text-text-muted">No sync data available</span>;
  }

  const isSuccess = lastSync.status === 'SUCCESS';

  return (
    <div className="flex items-center gap-2 text-caption text-text-muted">
      <span
        className={`inline-block h-2 w-2 rounded-full ${isSuccess ? 'bg-launch-lime' : 'bg-alert-red'}`}
      />
      <span>
        Last synced {formatRelativeDate(lastSync.timestamp)}
        {!isSuccess && <span className="ml-1 text-alert-red font-medium">(failed)</span>}
      </span>
    </div>
  );
}

function NextActionCard({ action }: { action: NextAction }) {
  return (
    <DiamondEdgePanel>
      <p className="text-caption font-medium text-founder-pink uppercase tracking-wide mb-1">Next Action</p>
      <p className="text-body font-medium text-text-primary">{action.description}</p>
      <div className="mt-2 flex items-center gap-3">
        <Badge color="cyan">{action.category}</Badge>
        <span className="text-caption text-text-muted">Priority {action.priority}</span>
      </div>
    </DiamondEdgePanel>
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

  const animatedPercentage = useCountUp({ end: readiness.percentage });

  return (
    <Card variant="default">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-small font-medium text-text-primary">Project Status</h3>
        <div className="text-right">
          <span className="font-display text-h2 text-chrome-white tabular-nums">{animatedPercentage}%</span>
          <p className="text-caption text-text-muted">launch ready</p>
        </div>
      </div>

      {/* Progress bar */}
      <ProgressRail value={readiness.percentage} showPercentage />

      {/* State counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
        {states.map((state) => (
          <div key={state} className={`rounded-md px-3 py-2 text-center ${STATE_COLORS[state]}`}>
            <div className="text-lg font-semibold">{status.byState[state] ?? 0}</div>
            <div className="text-caption">{STATE_LABELS[state]}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-caption text-text-muted">{status.total} total tasks tracked</p>
    </Card>
  );
}

function BlockersList({ blockers }: { blockers: Blocker[] }) {
  if (blockers.length === 0) {
    return (
      <Card variant="default" className="h-full">
        <h3 className="text-small font-medium text-text-primary mb-3">Blockers</h3>
        <div className="text-center py-6">
          <span className="text-2xl">✨</span>
          <p className="text-small text-text-muted mt-2">No active blockers</p>
        </div>
      </Card>
    );
  }

  return (
    <Card accent="red" className="h-full">
      <h3 className="text-small font-medium text-alert-red mb-3">🚧 Blockers ({blockers.length})</h3>
      <ul className="space-y-3">
        {blockers.map((blocker) => (
          <li key={blocker.taskId} className="border-l-2 border-alert-red pl-3">
            <p className="text-small font-medium text-text-primary">{blocker.title}</p>
            <p className="text-caption text-text-muted mt-0.5">{blocker.reason}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentProgressList({ items }: { items: RecentProgressItem[] }) {
  if (items.length === 0) {
    return (
      <Card variant="default">
        <h3 className="text-small font-medium text-text-primary mb-3">Recent Progress</h3>
        <p className="text-small text-text-muted">No tasks completed in the last 7 days.</p>
      </Card>
    );
  }

  return (
    <Card variant="default">
      <h3 className="text-small font-medium text-text-primary mb-3">Recent Progress (last 7 days)</h3>
      <ul className="divide-y divide-graphite">
        {items.map((item) => (
          <li key={item.taskId} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <span className="text-launch-lime">✓</span>
              <span className="text-small text-text-primary">{item.title}</span>
            </div>
            <span className="text-caption text-text-muted">{formatDate(item.completedAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

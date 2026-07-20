// Requirements: 4.1, 4.3, 12.1, 12.2, 14.4, 14.5
// Launch Readiness Checklist page — categorized view with blockers at top,
// progress indicators per category, and overall readiness percentage

import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

interface ChecklistItem {
  id: string;
  title: string;
  status: 'complete' | 'incomplete' | 'blocked';
  isBlocker: boolean;
  blockerReason?: string;
}

interface ChecklistCategory {
  name: string;
  items: ChecklistItem[];
  completedCount: number;
  totalCount: number;
}

interface ChecklistBlocker {
  id: string;
  title: string;
  category: string;
  blockerReason: string;
}

interface ChecklistData {
  categories: ChecklistCategory[];
  blockers: ChecklistBlocker[];
  nextAction: { description: string; category: string } | null;
  readinessPercentage: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  product: 'Product',
  quality: 'Quality',
  deployment: 'Deployment',
  legal_admin: 'Legal & Admin',
  marketing: 'Marketing',
  content: 'Content',
};

const CATEGORY_ICONS: Record<string, string> = {
  product: '📦',
  quality: '✅',
  deployment: '🚀',
  legal_admin: '📋',
  marketing: '📣',
  content: '✍️',
};

function getCategoryLabel(name: string): string {
  return CATEGORY_LABELS[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCategoryIcon(name: string): string {
  return CATEGORY_ICONS[name] ?? '📌';
}

export default function Checklist() {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchChecklist() {
      try {
        setLoading(true);
        setError(null);
        const result = await get<ChecklistData>('/api/checklist');
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load checklist data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchChecklist();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-founder-pink/20 border-t-founder-pink" />
          <p className="text-sm text-text-muted">Loading checklist...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card accent="red">
        <h3 className="text-sm font-medium text-alert-red">Unable to load checklist</h3>
        <p className="mt-1 text-sm text-text-secondary">{error}</p>
      </Card>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">📋</div>
        <h2 className="text-2xl font-display font-bold text-chrome-white mb-2">No Checklist Available</h2>
        <p className="text-text-secondary">
          Connect your repository and sync to generate your launch readiness checklist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with readiness percentage */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-chrome-white">Launch Checklist</h2>
        <ReadinessIndicator percentage={data.readinessPercentage} />
      </div>

      {/* Overall progress bar */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-text-secondary">Overall Launch Readiness</span>
          <span className="text-sm font-semibold text-chrome-white">{data.readinessPercentage}%</span>
        </div>
        <div className="w-full h-3 bg-graphite rounded-full">
          <div
            className={`h-3 rounded-full transition-all ${getProgressColor(data.readinessPercentage)}`}
            style={{ width: `${Math.min(data.readinessPercentage, 100)}%` }}
          />
        </div>
      </Card>

      {/* Next action */}
      {data.nextAction && <NextActionBanner action={data.nextAction} />}

      {/* Blockers section — always shown at the top */}
      {data.blockers.length > 0 && <BlockersSection blockers={data.blockers} />}

      {/* Categories with progress */}
      <div className="space-y-4">
        {data.categories.map((category) => (
          <CategoryCard key={category.name} category={category} />
        ))}
      </div>
    </div>
  );
}

function ReadinessIndicator({ percentage }: { percentage: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-10 w-10">
        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#232933"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={percentage >= 80 ? '#B7FF2A' : percentage >= 50 ? '#FFB547' : '#FF4D5F'}
            strokeWidth="3"
            strokeDasharray={`${percentage}, 100`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-chrome-white">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

function NextActionBanner({ action }: { action: { description: string; category: string } }) {
  return (
    <Card accent="cyan">
      <div className="flex items-start gap-3">
        <span className="text-lg">⚡</span>
        <div className="flex-1">
          <p className="text-xs font-medium text-hyper-cyan uppercase tracking-wide mb-1">
            Next Best Action
          </p>
          <p className="text-sm font-medium text-chrome-white">{action.description}</p>
          <span className="mt-1.5 inline-block">
            <Badge color="cyan">{getCategoryLabel(action.category)}</Badge>
          </span>
        </div>
      </div>
    </Card>
  );
}

function BlockersSection({ blockers }: { blockers: ChecklistBlocker[] }) {
  return (
    <Card accent="red">
      <h3 className="text-sm font-semibold text-alert-red mb-3 flex items-center gap-2">
        <span>🚧</span>
        Blockers ({blockers.length})
      </h3>
      <ul className="space-y-3">
        {blockers.map((blocker) => (
          <li
            key={blocker.id}
            className="flex items-start gap-3 bg-carbon rounded-md p-3 border border-graphite"
          >
            <span className="mt-0.5 text-alert-red flex-shrink-0">✕</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-chrome-white">{blocker.title}</p>
              <p className="text-xs text-text-muted mt-0.5">{blocker.blockerReason}</p>
              <span className="inline-block mt-1">
                <Badge color="red">{getCategoryLabel(blocker.category)}</Badge>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CategoryCard({ category }: { category: ChecklistCategory }) {
  const progressPercent =
    category.totalCount > 0 ? Math.round((category.completedCount / category.totalCount) * 100) : 0;

  return (
    <Card>
      {/* Category header with progress */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getCategoryIcon(category.name)}</span>
          <h3 className="text-sm font-semibold text-chrome-white">{getCategoryLabel(category.name)}</h3>
        </div>
        <span className="text-xs font-medium text-text-muted">
          {category.completedCount}/{category.totalCount} complete
        </span>
      </div>

      {/* Category progress bar */}
      <div className="w-full h-2 bg-graphite rounded-full mb-4">
        <div
          className={`h-2 rounded-full transition-all ${getProgressColor(progressPercent)}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Items list */}
      <ul className="space-y-2">
        {category.items.map((item) => (
          <ChecklistItemRow key={item.id} item={item} />
        ))}
      </ul>
    </Card>
  );
}

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex items-start gap-3 py-1.5">
      <StatusIcon status={item.status} />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm ${
            item.status === 'complete'
              ? 'text-text-muted line-through'
              : item.status === 'blocked'
                ? 'text-alert-red font-medium'
                : 'text-text-secondary'
          }`}
        >
          {item.title}
        </p>
        {item.isBlocker && item.blockerReason && (
          <p className="text-xs text-alert-red/80 mt-0.5">{item.blockerReason}</p>
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: 'complete' | 'incomplete' | 'blocked' }) {
  switch (status) {
    case 'complete':
      return (
        <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-launch-lime/10 text-launch-lime">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      );
    case 'blocked':
      return (
        <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-alert-red/10 text-alert-red">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      );
    case 'incomplete':
    default:
      return (
        <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-dark-chrome">
          {/* Empty circle */}
        </span>
      );
  }
}

function getProgressColor(percentage: number): string {
  if (percentage >= 80) return 'bg-launch-lime';
  if (percentage >= 50) return 'bg-warning-amber';
  if (percentage >= 25) return 'bg-warning-amber/70';
  return 'bg-alert-red';
}

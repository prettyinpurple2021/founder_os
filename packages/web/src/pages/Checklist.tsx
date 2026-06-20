// Requirements: 4.1, 4.3
// Launch Readiness Checklist page — categorized view with blockers at top,
// progress indicators per category, and overall readiness percentage

import { useEffect, useState } from 'react';
import { get } from '../lib/api';

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
          setError(
            err instanceof Error ? err.message : 'Failed to load checklist data'
          );
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading checklist...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-sm font-medium text-red-800">
          Unable to load checklist
        </h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">📋</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          No Checklist Available
        </h2>
        <p className="text-gray-600">
          Connect your repository and sync to generate your launch readiness checklist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with readiness percentage */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Launch Checklist</h2>
        <ReadinessIndicator percentage={data.readinessPercentage} />
      </div>

      {/* Overall progress bar */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Overall Launch Readiness
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {data.readinessPercentage}%
          </span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full">
          <div
            className={`h-3 rounded-full transition-all ${getProgressColor(data.readinessPercentage)}`}
            style={{ width: `${Math.min(data.readinessPercentage, 100)}%` }}
          />
        </div>
      </div>

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
            stroke="#e5e7eb"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={percentage >= 80 ? '#22c55e' : percentage >= 50 ? '#eab308' : '#ef4444'}
            strokeWidth="3"
            strokeDasharray={`${percentage}, 100`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-900">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

function NextActionBanner({ action }: { action: { description: string; category: string } }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-lg">⚡</span>
        <div className="flex-1">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
            Next Best Action
          </p>
          <p className="text-sm font-medium text-gray-900">{action.description}</p>
          <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
            {getCategoryLabel(action.category)}
          </span>
        </div>
      </div>
    </div>
  );
}

function BlockersSection({ blockers }: { blockers: ChecklistBlocker[] }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5">
      <h3 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2">
        <span>🚧</span>
        Blockers ({blockers.length})
      </h3>
      <ul className="space-y-3">
        {blockers.map((blocker) => (
          <li
            key={blocker.id}
            className="flex items-start gap-3 bg-white rounded-md p-3 border border-red-100"
          >
            <span className="mt-0.5 text-red-500 flex-shrink-0">✕</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{blocker.title}</p>
              <p className="text-xs text-gray-600 mt-0.5">{blocker.blockerReason}</p>
              <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
                {getCategoryLabel(blocker.category)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryCard({ category }: { category: ChecklistCategory }) {
  const progressPercent =
    category.totalCount > 0
      ? Math.round((category.completedCount / category.totalCount) * 100)
      : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      {/* Category header with progress */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getCategoryIcon(category.name)}</span>
          <h3 className="text-sm font-semibold text-gray-900">
            {getCategoryLabel(category.name)}
          </h3>
        </div>
        <span className="text-xs font-medium text-gray-500">
          {category.completedCount}/{category.totalCount} complete
        </span>
      </div>

      {/* Category progress bar */}
      <div className="w-full h-2 bg-gray-100 rounded-full mb-4">
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
    </div>
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
              ? 'text-gray-500 line-through'
              : item.status === 'blocked'
                ? 'text-red-700 font-medium'
                : 'text-gray-800'
          }`}
        >
          {item.title}
        </p>
        {item.isBlocker && item.blockerReason && (
          <p className="text-xs text-red-500 mt-0.5">{item.blockerReason}</p>
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: 'complete' | 'incomplete' | 'blocked' }) {
  switch (status) {
    case 'complete':
      return (
        <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-100 text-green-600">
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
        <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-100 text-red-600">
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
        <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-gray-300">
          {/* Empty circle */}
        </span>
      );
  }
}

function getProgressColor(percentage: number): string {
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 50) return 'bg-yellow-500';
  if (percentage >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}

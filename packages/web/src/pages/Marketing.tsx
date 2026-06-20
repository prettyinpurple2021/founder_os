// Requirements: 5.1, 5.2, 5.3
// Marketing readiness page: missing assets list, channel recommendations,
// mark-as-complete action, and overall readiness percentage

import { useEffect, useState, useCallback } from 'react';
import {
  marketingApi,
  type MarketingStatusResponse,
  type MissingAsset,
  type CompletedAsset,
  type ChannelRecommendation,
} from '../lib/api';

const EFFORT_COLORS: Record<MissingAsset['effort'], string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const EFFORT_LABELS: Record<MissingAsset['effort'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const CHANNEL_ICONS: Record<string, string> = {
  twitter: '𝕏',
  linkedin: '💼',
  hackernews: '🟠',
  producthunt: '🚀',
};

const EFFORT_ORDER: Record<MissingAsset['effort'], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export default function Marketing() {
  const [data, setData] = useState<MarketingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await marketingApi.getStatus();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketing status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleMarkComplete = async (asset: MissingAsset) => {
    if (!data) return;

    // Optimistic update
    setCompletingIds((prev) => new Set(prev).add(asset.id));

    const optimisticCompleted: CompletedAsset = {
      id: asset.id,
      type: asset.type,
      completedAt: new Date().toISOString(),
    };

    setData((prev) => {
      if (!prev) return prev;
      const updatedMissing = prev.missingAssets.filter((a) => a.id !== asset.id);
      const updatedCompleted = [...prev.completedAssets, optimisticCompleted];
      const totalAssets = updatedCompleted.length + updatedMissing.length;
      const readinessPercentage =
        totalAssets > 0 ? Math.round((updatedCompleted.length / totalAssets) * 100) : 0;
      return {
        ...prev,
        missingAssets: updatedMissing,
        completedAssets: updatedCompleted,
        readinessPercentage,
      };
    });

    try {
      await marketingApi.completeAsset(asset.id);
    } catch {
      // Revert on failure
      await fetchStatus();
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading marketing readiness...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-sm font-medium text-red-800">Unable to load marketing data</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
        <button
          onClick={fetchStatus}
          className="mt-3 text-sm font-medium text-red-700 hover:text-red-900 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const sortedMissing = [...data.missingAssets].sort(
    (a, b) => EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Marketing Readiness</h2>
        <ReadinessBadge percentage={data.readinessPercentage} />
      </div>

      {/* Readiness Progress */}
      <ReadinessProgress percentage={data.readinessPercentage} />

      {/* Missing Assets */}
      <MissingAssetsList
        assets={sortedMissing}
        completingIds={completingIds}
        onMarkComplete={handleMarkComplete}
      />

      {/* Completed Assets */}
      <CompletedAssetsList assets={data.completedAssets} />

      {/* Channel Recommendations */}
      <ChannelRecommendationsList recommendations={data.channelRecommendations} />
    </div>
  );
}

function ReadinessBadge({ percentage }: { percentage: number }) {
  const color =
    percentage >= 80
      ? 'bg-green-100 text-green-700'
      : percentage >= 50
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-red-100 text-red-700';

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${color}`}
    >
      {percentage}% ready
    </span>
  );
}

function ReadinessProgress({ percentage }: { percentage: number }) {
  const barColor =
    percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700">Overall Marketing Readiness</p>
        <p className="text-sm font-bold text-gray-900">{percentage}%</p>
      </div>
      <div className="w-full h-3 bg-gray-100 rounded-full">
        <div
          className={`h-3 rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

function MissingAssetsList({
  assets,
  completingIds,
  onMarkComplete,
}: {
  assets: MissingAsset[];
  completingIds: Set<string>;
  onMarkComplete: (asset: MissingAsset) => void;
}) {
  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎉</span>
          <p className="text-sm font-medium text-green-800">All marketing assets are complete!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-4">Missing Assets ({assets.length})</h3>
      <ul className="space-y-3">
        {assets.map((asset) => (
          <li
            key={asset.id}
            className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-gray-900">{asset.title}</p>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${EFFORT_COLORS[asset.effort]}`}
                >
                  {EFFORT_LABELS[asset.effort]}
                </span>
              </div>
              <p className="text-xs text-gray-500">{asset.description}</p>
            </div>
            <button
              onClick={() => onMarkComplete(asset)}
              disabled={completingIds.has(asset.id)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {completingIds.has(asset.id) ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Completing...
                </>
              ) : (
                <>
                  <span>✓</span>
                  Mark Complete
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompletedAssetsList({ assets }: { assets: CompletedAsset[] }) {
  if (assets.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-4">Completed Assets ({assets.length})</h3>
      <ul className="space-y-2">
        {assets.map((asset) => (
          <li key={asset.id} className="flex items-center gap-3 py-2">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-green-100 text-green-600 text-xs">
              ✓
            </span>
            <span className="text-sm text-gray-700 capitalize">
              {asset.type.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-gray-400 ml-auto">
              {new Date(asset.completedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelRecommendationsList({
  recommendations,
}: {
  recommendations: ChannelRecommendation[];
}) {
  if (recommendations.length === 0) return null;

  const sorted = [...recommendations].sort((a, b) => a.priority - b.priority);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-4">Recommended Channels</h3>
      <ul className="space-y-3">
        {sorted.map((rec) => (
          <li key={rec.channel} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
            <span className="text-lg shrink-0">{CHANNEL_ICONS[rec.channel] ?? '📢'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 capitalize">
                {rec.channel === 'hackernews'
                  ? 'Hacker News'
                  : rec.channel === 'producthunt'
                    ? 'Product Hunt'
                    : rec.channel.charAt(0).toUpperCase() + rec.channel.slice(1)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{rec.reason}</p>
            </div>
            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
              #{rec.priority}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

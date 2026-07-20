// Requirements: 5.1, 5.2, 5.3, 12.1, 12.4, 14.4, 14.5
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
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

const EFFORT_BADGE_COLORS: Record<MissingAsset['effort'], 'lime' | 'amber' | 'red'> = {
  low: 'lime',
  medium: 'amber',
  high: 'red',
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-founder-pink/30 border-t-founder-pink" />
          <p className="text-sm text-text-muted">Loading marketing readiness...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="default" accent="red">
        <h3 className="text-sm font-medium text-alert-red">Unable to load marketing data</h3>
        <p className="mt-1 text-sm text-text-secondary">{error}</p>
        <button
          onClick={fetchStatus}
          className="mt-3 text-sm font-medium text-alert-red hover:text-alert-red/80 underline"
        >
          Try again
        </button>
      </Card>
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
        <h2 className="text-2xl font-bold font-display text-chrome-white">Marketing Readiness</h2>
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
  const color: 'lime' | 'amber' | 'red' =
    percentage >= 80 ? 'lime' : percentage >= 50 ? 'amber' : 'red';

  return <Badge color={color}>{percentage}% ready</Badge>;
}

function ReadinessProgress({ percentage }: { percentage: number }) {
  const barColor =
    percentage >= 80
      ? 'bg-launch-lime'
      : percentage >= 50
        ? 'bg-warning-amber'
        : 'bg-alert-red';

  return (
    <Card variant="default">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-text-secondary">Overall Marketing Readiness</p>
        <p className="text-sm font-bold text-chrome-white">{percentage}%</p>
      </div>
      <div className="w-full h-3 bg-graphite rounded-full">
        <div
          className={`h-3 rounded-full motion-safe:transition-all motion-safe:duration-standard ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </Card>
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
      <Card variant="default" accent="lime">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎉</span>
          <p className="text-sm font-medium text-launch-lime">All marketing assets are complete!</p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default">
      <h3 className="text-sm font-medium text-chrome-white mb-4">
        Missing Assets ({assets.length})
      </h3>
      <ul className="space-y-3">
        {assets.map((asset) => (
          <li
            key={asset.id}
            className="flex items-start justify-between gap-4 rounded-lg border border-graphite p-4 bg-carbon hover:bg-gunmetal/80 motion-safe:transition-colors motion-safe:duration-fast"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-chrome-white">{asset.title}</p>
                <Badge color={EFFORT_BADGE_COLORS[asset.effort]}>
                  {EFFORT_LABELS[asset.effort]}
                </Badge>
              </div>
              <p className="text-xs text-text-muted">{asset.description}</p>
            </div>
            <button
              onClick={() => onMarkComplete(asset)}
              disabled={completingIds.has(asset.id)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-founder-pink text-chrome-white hover:bg-founder-pink/80 disabled:opacity-50 disabled:cursor-not-allowed motion-safe:transition-colors motion-safe:duration-fast focus:outline-none focus:ring-2 focus:ring-hyper-cyan focus:ring-offset-2 focus:ring-offset-carbon"
            >
              {completingIds.has(asset.id) ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-chrome-white/30 border-t-chrome-white" />
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
    </Card>
  );
}

function CompletedAssetsList({ assets }: { assets: CompletedAsset[] }) {
  if (assets.length === 0) return null;

  return (
    <Card variant="default">
      <h3 className="text-sm font-medium text-chrome-white mb-4">
        Completed Assets ({assets.length})
      </h3>
      <ul className="space-y-2">
        {assets.map((asset) => (
          <li key={asset.id} className="flex items-center gap-3 py-2">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-launch-lime/10 text-launch-lime text-xs">
              ✓
            </span>
            <span className="text-sm text-text-secondary capitalize">
              {asset.type.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-text-muted ml-auto">
              {new Date(asset.completedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
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
    <Card variant="default">
      <h3 className="text-sm font-medium text-chrome-white mb-4">Recommended Channels</h3>
      <ul className="space-y-3">
        {sorted.map((rec) => (
          <li key={rec.channel} className="flex items-start gap-3 p-3 rounded-lg bg-carbon">
            <span className="text-lg shrink-0">{CHANNEL_ICONS[rec.channel] ?? '📢'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-chrome-white capitalize">
                {rec.channel === 'hackernews'
                  ? 'Hacker News'
                  : rec.channel === 'producthunt'
                    ? 'Product Hunt'
                    : rec.channel.charAt(0).toUpperCase() + rec.channel.slice(1)}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{rec.reason}</p>
            </div>
            <Badge color="cyan">#{rec.priority}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

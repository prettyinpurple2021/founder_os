// Requirements: 6.1, 6.6
// Content drafts page: draft list with status filters, generate new draft form (platform selector)

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { contentApi, type ContentDraft, type DraftStatus, type Platform } from '../lib/api.js';

const STATUS_OPTIONS: Array<{ value: DraftStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'GENERATED', label: 'Generated' },
  { value: 'EDITING', label: 'Editing' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SCHEDULED', label: 'Scheduled' },
];

const STATUS_COLORS: Record<DraftStatus, string> = {
  GENERATED: 'bg-gray-100 text-gray-700',
  EDITING: 'bg-blue-100 text-blue-700',
  PENDING_APPROVAL: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COPIED: 'bg-green-100 text-green-700',
};

const STATUS_LABELS: Record<DraftStatus, string> = {
  GENERATED: 'Generated',
  EDITING: 'Editing',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SCHEDULED: 'Scheduled',
  COPIED: 'Copied',
};

const PLATFORM_COLORS: Record<Platform, string> = {
  TWITTER: 'bg-sky-100 text-sky-700',
  LINKEDIN: 'bg-blue-200 text-blue-900',
  BLOG: 'bg-emerald-100 text-emerald-700',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
  BLOG: 'Blog',
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateContent(content: string, maxLength = 100): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trimEnd() + '…';
}

export default function Content() {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DraftStatus | 'ALL'>('ALL');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('TWITTER');

  const fetchDrafts = useCallback(async (status?: DraftStatus) => {
    try {
      setLoading(true);
      setError(null);
      const result = await contentApi.getDrafts(status);
      setDrafts(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load content drafts'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const filter = statusFilter === 'ALL' ? undefined : statusFilter;
    void fetchDrafts(filter);
  }, [statusFilter, fetchDrafts]);

  const handleGenerate = useCallback(async () => {
    try {
      setGenerating(true);
      setGenerateError(null);
      await contentApi.generateDraft({ platform: selectedPlatform });
      const filter = statusFilter === 'ALL' ? undefined : statusFilter;
      await fetchDrafts(filter);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : 'Failed to generate draft'
      );
    } finally {
      setGenerating(false);
    }
  }, [selectedPlatform, statusFilter, fetchDrafts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Content Drafts</h2>
        <p className="mt-1 text-sm text-gray-600">
          Generate and manage build-in-public content from your shipped progress.
        </p>
      </div>

      {/* Generate New Draft Form */}
      <GenerateDraftForm
        selectedPlatform={selectedPlatform}
        onPlatformChange={setSelectedPlatform}
        onGenerate={handleGenerate}
        generating={generating}
        error={generateError}
      />

      {/* Status Filter Bar */}
      <StatusFilterBar
        selected={statusFilter}
        onChange={setStatusFilter}
      />

      {/* Drafts List */}
      <DraftsList
        drafts={drafts}
        loading={loading}
        error={error}
        onRetry={() => {
          const filter = statusFilter === 'ALL' ? undefined : statusFilter;
          void fetchDrafts(filter);
        }}
      />
    </div>
  );
}

function GenerateDraftForm({
  selectedPlatform,
  onPlatformChange,
  onGenerate,
  generating,
  error,
}: {
  selectedPlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
}) {
  const platforms: Platform[] = ['TWITTER', 'LINKEDIN', 'BLOG'];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-3">
        Generate New Draft
      </h3>
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Platform
          </label>
          <div className="flex gap-2" role="radiogroup" aria-label="Platform selector">
            {platforms.map((platform) => (
              <button
                key={platform}
                type="button"
                role="radio"
                aria-checked={selectedPlatform === platform}
                onClick={() => onPlatformChange(platform)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedPlatform === platform
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {PLATFORM_LABELS[platform]}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

function StatusFilterBar({
  selected,
  onChange,
}: {
  selected: DraftStatus | 'ALL';
  onChange: (status: DraftStatus | 'ALL') => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter drafts by status">
      {STATUS_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={selected === option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            selected === option.value
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DraftsList({
  drafts,
  loading,
  error,
  onRetry,
}: {
  drafts: ContentDraft[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading drafts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-sm font-medium text-red-800">
          Unable to load drafts
        </h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
        <button
          onClick={onRetry}
          className="mt-3 text-sm text-red-600 underline hover:text-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="text-center py-12 rounded-lg border border-gray-200 bg-white">
        <div className="text-3xl mb-3">📝</div>
        <h3 className="text-base font-medium text-gray-900 mb-1">
          No drafts yet
        </h3>
        <p className="text-sm text-gray-500">
          Generate your first build-in-public draft from shipped progress.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} />
      ))}
    </div>
  );
}

function DraftCard({ draft }: { draft: ContentDraft }) {
  return (
    <Link
      to={`/content/${draft.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[draft.platform]}`}
            >
              {PLATFORM_LABELS[draft.platform]}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[draft.status]}`}
            >
              {STATUS_LABELS[draft.status]}
            </span>
          </div>

          {/* Content preview truncated to ~100 chars */}
          <p className="text-sm text-gray-700 leading-relaxed">
            {truncateContent(draft.currentContent)}
          </p>
        </div>

        {/* Creation date */}
        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
          {formatDate(draft.createdAt)}
        </span>
      </div>
    </Link>
  );
}

// Requirements: 6.5, 7.4
// Rejected drafts queue view for reuse and learning.
// Displays full content (not truncated) with copy-to-clipboard.
// Never shows a delete button — rejected drafts are always preserved.

import { useState, useEffect, useCallback } from 'react';
import { contentApi, type ContentDraft, type Platform } from '../lib/api.js';

const platformLabels: Record<Platform, string> = {
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
  BLOG: 'Blog',
};

const platformIcons: Record<Platform, string> = {
  TWITTER: '🐦',
  LINKEDIN: '💼',
  BLOG: '📝',
};

interface CopyState {
  [draftId: string]: boolean;
}

export default function RejectedDrafts() {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyStates, setCopyStates] = useState<CopyState>({});

  const fetchRejectedDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await contentApi.getDrafts('REJECTED');
      setDrafts(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load rejected drafts';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRejectedDrafts();
  }, [fetchRejectedDrafts]);

  const handleCopy = useCallback(async (draft: ContentDraft) => {
    try {
      await navigator.clipboard.writeText(draft.currentContent);
      setCopyStates((prev) => ({ ...prev, [draft.id]: true }));
      // Reset copy state after 2 seconds
      setTimeout(() => {
        setCopyStates((prev) => ({ ...prev, [draft.id]: false }));
      }, 2000);
    } catch {
      // Fallback for environments where clipboard API is not available
      const textArea = document.createElement('textarea');
      textArea.value = draft.currentContent;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopyStates((prev) => ({ ...prev, [draft.id]: true }));
      setTimeout(() => {
        setCopyStates((prev) => ({ ...prev, [draft.id]: false }));
      }, 2000);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-3 text-gray-600">Loading rejected drafts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 text-sm">{error}</p>
        <button
          onClick={() => void fetchRejectedDrafts()}
          className="mt-2 text-sm text-red-600 underline hover:text-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📂</div>
        <p className="text-gray-500 font-medium">No rejected drafts yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Rejected drafts will appear here for future reference and reuse.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          {drafts.length} rejected {drafts.length === 1 ? 'draft' : 'drafts'} preserved for
          reference. Use the content below as inspiration for new drafts.
        </p>
      </div>

      <div className="space-y-4">
        {drafts.map((draft) => (
          <article
            key={draft.id}
            className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-base" aria-hidden="true">
                  {platformIcons[draft.platform]}
                </span>
                <span className="text-sm font-medium text-gray-700">
                  {platformLabels[draft.platform]}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  Rejected
                </span>
              </div>
              <time className="text-xs text-gray-400" dateTime={draft.updatedAt}>
                Rejected{' '}
                {new Date(draft.updatedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
            </div>

            {/* Full content body — not truncated */}
            <div className="px-4 py-3">
              <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
                {draft.currentContent}
              </p>
            </div>

            {/* Actions footer */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
              <button
                onClick={() => void handleCopy(draft)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  copyStates[draft.id]
                    ? 'bg-green-100 text-green-700'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                aria-label={`Copy content of rejected ${platformLabels[draft.platform]} draft`}
              >
                {copyStates[draft.id] ? (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Copy Content
                  </>
                )}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

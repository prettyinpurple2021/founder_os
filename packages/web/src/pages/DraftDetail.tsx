// Requirements: 6.3, 6.4, 7.1, 7.2
// Draft detail view: edit interface, version history sidebar, approve/reject/schedule actions

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { contentApi, type ContentDraft, type DraftVersion, type DraftStatus } from '../lib/api.js';

const STATUS_LABELS: Record<DraftStatus, string> = {
  GENERATED: 'Generated',
  EDITING: 'Editing',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SCHEDULED: 'Scheduled',
  COPIED: 'Copied',
};

const STATUS_COLORS: Record<DraftStatus, string> = {
  GENERATED: 'bg-gray-100 text-gray-700',
  EDITING: 'bg-blue-100 text-blue-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  SCHEDULED: 'bg-purple-100 text-purple-700',
  COPIED: 'bg-indigo-100 text-indigo-700',
};

const PLATFORM_LABELS: Record<string, string> = {
  TWITTER: 'Twitter / X',
  LINKEDIN: 'LinkedIn',
  BLOG: 'Blog Post',
};

const PLATFORM_ICONS: Record<string, string> = {
  TWITTER: '🐦',
  LINKEDIN: '💼',
  BLOG: '📝',
};

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isReadOnly(status: DraftStatus): boolean {
  return ['APPROVED', 'REJECTED', 'SCHEDULED', 'COPIED'].includes(status);
}

export default function DraftDetail() {
  const { id } = useParams<{ id: string }>();
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [editContent, setEditContent] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<DraftVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showScheduleInput, setShowScheduleInput] = useState(false);

  const fetchDraft = useCallback(async () => {
    if (!id) return;
    try {
      const drafts = await contentApi.getDrafts();
      const found = drafts.find((d) => d.id === id);
      if (!found) {
        setError('Draft not found');
        return;
      }
      setDraft(found);
      setEditContent(found.currentContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load draft');
    }
  }, [id]);

  const fetchVersions = useCallback(async () => {
    if (!id) return;
    try {
      const v = await contentApi.getVersions(id);
      setVersions(v);
    } catch {
      // Versions may not exist yet, don't block the page
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      await Promise.all([fetchDraft(), fetchVersions()]);
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [fetchDraft, fetchVersions]);

  const handleSave = async () => {
    if (!id || !draft) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await contentApi.editDraft(id, editContent);
      setDraft(updated);
      setSuccessMessage('Draft saved successfully');
      setSelectedVersion(null);
      await fetchVersions();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    setActionLoading('approve');
    setError(null);
    try {
      const updated = await contentApi.approveDraft(id);
      setDraft(updated);
      setSuccessMessage('Draft approved');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve draft');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    setActionLoading('reject');
    setError(null);
    try {
      const updated = await contentApi.rejectDraft(id, rejectReason || undefined);
      setDraft(updated);
      setShowRejectInput(false);
      setRejectReason('');
      setSuccessMessage('Draft rejected');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject draft');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSchedule = async () => {
    if (!id) return;
    setActionLoading('schedule');
    setError(null);
    try {
      const updated = await contentApi.scheduleDraft(id, scheduleDate || undefined);
      setDraft(updated);
      setShowScheduleInput(false);
      setScheduleDate('');
      setSuccessMessage('Draft scheduled');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule draft');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyContent = async () => {
    if (!draft) return;
    setActionLoading('copy');
    setError(null);
    try {
      await navigator.clipboard.writeText(draft.currentContent);
      // Also call schedule endpoint to mark as COPIED
      const updated = await contentApi.scheduleDraft(id!, undefined);
      setDraft(updated);
      setSuccessMessage('Content copied to clipboard');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy content');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReEdit = () => {
    // Allow editing the rejected content by setting the draft back to the edit view
    setSelectedVersion(null);
    setEditContent(draft?.currentContent ?? '');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading draft...</p>
        </div>
      </div>
    );
  }

  if (error && !draft) {
    return (
      <div className="space-y-4">
        <Link
          to="/content"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Drafts
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h3 className="text-sm font-medium text-red-800">Unable to load draft</h3>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  const readOnly = isReadOnly(draft.status);
  const charCount = editContent.length;
  const isTwitter = draft.platform === 'TWITTER';
  const charLimitExceeded = isTwitter && charCount > 280;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        to="/content"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Back to Drafts
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{PLATFORM_ICONS[draft.platform]}</span>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {PLATFORM_LABELS[draft.platform]} Draft
            </h2>
            <p className="text-sm text-gray-500">
              Created {formatDateTime(draft.createdAt)}
              {draft.updatedAt !== draft.createdAt && (
                <> · Updated {formatDateTime(draft.updatedAt)}</>
              )}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[draft.status]}`}>
          {STATUS_LABELS[draft.status]}
        </span>
      </div>

      {/* Success/Error messages */}
      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3">
          <p className="text-sm text-green-700">{successMessage}</p>
        </div>
      )}
      {error && draft && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Main content area with sidebar */}
      <div className="flex gap-6">
        {/* Editor / Content area */}
        <div className="flex-1 space-y-4">
          {/* Edit interface */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            {selectedVersion ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">
                    Version {selectedVersion.version} Preview
                  </h3>
                  <button
                    onClick={() => setSelectedVersion(null)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Back to current
                  </button>
                </div>
                <div className="bg-gray-50 rounded-md p-4 text-sm text-gray-800 whitespace-pre-wrap">
                  {selectedVersion.content}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Edited {formatDateTime(selectedVersion.editedAt)}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">
                    {readOnly ? 'Content' : 'Edit Content'}
                  </h3>
                  {isTwitter && (
                    <span
                      className={`text-xs font-medium ${
                        charLimitExceeded ? 'text-red-600' : 'text-gray-500'
                      }`}
                    >
                      {charCount}/280
                    </span>
                  )}
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  disabled={readOnly}
                  rows={isTwitter ? 4 : 10}
                  className={`w-full rounded-md border p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    readOnly
                      ? 'bg-gray-50 border-gray-200 text-gray-700 cursor-not-allowed'
                      : 'bg-white border-gray-300 text-gray-900'
                  } ${charLimitExceeded ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
                />
                {charLimitExceeded && (
                  <p className="mt-1 text-xs text-red-600">
                    Content exceeds Twitter's 280 character limit
                  </p>
                )}
                {!readOnly && (
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving || editContent === draft.currentContent || charLimitExceeded}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    {editContent !== draft.currentContent && (
                      <button
                        onClick={() => setEditContent(draft.currentContent)}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Discard changes
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Actions</h3>
            <DraftActions
              draft={draft}
              actionLoading={actionLoading}
              showRejectInput={showRejectInput}
              rejectReason={rejectReason}
              showScheduleInput={showScheduleInput}
              scheduleDate={scheduleDate}
              onApprove={handleApprove}
              onReject={handleReject}
              onSchedule={handleSchedule}
              onCopyContent={handleCopyContent}
              onReEdit={handleReEdit}
              onToggleReject={() => setShowRejectInput(!showRejectInput)}
              onToggleSchedule={() => setShowScheduleInput(!showScheduleInput)}
              onRejectReasonChange={setRejectReason}
              onScheduleDateChange={setScheduleDate}
            />
          </div>
        </div>

        {/* Version history sidebar */}
        <aside className="w-72 shrink-0">
          <div className="rounded-lg border border-gray-200 bg-white p-5 sticky top-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Version History</h3>
            {versions.length === 0 ? (
              <p className="text-sm text-gray-500">No version history yet</p>
            ) : (
              <ul className="space-y-2">
                {versions
                  .sort((a, b) => b.version - a.version)
                  .map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => setSelectedVersion(v)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedVersion?.id === v.id
                            ? 'bg-blue-50 border border-blue-200'
                            : 'hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800">
                            v{v.version}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDateTime(v.editedAt)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {v.content.slice(0, 60)}
                          {v.content.length > 60 ? '…' : ''}
                        </p>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface DraftActionsProps {
  draft: ContentDraft;
  actionLoading: string | null;
  showRejectInput: boolean;
  rejectReason: string;
  showScheduleInput: boolean;
  scheduleDate: string;
  onApprove: () => void;
  onReject: () => void;
  onSchedule: () => void;
  onCopyContent: () => void;
  onReEdit: () => void;
  onToggleReject: () => void;
  onToggleSchedule: () => void;
  onRejectReasonChange: (val: string) => void;
  onScheduleDateChange: (val: string) => void;
}

function DraftActions({
  draft,
  actionLoading,
  showRejectInput,
  rejectReason,
  showScheduleInput,
  scheduleDate,
  onApprove,
  onReject,
  onSchedule,
  onCopyContent,
  onReEdit,
  onToggleReject,
  onToggleSchedule,
  onRejectReasonChange,
  onScheduleDateChange,
}: DraftActionsProps) {
  const status = draft.status;

  if (status === 'GENERATED' || status === 'EDITING' || status === 'PENDING_APPROVAL') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onApprove}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === 'approve' ? 'Approving...' : '✓ Approve'}
          </button>
          <button
            onClick={onToggleReject}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ✗ Reject
          </button>
        </div>
        {showRejectInput && (
          <div className="space-y-2 p-3 bg-red-50 rounded-md border border-red-200">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => onRejectReasonChange(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full px-3 py-2 text-sm rounded-md border border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-2">
              <button
                onClick={onReject}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'reject' ? 'Rejecting...' : 'Confirm Reject'}
              </button>
              <button
                onClick={onToggleReject}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === 'APPROVED') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSchedule}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            📅 Schedule
          </button>
          <button
            onClick={onCopyContent}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === 'copy' ? 'Copying...' : '📋 Copy Content'}
          </button>
        </div>
        {showScheduleInput && (
          <div className="space-y-2 p-3 bg-purple-50 rounded-md border border-purple-200">
            <label className="block text-xs text-gray-600">Schedule date & time (optional)</label>
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => onScheduleDateChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex gap-2">
              <button
                onClick={onSchedule}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'schedule' ? 'Scheduling...' : 'Confirm Schedule'}
              </button>
              <button
                onClick={onToggleSchedule}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === 'REJECTED') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          This draft was rejected. Content is preserved for reference.
        </p>
        <button
          onClick={onReEdit}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          ✏️ Re-edit Draft
        </button>
      </div>
    );
  }

  // SCHEDULED or COPIED
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        {status === 'SCHEDULED'
          ? `This draft is scheduled${draft.scheduledAt ? ` for ${formatDateTime(draft.scheduledAt)}` : ''}.`
          : 'This content has been copied for manual posting.'}
      </p>
      {status === 'SCHEDULED' && draft.scheduledAt && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-md">
          <span className="text-sm text-purple-700">
            📅 {formatDateTime(draft.scheduledAt)}
          </span>
        </div>
      )}
    </div>
  );
}

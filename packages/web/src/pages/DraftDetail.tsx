// Requirements: 6.3, 6.4, 7.1, 7.2
// Draft detail view: edit interface, version history sidebar, approve/reject/schedule actions

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { contentApi, type ContentDraft, type DraftVersion, type DraftStatus } from '../lib/api.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { Card } from '../components/ui/Card.js';

const STATUS_LABELS: Record<DraftStatus, string> = {
  GENERATED: 'Generated',
  EDITING: 'Editing',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SCHEDULED: 'Scheduled',
  COPIED: 'Copied',
};

const STATUS_BADGE_COLORS: Record<DraftStatus, 'lime' | 'amber' | 'cyan' | 'red' | 'chrome'> = {
  GENERATED: 'cyan',
  EDITING: 'amber',
  PENDING_APPROVAL: 'amber',
  APPROVED: 'lime',
  REJECTED: 'red',
  SCHEDULED: 'lime',
  COPIED: 'lime',
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
    return () => {
      cancelled = true;
    };
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gunmetal border-t-founder-pink" />
          <p className="text-sm text-text-muted">Loading draft...</p>
        </div>
      </div>
    );
  }

  if (error && !draft) {
    return (
      <div className="space-y-4">
        <Link
          to="/content"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary motion-safe:transition-colors motion-safe:duration-fast"
        >
          ← Back to Drafts
        </Link>
        <Card variant="default" accent="red">
          <h3 className="text-sm font-medium text-alert-red">Unable to load draft</h3>
          <p className="mt-1 text-sm text-text-secondary">{error}</p>
        </Card>
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
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary motion-safe:transition-colors motion-safe:duration-fast"
      >
        ← Back to Drafts
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{PLATFORM_ICONS[draft.platform]}</span>
          <div>
            <h2 className="text-xl font-display font-bold text-chrome-white">
              {PLATFORM_LABELS[draft.platform]} Draft
            </h2>
            <p className="text-sm text-text-muted">
              Created {formatDateTime(draft.createdAt)}
              {draft.updatedAt !== draft.createdAt && (
                <> · Updated {formatDateTime(draft.updatedAt)}</>
              )}
            </p>
          </div>
        </div>
        <Badge color={STATUS_BADGE_COLORS[draft.status]}>
          {STATUS_LABELS[draft.status]}
        </Badge>
      </div>

      {/* Success/Error messages */}
      {successMessage && (
        <div className="rounded-md border border-launch-lime/30 bg-launch-lime/10 p-3">
          <p className="text-sm text-launch-lime">{successMessage}</p>
        </div>
      )}
      {error && draft && (
        <div className="rounded-md border border-alert-red/30 bg-alert-red/10 p-3">
          <p className="text-sm text-alert-red">{error}</p>
        </div>
      )}

      {/* Main content area with sidebar */}
      <div className="flex gap-6">
        {/* Editor / Content area */}
        <div className="flex-1 space-y-4">
          {/* Edit interface */}
          <Card variant="default">
            {selectedVersion ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-text-secondary">
                    Version {selectedVersion.version} Preview
                  </h3>
                  <button
                    onClick={() => setSelectedVersion(null)}
                    className="text-sm text-hyper-cyan hover:text-hyper-cyan/80 motion-safe:transition-colors motion-safe:duration-fast"
                  >
                    Back to current
                  </button>
                </div>
                <div className="bg-carbon rounded-md p-4 text-sm text-text-secondary whitespace-pre-wrap border border-graphite">
                  {selectedVersion.content}
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Edited {formatDateTime(selectedVersion.editedAt)}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-text-secondary">
                    {readOnly ? 'Content' : 'Edit Content'}
                  </h3>
                  {isTwitter && (
                    <span
                      className={`text-xs font-medium ${
                        charLimitExceeded ? 'text-alert-red' : 'text-text-muted'
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
                  className={`w-full rounded-md border p-3 text-sm leading-relaxed resize-y bg-carbon text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-hyper-cyan focus:ring-offset-2 focus:ring-offset-carbon motion-safe:transition-[border-color,box-shadow] motion-safe:duration-fast ${
                    readOnly
                      ? 'border-graphite text-text-secondary cursor-not-allowed opacity-60'
                      : 'border-graphite'
                  } ${charLimitExceeded ? 'border-alert-red focus:ring-alert-red' : ''}`}
                />
                {charLimitExceeded && (
                  <p className="mt-1 text-xs text-alert-red">
                    Content exceeds Twitter's 280 character limit
                  </p>
                )}
                {!readOnly && (
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      disabled={saving || editContent === draft.currentContent || charLimitExceeded}
                      loading={saving}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    {editContent !== draft.currentContent && (
                      <button
                        onClick={() => setEditContent(draft.currentContent)}
                        className="text-sm text-text-muted hover:text-text-secondary motion-safe:transition-colors motion-safe:duration-fast"
                      >
                        Discard changes
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Actions */}
          <Card variant="default">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Actions</h3>
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
          </Card>
        </div>

        {/* Version history sidebar */}
        <aside className="w-72 shrink-0">
          <div className="rounded-lg border border-graphite bg-gunmetal p-5 sticky top-4">
            <h3 className="text-sm font-medium text-chrome-white mb-3">Version History</h3>
            {versions.length === 0 ? (
              <p className="text-sm text-text-muted">No version history yet</p>
            ) : (
              <ul className="space-y-2">
                {versions
                  .sort((a, b) => b.version - a.version)
                  .map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => setSelectedVersion(v)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm motion-safe:transition-colors motion-safe:duration-fast ${
                          selectedVersion?.id === v.id
                            ? 'bg-hyper-cyan/10 border border-hyper-cyan/30'
                            : 'hover:bg-graphite border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-chrome-white">v{v.version}</span>
                          <span className="text-xs text-text-muted">
                            {formatDateTime(v.editedAt)}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-1 truncate">
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
          <Button
            variant="primary"
            size="sm"
            onClick={onApprove}
            disabled={actionLoading !== null}
            loading={actionLoading === 'approve'}
          >
            {actionLoading === 'approve' ? 'Approving...' : '✓ Approve'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onToggleReject}
            disabled={actionLoading !== null}
          >
            ✗ Reject
          </Button>
        </div>
        {showRejectInput && (
          <div className="space-y-2 p-3 bg-alert-red/5 rounded-md border border-alert-red/20">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => onRejectReasonChange(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full px-3 py-2 text-sm rounded-md bg-carbon border border-graphite text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-hyper-cyan focus:ring-offset-2 focus:ring-offset-carbon motion-safe:transition-[border-color,box-shadow] motion-safe:duration-fast"
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={onReject}
                disabled={actionLoading !== null}
                loading={actionLoading === 'reject'}
              >
                {actionLoading === 'reject' ? 'Rejecting...' : 'Confirm Reject'}
              </Button>
              <button
                onClick={onToggleReject}
                className="px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary motion-safe:transition-colors motion-safe:duration-fast"
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
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleSchedule}
            disabled={actionLoading !== null}
          >
            📅 Schedule
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCopyContent}
            disabled={actionLoading !== null}
            loading={actionLoading === 'copy'}
          >
            {actionLoading === 'copy' ? 'Copying...' : '📋 Copy Content'}
          </Button>
        </div>
        {showScheduleInput && (
          <div className="space-y-2 p-3 bg-hyper-cyan/5 rounded-md border border-hyper-cyan/20">
            <label className="block text-xs text-text-muted">Schedule date & time (optional)</label>
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => onScheduleDateChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md bg-carbon border border-graphite text-text-primary focus:outline-none focus:ring-2 focus:ring-hyper-cyan focus:ring-offset-2 focus:ring-offset-carbon motion-safe:transition-[border-color,box-shadow] motion-safe:duration-fast"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onSchedule}
                disabled={actionLoading !== null}
                loading={actionLoading === 'schedule'}
              >
                {actionLoading === 'schedule' ? 'Scheduling...' : 'Confirm Schedule'}
              </Button>
              <button
                onClick={onToggleSchedule}
                className="px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary motion-safe:transition-colors motion-safe:duration-fast"
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
        <p className="text-sm text-text-secondary">
          This draft was rejected. Content is preserved for reference.
        </p>
        <Button variant="secondary" size="sm" onClick={onReEdit}>
          ✏️ Re-edit Draft
        </Button>
      </div>
    );
  }

  // SCHEDULED or COPIED
  return (
    <div className="space-y-2">
      <p className="text-sm text-text-secondary">
        {status === 'SCHEDULED'
          ? `This draft is scheduled${draft.scheduledAt ? ` for ${formatDateTime(draft.scheduledAt)}` : ''}.`
          : 'This content has been copied for manual posting.'}
      </p>
      {status === 'SCHEDULED' && draft.scheduledAt && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-hyper-cyan/10 border border-hyper-cyan/20 rounded-md">
          <span className="text-sm text-hyper-cyan">📅 {formatDateTime(draft.scheduledAt)}</span>
        </div>
      )}
    </div>
  );
}

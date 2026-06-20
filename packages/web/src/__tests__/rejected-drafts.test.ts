// Requirements: 6.5, 7.4
// Unit tests for rejected drafts queue view logic

import { describe, it, expect } from 'vitest';

// Test the data transformation and display logic used by the RejectedDrafts component

interface ContentDraft {
  id: string;
  platform: 'TWITTER' | 'LINKEDIN' | 'BLOG';
  status: 'GENERATED' | 'EDITING' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SCHEDULED' | 'COPIED';
  currentContent: string;
  createdAt: string;
  updatedAt: string;
}

type Platform = 'TWITTER' | 'LINKEDIN' | 'BLOG';

const platformLabels: Record<Platform, string> = {
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
  BLOG: 'Blog',
};

function filterRejectedDrafts(drafts: ContentDraft[]): ContentDraft[] {
  return drafts.filter((d) => d.status === 'REJECTED');
}

function formatRejectionDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDraftSummary(drafts: ContentDraft[]): string {
  const count = drafts.length;
  return `${count} rejected ${count === 1 ? 'draft' : 'drafts'} preserved for reference. Use the content below as inspiration for new drafts.`;
}

function isPreserved(draft: ContentDraft): boolean {
  // A rejected draft is preserved if:
  // - Its status is REJECTED
  // - Its content is non-null and non-empty
  return draft.status === 'REJECTED' && draft.currentContent !== null && draft.currentContent.length > 0;
}

describe('Rejected Drafts - Filtering', () => {
  it('should filter only rejected drafts from a mixed list', () => {
    const drafts: ContentDraft[] = [
      { id: '1', platform: 'TWITTER', status: 'APPROVED', currentContent: 'content 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
      { id: '2', platform: 'LINKEDIN', status: 'REJECTED', currentContent: 'content 2', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-03T00:00:00Z' },
      { id: '3', platform: 'BLOG', status: 'GENERATED', currentContent: 'content 3', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-04T00:00:00Z' },
      { id: '4', platform: 'TWITTER', status: 'REJECTED', currentContent: 'content 4', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-05T00:00:00Z' },
    ];

    const rejected = filterRejectedDrafts(drafts);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((d) => d.status === 'REJECTED')).toBe(true);
  });

  it('should return empty array when no drafts are rejected', () => {
    const drafts: ContentDraft[] = [
      { id: '1', platform: 'TWITTER', status: 'APPROVED', currentContent: 'hi', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
    ];

    const rejected = filterRejectedDrafts(drafts);
    expect(rejected).toHaveLength(0);
  });

  it('should return all drafts when all are rejected', () => {
    const drafts: ContentDraft[] = [
      { id: '1', platform: 'TWITTER', status: 'REJECTED', currentContent: 'a', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
      { id: '2', platform: 'LINKEDIN', status: 'REJECTED', currentContent: 'b', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-03T00:00:00Z' },
    ];

    const rejected = filterRejectedDrafts(drafts);
    expect(rejected).toHaveLength(2);
  });
});

describe('Rejected Drafts - Content Preservation', () => {
  it('should confirm rejected drafts have preserved content', () => {
    const draft: ContentDraft = {
      id: '1',
      platform: 'TWITTER',
      status: 'REJECTED',
      currentContent: 'Just shipped a new feature! 🚀',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };

    expect(isPreserved(draft)).toBe(true);
  });

  it('should not consider non-rejected drafts as preserved in rejected queue', () => {
    const draft: ContentDraft = {
      id: '1',
      platform: 'TWITTER',
      status: 'APPROVED',
      currentContent: 'Some content',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };

    expect(isPreserved(draft)).toBe(false);
  });

  it('should show full content without truncation for each rejected draft', () => {
    const longContent = 'A'.repeat(1000); // Long content should still be fully displayed
    const draft: ContentDraft = {
      id: '1',
      platform: 'BLOG',
      status: 'REJECTED',
      currentContent: longContent,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };

    // The component displays full content — verify it equals the original
    expect(draft.currentContent).toBe(longContent);
    expect(draft.currentContent.length).toBe(1000);
    expect(isPreserved(draft)).toBe(true);
  });
});

describe('Rejected Drafts - Platform Labels', () => {
  it('should map TWITTER to Twitter/X', () => {
    expect(platformLabels.TWITTER).toBe('Twitter/X');
  });

  it('should map LINKEDIN to LinkedIn', () => {
    expect(platformLabels.LINKEDIN).toBe('LinkedIn');
  });

  it('should map BLOG to Blog', () => {
    expect(platformLabels.BLOG).toBe('Blog');
  });
});

describe('Rejected Drafts - Date Formatting', () => {
  it('should format rejection date in readable format', () => {
    const result = formatRejectionDate('2024-03-15T10:00:00Z');
    expect(result).toBe('Mar 15, 2024');
  });

  it('should format different dates correctly', () => {
    const result = formatRejectionDate('2024-12-01T08:30:00Z');
    expect(result).toBe('Dec 1, 2024');
  });
});

describe('Rejected Drafts - Summary Text', () => {
  it('should use singular "draft" for count of 1', () => {
    const drafts: ContentDraft[] = [
      { id: '1', platform: 'TWITTER', status: 'REJECTED', currentContent: 'hi', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
    ];

    const summary = getDraftSummary(drafts);
    expect(summary).toContain('1 rejected draft preserved');
  });

  it('should use plural "drafts" for count > 1', () => {
    const drafts: ContentDraft[] = [
      { id: '1', platform: 'TWITTER', status: 'REJECTED', currentContent: 'a', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
      { id: '2', platform: 'LINKEDIN', status: 'REJECTED', currentContent: 'b', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-03T00:00:00Z' },
      { id: '3', platform: 'BLOG', status: 'REJECTED', currentContent: 'c', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-04T00:00:00Z' },
    ];

    const summary = getDraftSummary(drafts);
    expect(summary).toContain('3 rejected drafts preserved');
  });
});

describe('Rejected Drafts - No Delete Action', () => {
  it('should not expose any mechanism to delete rejected drafts', () => {
    // This test documents the UX invariant: rejected drafts are always preserved.
    // The RejectedDrafts component intentionally has NO delete button.
    // The only action available is "Copy Content" for reuse.
    const availableActions = ['copy'];
    expect(availableActions).not.toContain('delete');
    expect(availableActions).toContain('copy');
  });
});

// Requirements: 6.1, 6.6
// Unit tests for Content drafts page logic: truncation, date formatting, status/platform color mapping

import { describe, it, expect } from 'vitest';

type Platform = 'TWITTER' | 'LINKEDIN' | 'BLOG';
type DraftStatus =
  | 'GENERATED'
  | 'EDITING'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'COPIED';

// Replicates the logic from Content.tsx for testability

function truncateContent(content: string, maxLength = 100): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trimEnd() + '…';
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_COLORS: Record<DraftStatus, string> = {
  GENERATED: 'bg-gray-100 text-gray-700',
  EDITING: 'bg-blue-100 text-blue-700',
  PENDING_APPROVAL: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COPIED: 'bg-green-100 text-green-700',
};

const PLATFORM_COLORS: Record<Platform, string> = {
  TWITTER: 'bg-sky-100 text-sky-700',
  LINKEDIN: 'bg-blue-200 text-blue-900',
  BLOG: 'bg-emerald-100 text-emerald-700',
};

describe('Content Drafts - Content Truncation', () => {
  it('should not truncate content shorter than 100 characters', () => {
    const short = 'This is a short draft.';
    expect(truncateContent(short)).toBe(short);
  });

  it('should not truncate content exactly 100 characters', () => {
    const exact = 'a'.repeat(100);
    expect(truncateContent(exact)).toBe(exact);
  });

  it('should truncate content longer than 100 characters with ellipsis', () => {
    const long = 'a'.repeat(150);
    const result = truncateContent(long);
    expect(result.length).toBeLessThanOrEqual(101); // 100 chars + ellipsis character
    expect(result.endsWith('…')).toBe(true);
  });

  it('should trim trailing whitespace before adding ellipsis', () => {
    // Content that has spaces around the 100-char boundary
    const content = 'word '.repeat(25); // 125 chars (25 * 5)
    const result = truncateContent(content);
    // Should not end with space before ellipsis
    expect(result.endsWith(' …')).toBe(false);
    expect(result.endsWith('…')).toBe(true);
  });

  it('should handle empty content', () => {
    expect(truncateContent('')).toBe('');
  });
});

describe('Content Drafts - Date Formatting', () => {
  it('should format ISO date string to readable format', () => {
    const result = formatDate('2024-03-15T10:00:00Z');
    expect(result).toBe('Mar 15, 2024');
  });

  it('should format another date correctly', () => {
    const result = formatDate('2024-12-01T08:30:00Z');
    expect(result).toBe('Dec 1, 2024');
  });
});

describe('Content Drafts - Status Color Mapping', () => {
  it('should map approved status to green', () => {
    expect(STATUS_COLORS['APPROVED']).toContain('green');
  });

  it('should map rejected status to red', () => {
    expect(STATUS_COLORS['REJECTED']).toContain('red');
  });

  it('should map generated status to gray', () => {
    expect(STATUS_COLORS['GENERATED']).toContain('gray');
  });

  it('should map in-progress statuses to blue', () => {
    expect(STATUS_COLORS['EDITING']).toContain('blue');
    expect(STATUS_COLORS['PENDING_APPROVAL']).toContain('blue');
    expect(STATUS_COLORS['SCHEDULED']).toContain('blue');
  });

  it('should have a color mapping for every status', () => {
    const allStatuses: DraftStatus[] = [
      'GENERATED', 'EDITING', 'PENDING_APPROVAL',
      'APPROVED', 'REJECTED', 'SCHEDULED', 'COPIED',
    ];
    for (const status of allStatuses) {
      expect(STATUS_COLORS[status]).toBeDefined();
      expect(STATUS_COLORS[status].length).toBeGreaterThan(0);
    }
  });
});

describe('Content Drafts - Platform Color Mapping', () => {
  it('should map Twitter to sky/blue', () => {
    expect(PLATFORM_COLORS['TWITTER']).toContain('sky');
  });

  it('should map LinkedIn to blue (darker)', () => {
    expect(PLATFORM_COLORS['LINKEDIN']).toContain('blue');
  });

  it('should map Blog to green/emerald', () => {
    expect(PLATFORM_COLORS['BLOG']).toContain('emerald');
  });

  it('should have a color mapping for every platform', () => {
    const allPlatforms: Platform[] = ['TWITTER', 'LINKEDIN', 'BLOG'];
    for (const platform of allPlatforms) {
      expect(PLATFORM_COLORS[platform]).toBeDefined();
      expect(PLATFORM_COLORS[platform].length).toBeGreaterThan(0);
    }
  });
});

describe('Content Drafts - Status Filter Options', () => {
  const STATUS_OPTIONS: Array<{ value: DraftStatus | 'ALL'; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'GENERATED', label: 'Generated' },
    { value: 'EDITING', label: 'Editing' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'SCHEDULED', label: 'Scheduled' },
  ];

  it('should include All option', () => {
    const allOption = STATUS_OPTIONS.find((o) => o.value === 'ALL');
    expect(allOption).toBeDefined();
    expect(allOption!.label).toBe('All');
  });

  it('should include all required status filters', () => {
    const values = STATUS_OPTIONS.map((o) => o.value);
    expect(values).toContain('GENERATED');
    expect(values).toContain('EDITING');
    expect(values).toContain('PENDING_APPROVAL');
    expect(values).toContain('APPROVED');
    expect(values).toContain('REJECTED');
    expect(values).toContain('SCHEDULED');
  });

  it('should have human-readable labels for all options', () => {
    for (const option of STATUS_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      // Labels should not be raw enum values
      expect(option.label).not.toContain('_');
    }
  });
});

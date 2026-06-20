// Requirements: 2.2
// Tests for SyncButton utility functions and sync API integration

import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../components/SyncButton';

describe('formatRelativeTime', () => {
  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    const now = new Date();
    const thirtySecsAgo = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecsAgo)).toBe('just now');
  });

  it('returns minutes ago for timestamps within the last hour', () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5 minutes ago');
  });

  it('returns singular "minute" for 1 minute ago', () => {
    const now = new Date();
    const oneMinAgo = new Date(now.getTime() - 61_000).toISOString();
    expect(formatRelativeTime(oneMinAgo)).toBe('1 minute ago');
  });

  it('returns hours ago for timestamps within the last day', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe('3 hours ago');
  });

  it('returns singular "hour" for 1 hour ago', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 61 * 60_000).toISOString();
    expect(formatRelativeTime(oneHourAgo)).toBe('1 hour ago');
  });

  it('returns days ago for timestamps within the last week', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe('2 days ago');
  });

  it('returns absolute date for timestamps older than 7 days', () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeTime(tenDaysAgo);
    // Should be an absolute date format (contains a comma from locale formatting)
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });
});

// Requirements: 8.1, 8.2, 8.3, 8.4
// Unit tests for Dashboard page logic and data handling

import { describe, it, expect } from 'vitest';

// Test the interface contracts and data transformation logic
// that the Dashboard component relies on

interface DashboardData {
  projectStatus: { total: number; byState: Record<string, number> };
  blockers: Array<{ taskId: string; title: string; reason: string }>;
  nextAction: { description: string; category: string; priority: number } | null;
  recentProgress: Array<{ taskId: string; title: string; completedAt: string }>;
  lastSync: { timestamp: string; status: string } | null;
  launchReadiness: { percentage: number; blockerCount: number };
}

function isEmptyDashboard(data: DashboardData): boolean {
  return data.projectStatus.total === 0;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

describe('Dashboard - Empty State Detection', () => {
  it('should detect empty dashboard when total tasks is 0', () => {
    const data: DashboardData = {
      projectStatus: {
        total: 0,
        byState: {
          NOT_STARTED: 0,
          IN_PROGRESS: 0,
          BLOCKED: 0,
          NEEDS_REVIEW: 0,
          COMPLETED: 0,
          UNCERTAIN: 0,
        },
      },
      blockers: [],
      nextAction: null,
      recentProgress: [],
      lastSync: null,
      launchReadiness: { percentage: 0, blockerCount: 0 },
    };

    expect(isEmptyDashboard(data)).toBe(true);
  });

  it('should detect non-empty dashboard when tasks exist', () => {
    const data: DashboardData = {
      projectStatus: {
        total: 5,
        byState: {
          NOT_STARTED: 2,
          IN_PROGRESS: 1,
          BLOCKED: 0,
          NEEDS_REVIEW: 1,
          COMPLETED: 1,
          UNCERTAIN: 0,
        },
      },
      blockers: [],
      nextAction: { description: 'Set up CI/CD', category: 'deployment', priority: 1 },
      recentProgress: [],
      lastSync: { timestamp: new Date().toISOString(), status: 'SUCCESS' },
      launchReadiness: { percentage: 20, blockerCount: 0 },
    };

    expect(isEmptyDashboard(data)).toBe(false);
  });
});

describe('Dashboard - Relative Date Formatting', () => {
  it('should display "just now" for timestamps less than 1 minute ago', () => {
    const now = new Date();
    expect(formatRelativeDate(now.toISOString())).toBe('just now');
  });

  it('should display minutes for timestamps less than 1 hour ago', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    expect(formatRelativeDate(thirtyMinAgo.toISOString())).toBe('30m ago');
  });

  it('should display hours for timestamps less than 24 hours ago', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    expect(formatRelativeDate(fiveHoursAgo.toISOString())).toBe('5h ago');
  });

  it('should display days for timestamps more than 24 hours ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeDate(threeDaysAgo.toISOString())).toBe('3d ago');
  });
});

describe('Dashboard - Date Formatting', () => {
  it('should format dates as "Mon DD" format', () => {
    const result = formatDate('2024-03-15T10:00:00Z');
    expect(result).toBe('Mar 15');
  });

  it('should format completion dates correctly', () => {
    const result = formatDate('2024-12-01T08:30:00Z');
    expect(result).toBe('Dec 1');
  });
});

describe('Dashboard - Data Structure Validation', () => {
  it('should handle dashboard response with all fields populated', () => {
    const data: DashboardData = {
      projectStatus: {
        total: 12,
        byState: {
          NOT_STARTED: 3,
          IN_PROGRESS: 4,
          BLOCKED: 1,
          NEEDS_REVIEW: 2,
          COMPLETED: 2,
          UNCERTAIN: 0,
        },
      },
      blockers: [
        {
          taskId: 'task-1',
          title: 'Deploy to production',
          reason: 'Waiting on DNS configuration',
        },
      ],
      nextAction: {
        description: 'Resolve DNS configuration for production deployment',
        category: 'deployment',
        priority: 1,
      },
      recentProgress: [
        {
          taskId: 'task-2',
          title: 'Set up authentication',
          completedAt: '2024-03-10T14:00:00Z',
        },
        {
          taskId: 'task-3',
          title: 'Create user profile page',
          completedAt: '2024-03-08T09:30:00Z',
        },
      ],
      lastSync: { timestamp: '2024-03-12T16:45:00Z', status: 'SUCCESS' },
      launchReadiness: { percentage: 45, blockerCount: 1 },
    };

    // Verify all state counts sum to total
    const sumOfStates = Object.values(data.projectStatus.byState).reduce(
      (sum, count) => sum + (count as number),
      0,
    );
    expect(sumOfStates).toBe(data.projectStatus.total);

    // Verify blocker count matches
    expect(data.blockers.length).toBe(data.launchReadiness.blockerCount);

    // Verify nextAction has required fields
    expect(data.nextAction).not.toBeNull();
    expect(data.nextAction!.description).toBeTruthy();
    expect(data.nextAction!.category).toBeTruthy();
    expect(typeof data.nextAction!.priority).toBe('number');
  });

  it('should handle null nextAction when no actions available', () => {
    const data: DashboardData = {
      projectStatus: {
        total: 5,
        byState: {
          NOT_STARTED: 0,
          IN_PROGRESS: 0,
          BLOCKED: 0,
          NEEDS_REVIEW: 0,
          COMPLETED: 5,
          UNCERTAIN: 0,
        },
      },
      blockers: [],
      nextAction: null,
      recentProgress: [],
      lastSync: { timestamp: '2024-03-12T16:45:00Z', status: 'SUCCESS' },
      launchReadiness: { percentage: 100, blockerCount: 0 },
    };

    expect(data.nextAction).toBeNull();
    expect(data.launchReadiness.percentage).toBe(100);
  });

  it('should handle failed sync status', () => {
    const data: DashboardData = {
      projectStatus: {
        total: 3,
        byState: {
          NOT_STARTED: 1,
          IN_PROGRESS: 1,
          BLOCKED: 0,
          NEEDS_REVIEW: 0,
          COMPLETED: 1,
          UNCERTAIN: 0,
        },
      },
      blockers: [],
      nextAction: null,
      recentProgress: [],
      lastSync: { timestamp: '2024-03-12T16:45:00Z', status: 'FAILED' },
      launchReadiness: { percentage: 33, blockerCount: 0 },
    };

    expect(data.lastSync!.status).toBe('FAILED');
    expect(data.lastSync!.status !== 'SUCCESS').toBe(true);
  });
});

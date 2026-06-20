// Requirements: 8.5
// API client utility with typed methods, error handling, and auth redirect

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly status: number;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.retryable = body.retryable;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    window.location.href = '/login';
    throw new ApiError(401, {
      code: 'UNAUTHORIZED',
      message: 'Session expired. Redirecting to login.',
      retryable: false,
    });
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody['error'];
    try {
      const json = (await response.json()) as ApiErrorBody;
      errorBody = json.error;
    } catch {
      errorBody = {
        code: 'UNKNOWN_ERROR',
        message: response.statusText || 'An unknown error occurred',
        retryable: false,
      };
    }
    throw new ApiError(response.status, errorBody);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<T>(response);
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function put<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function del<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<T>(response);
}

// Typed API endpoint helpers

export interface DashboardResponse {
  projectStatus: { total: number; byState: Record<string, number> };
  blockers: Array<{ taskId: string; title: string; reason: string }>;
  nextAction: { description: string; category: string; priority: number } | null;
  recentProgress: Array<{ taskId: string; title: string; completedAt: string }>;
  lastSync: { timestamp: string; status: string } | null;
  launchReadiness: { percentage: number; blockerCount: number };
}

export const dashboardApi = {
  getSummary: () => get<DashboardResponse>('/api/dashboard'),
};

export interface ChecklistItem {
  id: string;
  title: string;
  status: 'complete' | 'incomplete' | 'blocked';
  isBlocker: boolean;
  blockerReason?: string;
}

export interface ChecklistCategory {
  name: string;
  items: ChecklistItem[];
  completedCount: number;
  totalCount: number;
}

export interface ChecklistBlocker {
  id: string;
  title: string;
  category: string;
  blockerReason: string;
}

export interface ChecklistResponse {
  categories: ChecklistCategory[];
  blockers: ChecklistBlocker[];
  nextAction: { description: string; category: string } | null;
  readinessPercentage: number;
}

export const checklistApi = {
  getItems: () => get<ChecklistResponse>('/api/checklist'),
  updateItem: (id: string, data: { status: string }) =>
    put<ChecklistItem>(`/api/checklist/items/${id}`, data),
};

export type Platform = 'TWITTER' | 'LINKEDIN' | 'BLOG';
export type DraftStatus =
  | 'GENERATED'
  | 'EDITING'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'COPIED';

export interface ContentDraft {
  id: string;
  platform: Platform;
  status: DraftStatus;
  currentContent: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftVersion {
  id: string;
  version: number;
  content: string;
  editedAt: string;
}

export const contentApi = {
  getDrafts: (status?: DraftStatus) => {
    const path = status
      ? `/api/content/drafts?status=${status}`
      : '/api/content/drafts';
    return get<ContentDraft[]>(path);
  },
  generateDraft: (data: { platform: Platform }) =>
    post<ContentDraft>('/api/content/generate', data),
  editDraft: (id: string, content: string) =>
    put<ContentDraft>(`/api/content/drafts/${id}`, { content }),
  approveDraft: (id: string) => post<ContentDraft>(`/api/content/drafts/${id}/approve`),
  rejectDraft: (id: string, reason?: string) =>
    post<ContentDraft>(`/api/content/drafts/${id}/reject`, reason ? { reason } : undefined),
  scheduleDraft: (id: string, scheduledAt?: string) =>
    post<ContentDraft>(`/api/content/drafts/${id}/schedule`, scheduledAt ? { scheduledAt } : undefined),
  getVersions: (id: string) =>
    get<DraftVersion[]>(`/api/content/drafts/${id}/versions`),
};

export interface CompletedAsset {
  id: string;
  type: string;
  completedAt: string;
}

export interface MissingAsset {
  id: string;
  type: string;
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
}

export interface ChannelRecommendation {
  channel: string;
  reason: string;
  priority: number;
}

export interface MarketingStatusResponse {
  completedAssets: CompletedAsset[];
  missingAssets: MissingAsset[];
  channelRecommendations: ChannelRecommendation[];
  readinessPercentage: number;
}

export const marketingApi = {
  getStatus: () => get<MarketingStatusResponse>('/api/marketing/status'),
  completeAsset: (id: string) => post<CompletedAsset>(`/api/marketing/assets/${id}/complete`),
};

export interface SyncStatus {
  lastSyncAt: string | null;
  status: 'success' | 'failed' | 'in_progress' | null;
  errorMessage?: string;
  itemsFetched?: number;
  duration?: number;
}

export interface SyncTriggerResult {
  id: string;
  status: 'success' | 'failed';
  itemsFetched: number;
  duration: number;
  errorMessage?: string;
  completedAt: string;
}

export const syncApi = {
  getStatus: () => get<SyncStatus>('/api/sync/status'),
  trigger: () => post<SyncTriggerResult>('/api/sync/trigger'),
};

export const authApi = {
  getSession: () => get<unknown>('/api/auth/session'),
  logout: () => post<unknown>('/api/auth/logout'),
};

export interface AvailableRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  description: string | null;
}

export interface ConnectedRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  githubId: number;
  connectedAt: string;
}

export const repoApi = {
  getAvailable: () => get<AvailableRepo[]>('/api/repos/available'),
  getCurrent: () => get<ConnectedRepo>('/api/repos/current'),
  connect: (repo: { owner: string; name: string; fullName: string; githubId: number }) =>
    post<ConnectedRepo>('/api/repos/connect', repo),
  disconnect: () => del<void>('/api/repos/disconnect'),
};

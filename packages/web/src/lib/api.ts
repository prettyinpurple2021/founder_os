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

export const dashboardApi = {
  getSummary: () => get<unknown>('/api/dashboard'),
};

export const checklistApi = {
  getItems: () => get<unknown>('/api/checklist'),
  updateItem: (id: string, data: unknown) => put<unknown>(`/api/checklist/${id}`, data),
};

export const contentApi = {
  getDrafts: () => get<unknown>('/api/content/drafts'),
  generateDraft: (data: unknown) => post<unknown>('/api/content/generate', data),
  approveDraft: (id: string) => post<unknown>(`/api/content/drafts/${id}/approve`),
  rejectDraft: (id: string) => post<unknown>(`/api/content/drafts/${id}/reject`),
  scheduleDraft: (id: string, data: unknown) => post<unknown>(`/api/content/drafts/${id}/schedule`, data),
};

export const marketingApi = {
  getAssets: () => get<unknown>('/api/marketing/assets'),
  getSuggestions: () => get<unknown>('/api/marketing/suggestions'),
};

export const authApi = {
  getSession: () => get<unknown>('/api/auth/session'),
  logout: () => post<unknown>('/api/auth/logout'),
};

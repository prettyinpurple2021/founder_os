// Requirements: 1.1, 9.1
// Tests for authentication flow: AuthContext module structure and API client auth behavior

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up minimal window global for API client (which uses window.location.href)
const mockWindow = { location: { href: '' } };
vi.stubGlobal('window', mockWindow);

describe('Auth Flow', () => {
  describe('API client auth redirect', () => {
    beforeEach(() => {
      vi.resetModules();
      mockWindow.location.href = '';
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('redirects to /login on 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired', retryable: false } }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const { get } = await import('../lib/api.js');

      await expect(get('/api/test')).rejects.toThrow();
      expect(mockWindow.location.href).toBe('/login');
    });

    it('does not redirect on successful response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ user: { id: '1', username: 'test' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const { get } = await import('../lib/api.js');
      const result = await get('/api/test');

      expect(result).toEqual({ user: { id: '1', username: 'test' } });
      expect(mockWindow.location.href).toBe('');
    });

    it('throws ApiError with correct fields on non-401 error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const { get, ApiError } = await import('../lib/api.js');

      try {
        await get('/api/missing');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as InstanceType<typeof ApiError>).status).toBe(404);
        expect((err as InstanceType<typeof ApiError>).code).toBe('NOT_FOUND');
      }
    });
  });

  describe('authApi methods', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ user: { id: '1', username: 'test' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('getSession calls GET /api/auth/session with credentials', async () => {
      const { authApi } = await import('../lib/api.js');
      await authApi.getSession();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/auth/session',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      );
    });

    it('logout calls POST /api/auth/logout with credentials', async () => {
      const { authApi } = await import('../lib/api.js');
      await authApi.logout();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );
    });
  });

  describe('AuthContext module exports', () => {
    it('exports AuthProvider and useAuth', async () => {
      const authModule = await import('../contexts/AuthContext.js');
      expect(authModule.AuthProvider).toBeDefined();
      expect(typeof authModule.AuthProvider).toBe('function');
      expect(authModule.useAuth).toBeDefined();
      expect(typeof authModule.useAuth).toBe('function');
    });
  });

  describe('ProtectedRoute module exports', () => {
    it('exports a default component function', async () => {
      const module = await import('../components/ProtectedRoute.js');
      expect(module.default).toBeDefined();
      expect(typeof module.default).toBe('function');
    });
  });
});

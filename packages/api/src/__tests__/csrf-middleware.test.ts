import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { csrfMiddleware } from '../middleware/csrf.js';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/',
    headers: {},
    session: {},
    ...overrides,
  } as Request;
}

function createMockRes(): Response {
  const res = {} as Response;
  (res as any).setHeader = vi.fn();
  (res as any).status = vi.fn(() => res);
  (res as any).json = vi.fn(() => res);
  return res;
}

describe('csrfMiddleware', () => {
  it('issues and exposes a CSRF token on safe requests', () => {
    const req = createMockReq({ method: 'GET', session: {} as Request['session'] });
    const res = createMockRes();
    const next = vi.fn();

    csrfMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.session?.csrfToken).toBeDefined();
    expect((res as any).setHeader).toHaveBeenCalledWith('X-CSRF-Token', req.session?.csrfToken);
  });

  it('allows mutating requests when no active CSRF session token exists', () => {
    const req = createMockReq({ method: 'POST', session: {} as Request['session'] });
    const res = createMockRes();
    const next = vi.fn();

    csrfMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it('rejects mutating requests with an active session token but missing header', () => {
    const req = createMockReq({
      method: 'POST',
      session: { csrfToken: 'server-token' } as Request['session'],
    });
    const res = createMockRes();
    const next = vi.fn();

    csrfMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res as any).status).toHaveBeenCalledWith(403);
    expect((res as any).json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Missing CSRF token', retryable: false },
    });
  });

  it('allows mutating requests when the provided token matches the session token', () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-csrf-token': 'server-token' },
      session: { csrfToken: 'server-token' } as Request['session'],
    });
    const res = createMockRes();
    const next = vi.fn();

    csrfMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it('exempts /api/errors from CSRF enforcement', () => {
    const req = createMockReq({
      method: 'POST',
      path: '/api/errors',
      session: { csrfToken: 'server-token' } as Request['session'],
    });
    const res = createMockRes();
    const next = vi.fn();

    csrfMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((res as any).status).not.toHaveBeenCalled();
  });
});

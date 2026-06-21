// Requirements: 6.1, 6.2, 6.3
// Tests for structured error logging middleware.
// Verifies: sensitive data stripping, log structure, field inclusion.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { errorLogger, sanitizeBody, sanitizeHeaders } from '../middleware/errorLogger.js';

describe('errorLogger middleware', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  function createMockRequest(overrides: Partial<Request> = {}): Request {
    return {
      method: 'POST',
      path: '/api/tasks',
      originalUrl: '/api/tasks',
      headers: {
        'content-type': 'application/json',
      },
      ...overrides,
    } as unknown as Request;
  }

  function createMockResponse(): Response {
    return {} as unknown as Response;
  }

  it('writes structured JSON to stdout with all required fields', () => {
    const err = new Error('Something broke');
    const req = createMockRequest({
      user: { id: 'user-123' },
    } as unknown as Partial<Request>);
    const res = createMockResponse();
    const next: NextFunction = vi.fn();

    errorLogger(err, req, res, next);

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const logOutput = stdoutSpy.mock.calls[0]?.[0] as string;
    const logEntry = JSON.parse(logOutput);

    expect(logEntry.level).toBe('error');
    expect(logEntry.timestamp).toBeDefined();
    expect(logEntry.traceId).toBeDefined();
    expect(logEntry.environment).toBeDefined();
    expect(logEntry.message).toBe('Something broke');
    expect(logEntry.stack).toContain('Error: Something broke');
    expect(logEntry.request.method).toBe('POST');
    expect(logEntry.request.path).toBe('/api/tasks');
    expect(logEntry.request.userId).toBe('user-123');
  });

  it('includes trace ID from x-trace-id header when present', () => {
    const err = new Error('test');
    const req = createMockRequest({
      headers: { 'x-trace-id': 'trace-abc-123' },
    } as unknown as Partial<Request>);
    const res = createMockResponse();
    const next: NextFunction = vi.fn();

    errorLogger(err, req, res, next);

    const logOutput = stdoutSpy.mock.calls[0]?.[0] as string;
    const logEntry = JSON.parse(logOutput);
    expect(logEntry.traceId).toBe('trace-abc-123');
  });

  it('generates a trace ID when none is present on the request', () => {
    const err = new Error('test');
    const req = createMockRequest();
    const res = createMockResponse();
    const next: NextFunction = vi.fn();

    errorLogger(err, req, res, next);

    const logOutput = stdoutSpy.mock.calls[0]?.[0] as string;
    const logEntry = JSON.parse(logOutput);
    expect(logEntry.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sets userId to undefined when user is not authenticated', () => {
    const err = new Error('test');
    const req = createMockRequest();
    const res = createMockResponse();
    const next: NextFunction = vi.fn();

    errorLogger(err, req, res, next);

    const logOutput = stdoutSpy.mock.calls[0]?.[0] as string;
    const logEntry = JSON.parse(logOutput);
    expect(logEntry.request.userId).toBeUndefined();
  });

  it('passes the error to the next error handler', () => {
    const err = new Error('test');
    const req = createMockRequest();
    const res = createMockResponse();
    const next: NextFunction = vi.fn();

    errorLogger(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('uses environment from NODE_ENV', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const err = new Error('test');
    const req = createMockRequest();
    const res = createMockResponse();
    const next: NextFunction = vi.fn();

    errorLogger(err, req, res, next);

    const logOutput = stdoutSpy.mock.calls[0]?.[0] as string;
    const logEntry = JSON.parse(logOutput);
    expect(logEntry.environment).toBe('production');

    process.env.NODE_ENV = originalEnv;
  });
});

describe('sanitizeBody', () => {
  it('strips password fields from request body', () => {
    const body = { username: 'admin', password: 'secret123', email: 'a@b.com' };
    const result = sanitizeBody(body) as Record<string, unknown>;
    expect(result.password).toBe('[REDACTED]');
    expect(result.username).toBe('admin');
    expect(result.email).toBe('a@b.com');
  });

  it('strips secret fields from request body', () => {
    const body = { data: 'ok', secret: 'my-secret-value' };
    const result = sanitizeBody(body) as Record<string, unknown>;
    expect(result.secret).toBe('[REDACTED]');
    expect(result.data).toBe('ok');
  });

  it('strips token fields from request body', () => {
    const body = { token: 'abc123', name: 'test' };
    const result = sanitizeBody(body) as Record<string, unknown>;
    expect(result.token).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('is case-insensitive for field names', () => {
    const body = { Password: 'test', SECRET: 'test', Token: 'test' };
    const result = sanitizeBody(body) as Record<string, unknown>;
    expect(result.Password).toBe('[REDACTED]');
    expect(result.SECRET).toBe('[REDACTED]');
    expect(result.Token).toBe('[REDACTED]');
  });

  it('returns undefined for null or undefined body', () => {
    expect(sanitizeBody(null)).toBeUndefined();
    expect(sanitizeBody(undefined)).toBeUndefined();
  });

  it('passes through arrays and primitives unchanged', () => {
    expect(sanitizeBody([1, 2, 3])).toEqual([1, 2, 3]);
    expect(sanitizeBody('string')).toBe('string');
  });
});

describe('sanitizeHeaders', () => {
  it('strips authorization header', () => {
    const headers = { authorization: 'Bearer token123', 'content-type': 'application/json' };
    const result = sanitizeHeaders(headers);
    expect(result.authorization).toBe('[REDACTED]');
    expect(result['content-type']).toBe('application/json');
  });

  it('strips cookie header', () => {
    const headers = { cookie: 'session=abc123', host: 'localhost' };
    const result = sanitizeHeaders(headers);
    expect(result.cookie).toBe('[REDACTED]');
    expect(result.host).toBe('localhost');
  });

  it('is case-insensitive for header names', () => {
    const headers = { Authorization: 'Bearer xyz', Cookie: 'sid=abc' };
    const result = sanitizeHeaders(headers);
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result.Cookie).toBe('[REDACTED]');
  });

  it('preserves non-sensitive headers', () => {
    const headers = { 'x-request-id': '123', 'content-type': 'text/plain' };
    const result = sanitizeHeaders(headers);
    expect(result['x-request-id']).toBe('123');
    expect(result['content-type']).toBe('text/plain');
  });
});

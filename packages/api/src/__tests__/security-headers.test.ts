// Requirements: 9.2
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Mock passport to avoid requiring GitHub OAuth env vars in tests
vi.mock('../auth/passport.js', () => {
  const passport = {
    initialize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    session: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    authenticate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    use: () => {},
    serializeUser: () => {},
    deserializeUser: () => {},
  };
  return { default: passport, initializePassport: vi.fn() };
});

// Mock the scheduler to prevent cron jobs from starting
vi.mock('../services/scheduler.js', () => ({
  startScheduler: () => {},
}));

import app from '../index.js';
import { createApp } from '../index.js';

describe('Security Headers (helmet)', () => {
  it('should set X-Content-Type-Options to nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should set X-Frame-Options to DENY', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('should set Strict-Transport-Security header in production', async () => {
    // HSTS is only enabled in production mode (setting it in development would break local HTTP)
    const productionApp = createApp({
      port: 3001,
      nodeEnv: 'production',
      database: { url: 'postgresql://localhost:5432/test' },
      session: { secret: 'test-secret-at-least-32-chars!!!', maxAge: 86400000 },
      github: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        callbackUrl: 'http://localhost:3001/auth/github/callback',
      },
      encryption: { key: 'test-encryption-key-32chars!!!' },
      errorTracking: { logGroupName: '/test/logs', environment: 'production' },
      cors: { origin: 'https://app.example.com' },
    });
    const res = await request(productionApp).get('/health');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('should not set Strict-Transport-Security header in development', async () => {
    // In development mode, HSTS should not be set to allow local HTTP
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('should set Content-Security-Policy header', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-src 'none'");
  });
});

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
  return { default: passport };
});

// Mock the scheduler to prevent cron jobs from starting
vi.mock('../services/scheduler.js', () => ({
  startScheduler: () => {},
}));

import app from '../index.js';

describe('Security Headers (helmet)', () => {
  it('should set X-Content-Type-Options to nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should set X-Frame-Options to DENY', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('should set Strict-Transport-Security header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('should not set Content-Security-Policy (disabled for SPA)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toBeUndefined();
  });
});

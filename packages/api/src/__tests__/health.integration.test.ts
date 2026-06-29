// Requirements: 3.1, 3.2, 3.4
// Integration tests for the GET /health endpoint.
// Validates: healthy response shape, degraded response on DB failure, response time.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock prisma to control database connectivity behavior
vi.mock('../lib/prisma.js', () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
  },
}));

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

import prisma from '../lib/prisma.js';
import app from '../index.js';

describe('GET /health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when database is available', () => {
    beforeEach(() => {
      (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);
    });

    it('returns HTTP 200 with status "healthy"', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('returns the expected response shape with all required fields', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String),
        uptime: expect.any(Number),
        checks: {
          database: {
            status: 'connected',
            latencyMs: expect.any(Number),
          },
        },
      });
    });

    it('returns a valid ISO timestamp', async () => {
      const res = await request(app).get('/health');

      const timestamp = new Date(res.body.timestamp);
      expect(timestamp.toISOString()).toBe(res.body.timestamp);
    });

    it('returns a positive uptime value', async () => {
      const res = await request(app).get('/health');

      expect(res.body.uptime).toBeGreaterThan(0);
    });

    it('returns a non-negative database latency', async () => {
      const res = await request(app).get('/health');

      expect(res.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('when database connection fails', () => {
    beforeEach(() => {
      (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused'),
      );
    });

    it('returns HTTP 503 with status "degraded"', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
    });

    it('returns database status as "disconnected" without latencyMs', async () => {
      const res = await request(app).get('/health');

      expect(res.body.checks.database.status).toBe('disconnected');
      expect(res.body.checks.database.latencyMs).toBeUndefined();
    });

    it('still includes timestamp, version, and uptime in degraded response', async () => {
      const res = await request(app).get('/health');

      expect(res.body.timestamp).toBeDefined();
      expect(res.body.version).toBeDefined();
      expect(res.body.uptime).toBeGreaterThan(0);
    });
  });

  describe('response time', () => {
    beforeEach(() => {
      (prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);
    });

    it('responds within 3 seconds', async () => {
      const start = performance.now();
      await request(app).get('/health');
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(3000);
    });
  });
});

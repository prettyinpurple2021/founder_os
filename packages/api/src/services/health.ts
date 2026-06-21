/**
 * Health Check Service
 *
 * Checks database connectivity and measures latency.
 * Returns structured health status for the API.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import prisma from '../lib/prisma.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const pkg = require(resolve(__dirname, '../../package.json')) as { version: string };

export interface DatabaseCheckResult {
  status: 'connected' | 'disconnected';
  latencyMs?: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: DatabaseCheckResult;
  };
}

/**
 * Checks database connectivity by executing a simple SELECT 1 query.
 * Measures the round-trip latency in milliseconds.
 */
async function checkDatabase(): Promise<DatabaseCheckResult> {
  const start = performance.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    const latencyMs = Math.round(performance.now() - start);
    return { status: 'connected', latencyMs };
  } catch {
    return { status: 'disconnected' };
  }
}

/**
 * Performs a full health check including database connectivity.
 * Returns the structured health response.
 */
export async function getHealthStatus(): Promise<HealthCheckResponse> {
  const database = await checkDatabase();

  const status = database.status === 'connected' ? 'healthy' : 'degraded';

  return {
    status,
    timestamp: new Date().toISOString(),
    version: pkg.version,
    uptime: process.uptime(),
    checks: {
      database,
    },
  };
}

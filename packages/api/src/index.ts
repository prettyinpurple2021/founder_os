// Requirements: 3.5, 3.6, 4.1, 6.1, 7.3, 7.4, 7.7
// API entry point. Loads structured configuration at startup, wires middleware,
// routes (health without auth), and error logging in correct order.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import passport, { initializePassport } from './auth/passport.js';
import { createAuthRouter } from './routes/auth.js';
import reposRoutes from './routes/repos.js';
import syncRoutes from './routes/sync.js';
import tasksRoutes from './routes/tasks.js';
import checklistRoutes from './routes/checklist.js';
import marketingRoutes from './routes/marketing.js';
import contentRoutes from './routes/content.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationsRoutes from './routes/notifications.js';
import healthRoutes from './routes/health.js';
import errorsRoutes from './routes/errors.js';
import { notFound } from './errors/AppError.js';
import { errorLogger, registerProcessErrorHandlers } from './middleware/errorLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { traceIdMiddleware } from './middleware/traceId.js';
import { sessionExpiration } from './middleware/sessionExpiration.js';
import { staleDataIndicator } from './middleware/staleDataIndicator.js';
import { generalLimiter, authLimiter, contentGenerationLimiter } from './middleware/rateLimit.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { startScheduler } from './services/scheduler.js';
import { loadConfig, type AppConfig } from './config/index.js';
import { buildDatabaseUrl } from './config/databaseUrl.js';

// Load .env for local development (Secrets Manager overrides in production)
dotenv.config();

// Initialize passport after env vars are loaded
initializePassport();

/**
 * Resolve the CORS origin based on config and environment mode.
 * - Production: use the configured production frontend domain from config.
 * - Development: allow localhost origins permissively.
 */
function resolveCorsOrigin(config: AppConfig): string | string[] {
  if (config.nodeEnv === 'production') {
    return config.cors.origin;
  }
  // Development mode: allow common local origins
  return [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];
}

/**
 * Create and configure the Express app using the validated config object.
 */
export function createApp(config: AppConfig): express.Application {
  const app = express();
  const isProduction = config.nodeEnv === 'production';

  // --- Security headers (helmet) ---
  // Requirement 7.4: Strict-Transport-Security with max-age 1 year, includeSubDomains
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameSrc: ["'none'"],
          frameAncestors: ["'none'"], // Prevent this API from being framed (clickjacking)
        },
      },
      frameguard: { action: 'deny' },
      hsts: isProduction
        ? {
            maxAge: 31536000, // 1 year in seconds
            includeSubDomains: true,
          }
        : false,
      noSniff: true,
    }),
  );

  // --- CORS ---
  // Requirement 7.3: CORS origin set to production frontend domain only in production
  app.use(
    cors({
      origin: resolveCorsOrigin(config),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      exposedHeaders: ['X-CSRF-Token'],
    }),
  );
  app.use(express.json());

  // --- Request tracing (assign trace ID early for all downstream middleware/routes) ---
  // Requirement 10.7: correlate API request logs with trace IDs for end-to-end tracing
  app.use(traceIdMiddleware);

  // --- Session middleware ---
  // Requirement 7.7: session cookies with Secure, HttpOnly, SameSite=Strict in production
  app.use(
    session({
      name: 'solo.sid',
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      proxy: isProduction,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: config.session.maxAge,
      },
    }),
  );

  // --- Passport initialization ---
  app.use(passport.initialize());
  app.use(passport.session());

  // --- CSRF protection (synchronizer token pattern, applied after session) ---
  // Generates a per-session token, exposes it in the X-CSRF-Token response header,
  // and validates it on all state-mutating requests. Satisfies js/missing-token-validation.
  app.use(csrfMiddleware);

  // --- Session expiration check (after Passport, before routes) ---
  app.use(sessionExpiration);

  // --- Rate limiting (after session, before routes) ---
  app.use(generalLimiter);

  // --- Stale data indicator (after auth, before routes) ---
  app.use(staleDataIndicator);

  // --- Health check (no auth required) ---
  // Requirement 3.5: accessible without authentication
  app.use('/health', healthRoutes);

  // --- Frontend error reporting (no auth required) ---
  app.use('/api/errors', errorsRoutes);

  // --- Auth routes (stricter rate limit) ---
  app.use('/auth', authLimiter);
  app.use(createAuthRouter(config.cors.origin));

  // --- Repos routes ---
  app.use('/api/repos', reposRoutes);

  // --- Sync routes ---
  app.use('/api/sync', syncRoutes);

  // --- Tasks routes ---
  app.use('/api/tasks', tasksRoutes);

  // --- Checklist routes ---
  app.use('/api/checklist', checklistRoutes);

  // --- Marketing routes ---
  app.use('/api/marketing', marketingRoutes);

  // --- Content routes (generation endpoint has stricter limit) ---
  app.use('/api/content/generate', contentGenerationLimiter);
  app.use('/api/content', contentRoutes);

  // --- Dashboard routes ---
  app.use('/api/dashboard', dashboardRoutes);

  // --- Notifications routes ---
  app.use('/api/notifications', notificationsRoutes);

  // --- 404 catch-all (must be after all route definitions) ---
  app.use((_req, _res, next) => {
    next(notFound('The requested resource was not found'));
  });

  // --- Structured error logger (logs to stdout for CloudWatch) ---
  // Requirement 6.1: captures all unhandled exceptions as structured JSON
  app.use(errorLogger);

  // --- Centralized error handler (must be LAST middleware) ---
  app.use(errorHandler);

  return app;
}

/** Required byte-length for the encryption key (hex-encoded → 64 hex chars). */
const ENCRYPTION_KEY_LENGTH = 64;

/**
 * Build a config from environment variables synchronously (for test compatibility).
 * In production, bootstrap() uses loadConfig() which also integrates Secrets Manager
 * and runs validateConfig() — which enforces that all required secrets are present
 * and non-empty (SESSION_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ENCRYPTION_KEY).
 *
 * This synchronous path is only used for the test-compatibility default export.
 * Production secrets are never needed here; tests supply their own values or mocks.
 */
function buildConfigFromEnv(): AppConfig {
  const env = process.env;
  const isDev = (env.NODE_ENV ?? 'development') !== 'production';

  // In production, required secrets must be supplied — fail fast with a clear message
  // rather than silently using placeholder values.
  if (!isDev) {
    const missing = [
      !env.SESSION_SECRET && 'SESSION_SECRET',
      !env.GITHUB_CLIENT_ID && 'GITHUB_CLIENT_ID',
      !env.GITHUB_CLIENT_SECRET && 'GITHUB_CLIENT_SECRET',
      !env.ENCRYPTION_KEY && 'ENCRYPTION_KEY',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(
        `[config] Required environment variables are not set in production: ${missing.join(', ')}`,
      );
    }
  }

  return {
    port: env.PORT ? parseInt(env.PORT, 10) : 3001,
    nodeEnv: (env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    database: { url: buildDatabaseUrl(env) || 'postgresql://localhost:5432/test' },
    session: {
      secret: env.SESSION_SECRET ?? (isDev ? 'unsafe-dev-secret' : ''),
      maxAge: env.SESSION_MAX_AGE ? parseInt(env.SESSION_MAX_AGE, 10) : 86400000,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID ?? '',
      clientSecret: env.GITHUB_CLIENT_SECRET ?? '',
      callbackUrl: env.GITHUB_CALLBACK_URL ?? 'http://localhost:3001/auth/github/callback',
    },
    encryption: { key: env.ENCRYPTION_KEY ?? (isDev ? '0'.repeat(ENCRYPTION_KEY_LENGTH) : '') },
    errorTracking: {
      logGroupName: env.ERROR_LOG_GROUP_NAME ?? '/solo-founder-launch-os/api',
      environment: env.NODE_ENV ?? 'development',
    },
    cors: { origin: env.FRONTEND_URL ?? env.CORS_ORIGIN ?? 'http://localhost:5173' },
  };
}

/**
 * App instance created from environment variables for backward-compatible imports.
 * Tests and supertest use this default export directly.
 */
const app = createApp(buildConfigFromEnv());
export default app;

/**
 * Bootstrap the application: load validated config (with Secrets Manager in production),
 * create app, and start listening.
 * loadConfig() validates all required values and exits with a descriptive error
 * if any are missing (Requirements 4.1, 4.3).
 */
async function bootstrap(): Promise<void> {
  const config = await loadConfig();

  const bootstrappedApp = createApp(config);

  bootstrappedApp.listen(config.port, () => {
    process.stdout.write(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        service: 'api',
        message: `Server running on http://localhost:${config.port}`,
        port: config.port,
        environment: config.nodeEnv,
      }) + '\n',
    );
    registerProcessErrorHandlers();
    startScheduler();
  });
}

// Only start the server when running as the main module (not when imported by tests)
const isMainModule =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/index.js') || process.argv[1].endsWith('/index.ts'));

if (isMainModule) {
  bootstrap().catch((err) => {
    console.error('[api] Fatal startup error:', err);
    process.exit(1);
  });
}

// Requirements: 7.3, 7.4, 7.7
// CORS locked to production frontend domain, HSTS enforced, secure session cookies in production.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import passport from './auth/passport.js';
import authRoutes from './routes/auth.js';
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
import { sessionExpiration } from './middleware/sessionExpiration.js';
import { staleDataIndicator } from './middleware/staleDataIndicator.js';
import { generalLimiter, authLimiter, contentGenerationLimiter } from './middleware/rateLimit.js';
import { startScheduler } from './services/scheduler.js';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

/**
 * Resolve the CORS origin based on environment mode.
 * - Production: use the configured production frontend domain (FRONTEND_URL or CORS_ORIGIN).
 * - Development: allow localhost origins permissively.
 */
function resolveCorsOrigin(): string | string[] {
  if (isProduction) {
    const productionOrigin = process.env.FRONTEND_URL || process.env.CORS_ORIGIN;
    if (!productionOrigin) {
      console.error(
        '[api] FATAL: FRONTEND_URL or CORS_ORIGIN must be set in production mode for CORS.',
      );
      process.exit(1);
    }
    return productionOrigin;
  }
  // Development mode: allow common local origins
  return [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];
}

// Warn if using default session secret in production
if (
  isProduction &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret-change-me')
) {
  console.warn(
    '[api] WARNING: SESSION_SECRET is not set or is using the default placeholder in production. ' +
      'Please set a strong, unique secret via the SESSION_SECRET environment variable.',
  );
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// --- Security headers (helmet) ---
// Requirement 7.4: Strict-Transport-Security with max-age 1 year, includeSubDomains
app.use(
  helmet({
    contentSecurityPolicy: false, // Let the SPA manage CSP
    frameguard: { action: 'deny' }, // X-Frame-Options: DENY
    hsts: isProduction
      ? {
          maxAge: 31536000, // 1 year in seconds
          includeSubDomains: true,
        }
      : false, // Disable HSTS in development to avoid browser caching issues
    noSniff: true, // X-Content-Type-Options: nosniff (enabled by default, explicit for clarity)
  }),
);

// --- CORS ---
// Requirement 7.3: CORS origin set to production frontend domain only in production,
// permissive localhost origins in development.
app.use(
  cors({
    origin: resolveCorsOrigin(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());

// --- Session middleware ---
// Requirement 7.7: session cookies with Secure, HttpOnly, SameSite=Strict in production
app.use(
  session({
    name: 'solo.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    proxy: isProduction, // trust reverse proxy in production
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// --- Passport initialization ---
app.use(passport.initialize());
app.use(passport.session());

// --- Session expiration check (after Passport, before routes) ---
app.use(sessionExpiration);

// --- Stale data indicator (after auth, before routes) ---
// Attaches staleness info to res.locals.staleness for use in route handlers
app.use(staleDataIndicator);

// --- Rate limiting (after session, before routes) ---
app.use(generalLimiter);

app.use('/health', healthRoutes);

// --- Frontend error reporting (no auth required) ---
app.use('/api/errors', errorsRoutes);

// --- Auth routes (stricter rate limit) ---
app.use('/auth', authLimiter);
app.use(authRoutes);

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
app.use(errorLogger);

// --- Centralized error handler (must be LAST middleware) ---
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[api] Server running on http://localhost:${PORT}`);
  registerProcessErrorHandlers();
  startScheduler();
});

export default app;

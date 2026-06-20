import express from 'express';
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
import { notFound } from './errors/AppError.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sessionExpiration } from './middleware/sessionExpiration.js';
import { staleDataIndicator } from './middleware/staleDataIndicator.js';
import { startScheduler } from './services/scheduler.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Warn if using default session secret in production
if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret-change-me')) {
  console.warn(
    '[api] WARNING: SESSION_SECRET is not set or is using the default placeholder in production. ' +
    'Please set a strong, unique secret via the SESSION_SECRET environment variable.'
  );
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(cors());
app.use(express.json());

// --- Session middleware ---
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
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// --- Passport initialization ---
app.use(passport.initialize());
app.use(passport.session());

// --- Session expiration check (after Passport, before routes) ---
app.use(sessionExpiration);

// --- Stale data indicator (after auth, before routes) ---
// Attaches staleness info to res.locals.staleness for use in route handlers
app.use(staleDataIndicator);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Auth routes ---
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

// --- Content routes ---
app.use('/api/content', contentRoutes);

// --- Dashboard routes ---
app.use('/api/dashboard', dashboardRoutes);

// --- Notifications routes ---
app.use('/api/notifications', notificationsRoutes);

// --- 404 catch-all (must be after all route definitions) ---
app.use((_req, _res, next) => {
  next(notFound('The requested resource was not found'));
});

// --- Centralized error handler (must be LAST middleware) ---
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[api] Server running on http://localhost:${PORT}`);
  startScheduler();
});

export default app;

/**
 * Frontend Error Reporter
 *
 * Catches uncaught errors and unhandled promise rejections,
 * then reports them to the API for structured logging to CloudWatch.
 *
 * Requirements: 6.7
 */

interface ErrorReport {
  message: string;
  stack: string | null;
  source: string | null;
  line: number | null;
  column: number | null;
  userAgent: string;
  url: string;
  timestamp: string;
}

/** Rate limiting: max reports per window to prevent flooding */
const MAX_REPORTS_PER_WINDOW = 10;
const WINDOW_MS = 60_000; // 1 minute

let reportCount = 0;
let windowStart = Date.now();

function isRateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    reportCount = 0;
    windowStart = now;
  }
  if (reportCount >= MAX_REPORTS_PER_WINDOW) {
    return true;
  }
  reportCount++;
  return false;
}

function sendErrorReport(report: ErrorReport): void {
  if (isRateLimited()) {
    return;
  }

  try {
    // Use navigator.sendBeacon for reliability (fires even during page unload)
    // Fall back to fetch for broader compatibility
    const payload = JSON.stringify(report);

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/errors', blob);
    } else {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Silently ignore — we cannot report errors about error reporting
      });
    }
  } catch {
    // Silently ignore — error reporting must never throw
  }
}

function handleError(event: ErrorEvent): void {
  const report: ErrorReport = {
    message: event.message || 'Unknown error',
    stack: event.error?.stack ?? null,
    source: event.filename || null,
    line: event.lineno || null,
    column: event.colno || null,
    userAgent: navigator.userAgent,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };

  sendErrorReport(report);
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : 'Unhandled promise rejection';
  const stack = reason instanceof Error ? (reason.stack ?? null) : null;

  const report: ErrorReport = {
    message,
    stack,
    source: null,
    line: null,
    column: null,
    userAgent: navigator.userAgent,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };

  sendErrorReport(report);
}

/**
 * Initialize the global error reporter.
 * Sets up listeners for uncaught errors and unhandled promise rejections.
 * Call once at application startup (e.g., in main.tsx).
 */
export function initErrorReporter(): void {
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
}

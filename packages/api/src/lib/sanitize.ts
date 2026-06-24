/**
 * Sanitizes a user-controlled string for safe inclusion in structured log entries.
 *
 * Strips newlines and control characters to prevent log-injection attacks when
 * entries are parsed line-by-line. Collapses resulting whitespace runs, trims
 * leading/trailing spaces, and enforces a maximum character length.
 *
 * Handles null/undefined inputs by treating them as empty strings.
 */
export const sanitize = (s: string | null | undefined, maxLen: number): string =>
  (s ?? '')
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);

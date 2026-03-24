/**
 * Shared date formatting utilities.
 * All user-facing dates should use these helpers for consistency.
 *
 * Formats (all en-MY locale):
 *   full:   "Monday, 24 March"        — page headings, modal context
 *   medium: "24 Mar 2026"             — tables, history rows, timestamps
 *   short:  "24 Mar"                  — compact inline use
 */

const LOCALE = 'en-MY';

/** "Monday, 24 March 2026" */
export function formatDateFull(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "24 Mar 2026" */
export function formatDateMedium(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "24 Mar" */
export function formatDateShort(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
  });
}

/** Parse a "YYYY-MM-DD" string into a local Date (avoids timezone shift). */
export function parseDateString(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

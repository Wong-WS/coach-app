/**
 * Calendar date (YYYY-MM-DD) at `at` in `timeZone`. Servers run in UTC, so a
 * plain `new Date()` date is a day behind Malaysia between midnight and 8 am.
 */
export function isoDateInTimeZone(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export const COACH_TIME_ZONE = 'Asia/Kuala_Lumpur';

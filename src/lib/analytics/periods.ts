/**
 * Date-range helpers for the analytics page. Dates are `YYYY-MM-DD` strings
 * in local time; ranges are inclusive on both ends.
 */

export type DateRange = { start: string; end: string };

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** `month` is 1–12. */
export function monthRange(year: number, month: number): DateRange {
  return {
    start: ymd(new Date(year, month - 1, 1)),
    end: ymd(new Date(year, month, 0)),
  };
}

export function yearRange(year: number): DateRange {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Narrow a range to [min, max]; null when nothing is left. */
export function clampRange(range: DateRange, min?: string, max?: string): DateRange | null {
  const start = min && min > range.start ? min : range.start;
  const end = max && max < range.end ? max : range.end;
  return start <= end ? { start, end } : null;
}

/**
 * The calendar month before `period`. When `period` contains `today` (the
 * month is still running) it stops at the same day-of-month as today, capped
 * at that month's last day — so mid-month numbers compare like with like.
 */
export function comparisonRange(period: DateRange, today: string): DateRange {
  const start = parse(period.start);
  const prev = monthRange(
    start.getMonth() === 0 ? start.getFullYear() - 1 : start.getFullYear(),
    start.getMonth() === 0 ? 12 : start.getMonth(),
  );
  if (today < period.start || today > period.end) return prev;
  const sameDay = `${prev.start.slice(0, 8)}${today.slice(8)}`;
  return { start: prev.start, end: sameDay < prev.end ? sameDay : prev.end };
}

export function eachDate(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The "since 18 Apr" date for a year: the coach's first-ever lesson date when
 * it falls inside `year` after 1 January, otherwise null (full year).
 */
export function sinceDate(firstLogDate: string | null, year: number): string | null {
  if (!firstLogDate) return null;
  if (!firstLogDate.startsWith(`${year}-`)) return null;
  return firstLogDate > `${year}-01-01` ? firstLogDate : null;
}

import type { AwayPeriod } from '@/types';

/**
 * Returns the first away period containing `date` (inclusive on both ends),
 * or null if none.
 *
 * Dates are compared as YYYY-MM-DD strings — lexicographic ordering matches
 * chronological ordering for that format, no Date parsing needed.
 */
export function isDateInAwayPeriod(
  date: string,
  awayPeriods: AwayPeriod[],
): AwayPeriod | null {
  for (const p of awayPeriods) {
    if (date >= p.startDate && date <= p.endDate) return p;
  }
  return null;
}

/**
 * Returns every period whose range overlaps [start, end] (inclusive). Touching
 * boundaries (e.g. one ends Apr 30 and another starts May 1) do NOT overlap.
 *
 * Pass `excludeId` when editing an existing period to skip self-conflict.
 */
export function awayPeriodsOverlapping(
  start: string,
  end: string,
  awayPeriods: AwayPeriod[],
  excludeId?: string,
): AwayPeriod[] {
  const out: AwayPeriod[] = [];
  for (const p of awayPeriods) {
    if (excludeId && p.id === excludeId) continue;
    // Standard interval overlap: a.start <= b.end AND a.end >= b.start
    if (p.startDate <= end && p.endDate >= start) out.push(p);
  }
  return out;
}

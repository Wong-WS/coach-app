import type { Booking } from '@/types';
import { DAY_END, DAY_START, TRAVEL_MIN, toMin, toTime } from '@/lib/schedule-gaps';

/**
 * Free replacement slots of `lessonMinutes` at pool `poolId` on one date,
 * given that date's classes (from getClassesForDate). Travel time is kept
 * free on a side where the neighbouring class is at a different pool. In each
 * usable window, slots run back-to-back from its start, plus the slot ending
 * exactly at its end (the one right before a class, which coaches offer most).
 */
export function slotsForDate(
  classes: Booking[],
  poolId: string,
  lessonMinutes: number,
): { start: string; end: string }[] {
  const sorted = [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const starts = new Set<number>();

  const offer = (from: number, to: number) => {
    if (to - from < lessonMinutes) return;
    for (let s = from; s + lessonMinutes <= to; s += lessonMinutes) starts.add(s);
    starts.add(to - lessonMinutes);
  };
  const travel = (locationId: string) => (locationId === poolId ? 0 : TRAVEL_MIN);

  let freeFrom = toMin(DAY_START);
  let prev: Booking | null = null;
  for (const c of sorted) {
    const start = toMin(c.startTime);
    const end = toMin(c.endTime);
    const windowStart = freeFrom + (prev && toMin(prev.endTime) >= toMin(DAY_START) ? travel(prev.locationId) : 0);
    offer(windowStart, Math.min(start - travel(c.locationId), toMin(DAY_END)));
    if (end >= freeFrom) {
      freeFrom = Math.max(end, toMin(DAY_START));
      prev = c;
    }
  }
  offer(freeFrom + (prev && toMin(prev.endTime) >= toMin(DAY_START) ? travel(prev.locationId) : 0), toMin(DAY_END));

  return [...starts]
    .sort((a, b) => a - b)
    .map((s) => ({ start: toTime(s), end: toTime(s + lessonMinutes) }));
}

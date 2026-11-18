import type { Booking } from '@/types';

/**
 * Free time on the weekly Schedule page, and what new 1-hour class would fit
 * in it once travel between pools is counted. Fixed on purpose (no settings —
 * working-hours settings were removed and shouldn't come back):
 */
export const DAY_START = '08:00';
export const DAY_END = '21:00';
export const TRAVEL_MIN = 30; // between different pools; same pool needs none
export const CLASS_MIN = 60;
/** Weekdays only point at the slot right before the first class, not the whole morning. */
const WEEKDAY_LEAD_WINDOW = CLASS_MIN + TRAVEL_MIN;

type Place = { locationId: string | null; locationName: string | null }; // null = anywhere else

export type FreeFit =
  | (Place & { kind: 'slot'; start: string; end: string })
  | (Place & { kind: 'count'; count: number });

export type TimelineItem =
  | { kind: 'class'; booking: Booking }
  | { kind: 'free'; start: string; end: string; minutes: number; fits: FreeFit[] };

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const toTime = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const placeOf = (b: Booking): Place => ({ locationId: b.locationId, locationName: b.locationName });
const ANYWHERE: Place = { locationId: null, locationName: null };

function fit(place: Place, usable: number, slotStart: number): FreeFit | null {
  const count = Math.floor(usable / CLASS_MIN);
  if (count <= 0) return null;
  if (count === 1) return { kind: 'slot', ...place, start: toTime(slotStart), end: toTime(slotStart + CLASS_MIN) };
  return { kind: 'count', ...place, count };
}

/**
 * What fits in [start, end] between the class before (if any) and the class
 * after (if any). A class at the earlier pool goes right after it; at the
 * later pool, right before it; anywhere else needs travel on each side that
 * has a class.
 */
function fitsIn(start: number, end: number, before: Booking | null, after: Booking | null): FreeFit[] {
  const gap = end - start;
  if (before && after && before.locationId === after.locationId) {
    const f = fit(placeOf(before), gap, start);
    return f ? [f] : [];
  }
  const out: FreeFit[] = [];
  const bothSides = !!before && !!after;
  if (before) {
    const f = fit(placeOf(before), gap - (bothSides ? TRAVEL_MIN : 0), start);
    if (f) out.push(f);
  }
  if (after) {
    const usable = gap - (bothSides ? TRAVEL_MIN : 0);
    const f = fit(placeOf(after), usable, end - CLASS_MIN);
    if (f) out.push(f);
  }
  const sides = (before ? 1 : 0) + (after ? 1 : 0);
  const f = fit(ANYWHERE, gap - TRAVEL_MIN * sides, start + (before ? TRAVEL_MIN : 0));
  if (f) out.push(f);
  return out;
}

function free(start: number, end: number, fits: FreeFit[]): TimelineItem {
  return { kind: 'free', start: toTime(start), end: toTime(end), minutes: end - start, fits };
}

/**
 * One day of the weekly schedule as classes with free time around them.
 * - Before the first class: weekends show the whole morning from 8 am;
 *   weekdays span the morning but only point at the slot right before the
 *   first class.
 * - Between classes: every gap, even ones too short for a class.
 * - After the last class: what fits until 9 pm (only if an hour or more).
 */
export function dayTimeline(classes: Booking[], weekend: boolean): TimelineItem[] {
  const dayStart = toMin(DAY_START);
  const dayEnd = toMin(DAY_END);
  const sorted = [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (sorted.length === 0) return [free(dayStart, dayEnd, fitsIn(dayStart, dayEnd, null, null))];

  const items: TimelineItem[] = [];
  const first = sorted[0];
  const firstStart = toMin(first.startTime);
  if (firstStart > dayStart) {
    const lead = firstStart - dayStart;
    const fits =
      !weekend && lead > WEEKDAY_LEAD_WINDOW
        ? fitsIn(firstStart - WEEKDAY_LEAD_WINDOW, firstStart, null, first)
        : fitsIn(dayStart, firstStart, null, first);
    items.push(free(dayStart, firstStart, fits));
  }

  let last = first;
  let lastEnd = toMin(first.endTime);
  items.push({ kind: 'class', booking: first });
  for (const b of sorted.slice(1)) {
    const start = toMin(b.startTime);
    if (start > lastEnd) items.push(free(lastEnd, start, fitsIn(lastEnd, start, last, b)));
    items.push({ kind: 'class', booking: b });
    if (toMin(b.endTime) >= lastEnd) {
      lastEnd = toMin(b.endTime);
      last = b;
    }
  }

  if (dayEnd - lastEnd >= CLASS_MIN) items.push(free(lastEnd, dayEnd, fitsIn(lastEnd, dayEnd, last, null)));
  return items;
}

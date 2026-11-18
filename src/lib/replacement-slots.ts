import type { AwayPeriod, Booking, ClassException, DayOfWeek } from '@/types';
import { getClassesForDate, getDayOfWeekForDate } from '@/lib/class-schedule';
import { isDateInAwayPeriod } from '@/lib/away-periods';
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
  // A bad record (end not after start) must never hang the public page.
  if (!(lessonMinutes > 0)) return [];
  const sorted = [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const starts = new Set<number>();

  const offer = (from: number, to: number) => {
    if (to - from < lessonMinutes) return;
    for (let s = from; s + lessonMinutes <= to; s += lessonMinutes) starts.add(s);
    starts.add(to - lessonMinutes);
  };
  const travel = (locationId: string) => (locationId === poolId ? 0 : TRAVEL_MIN);

  // Track the latest class end from midnight, so travel after an early class
  // (e.g. one ending 7:45 at another pool) still pushes the first slot back.
  let freeFrom = 0;
  let prev: Booking | null = null;
  const windowStart = () => Math.max(toMin(DAY_START), freeFrom + (prev ? travel(prev.locationId) : 0));
  for (const c of sorted) {
    const start = toMin(c.startTime);
    const end = toMin(c.endTime);
    offer(windowStart(), Math.min(start - travel(c.locationId), toMin(DAY_END)));
    if (end >= freeFrom) {
      freeFrom = end;
      prev = c;
    }
  }
  offer(windowStart(), toMin(DAY_END));

  return [...starts]
    .sort((a, b) => a - b)
    .map((s) => ({ start: toTime(s), end: toTime(s + lessonMinutes) }));
}

// ── Sections for a family ───────────────────────────────────────────────────
// Everything below produces ONLY what parents may see: their pool's name,
// lesson length and free times. No ids, other pools, names or prices — this
// is serialized into the public portal page.

export type ReplacementSlot = { start: string; end: string; weekdayMorning: boolean };
export type ReplacementSection = {
  poolName: string;
  lessonMinutes: number;
  /** "Thu 4:30pm" — only when a family has more than one section. */
  forClass: string | null;
  /** Afternoon students: weekday slots before noon sit behind "Show morning slots". */
  hideWeekdayMornings: boolean;
  days: { date: string; slots: ReplacementSlot[] }[];
};

const AFTERNOON_FROM = '14:00';
const MORNING_UNTIL = '12:00';
const DAY_SHORT: Record<DayOfWeek, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + n);
  return iso(d);
}
/** Monday of the week containing `date`. */
function mondayOf(date: string): string {
  const day = parse(date).getDay(); // 0 = Sunday
  return addDays(date, day === 0 ? -6 : 1 - day);
}

const isWeekly = (b: Booking) => !b.startDate || b.startDate !== b.endDate;
const isRunning = (b: Booking, today: string) => !b.endDate || b.endDate >= today;

/** The student's main weekly class: at the pool with the most weekly classes, earliest start on ties. */
export function mainWeeklyClass(studentId: string, bookings: Booking[], today: string): Booking | null {
  const mine = bookings.filter(
    (b) => b.status === 'confirmed' && b.studentIds.includes(studentId) && isWeekly(b) && isRunning(b, today),
  );
  if (mine.length === 0) return null;
  const perPool = new Map<string, number>();
  for (const b of mine) perPool.set(b.locationId, (perPool.get(b.locationId) ?? 0) + 1);
  return [...mine].sort(
    (a, b) =>
      (perPool.get(b.locationId) ?? 0) - (perPool.get(a.locationId) ?? 0) ||
      a.startTime.localeCompare(b.startTime),
  )[0];
}

function classLabel(b: Booking): string {
  const [h, m] = b.startTime.split(':').map(Number);
  const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
  return `${DAY_SHORT[b.dayOfWeek]} ${time}`;
}

export function replacementSections(a: {
  studentIds: string[];
  bookings: Booking[];
  exceptions: ClassException[];
  awayPeriods: AwayPeriod[];
  today: string;
}): ReplacementSection[] {
  const confirmed = a.bookings.filter((b) => b.status === 'confirmed');
  const groups = new Map<string, Booking[]>();
  for (const sid of a.studentIds) {
    const main = mainWeeklyClass(sid, confirmed, a.today);
    if (!main) continue;
    const minutes = toMin(main.endTime) - toMin(main.startTime);
    if (!(minutes > 0)) continue; // bad record: skip rather than offer nonsense
    const key = `${main.locationId}|${minutes}`;
    const list = groups.get(key) ?? [];
    if (!list.some((b) => b.id === main.id)) list.push(main);
    groups.set(key, list);
  }
  if (groups.size === 0) return [];

  const first = addDays(a.today, 1);
  const last = addDays(mondayOf(a.today), 20); // Sunday of the week after next
  const dates: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (!isDateInAwayPeriod(d, a.awayPeriods)) dates.push(d);
  }
  const classesOn = new Map(dates.map((d) => [d, getClassesForDate(d, confirmed, a.exceptions, a.awayPeriods)]));

  return [...groups.values()].map((mains) => {
    const main = [...mains].sort((x, y) => x.startTime.localeCompare(y.startTime))[0];
    const lessonMinutes = toMin(main.endTime) - toMin(main.startTime);
    return {
      poolName: main.locationName,
      lessonMinutes,
      forClass: groups.size > 1 ? classLabel(main) : null,
      hideWeekdayMornings: mains.every((b) => b.startTime >= AFTERNOON_FROM),
      days: dates.map((date) => {
        const weekday = !['saturday', 'sunday'].includes(getDayOfWeekForDate(date));
        return {
          date,
          slots: slotsForDate(classesOn.get(date) ?? [], main.locationId, lessonMinutes).map((s) => ({
            ...s,
            weekdayMorning: weekday && s.start < MORNING_UNTIL,
          })),
        };
      }),
    };
  });
}

/** "This week" | "Next week" | "Week of 30 Nov" (weeks start on Monday). */
export function weekLabel(date: string, today: string): string {
  const thisMonday = mondayOf(today);
  const monday = mondayOf(date);
  if (monday === thisMonday) return 'This week';
  if (monday === addDays(thisMonday, 7)) return 'Next week';
  const d = parse(monday);
  return `Week of ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

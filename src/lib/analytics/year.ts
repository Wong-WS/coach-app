import type { AwayPeriod, Booking, ClassException, DayOfWeek, LessonLog, Student } from '@/types';
import { isDateInAwayPeriod } from '@/lib/away-periods';
import { getDayOfWeekForDate } from '@/lib/class-schedule';
import { classKey } from '@/lib/lesson-logs';
import { eachDate, monthRange, yearRange, type DateRange } from './periods';
import { stillToCome, taughtIn, type Tally } from './projection';

type ScheduleInputs = {
  logs: LessonLog[];
  bookings: Booking[]; // confirmed only
  exceptions: ClassException[];
  awayPeriods: AwayPeriod[];
  cancelRate: number;
};

function afterCancellations(t: Tally, rate: number): Tally {
  return { classes: Math.round(t.classes * (1 - rate)), cents: Math.round(t.cents * (1 - rate)) };
}

/** Taught so far this year + still to come to 31 Dec, less the usual cancellation rate. */
export function yearForecast(a: ScheduleInputs & { year: number; today: string }): {
  taught: Tally;
  toCome: Tally;
  forecast: Tally;
} {
  const range = yearRange(a.year);
  const taught = taughtIn(range, a.logs);
  const toCome = afterCancellations(
    stillToCome(range, a.today, a.bookings, a.exceptions, a.awayPeriods, a.logs),
    a.cancelRate,
  );
  return {
    taught,
    toCome,
    forecast: { classes: taught.classes + toCome.classes, cents: taught.cents + toCome.cents },
  };
}

export interface MonthBar {
  month: number; // 1–12
  cents: number;
  kind: 'actual' | 'forecast';
  partial: boolean;
}

/**
 * RM taught per month. Months up to and including today's are actual; later
 * months are a forecast. Starts at the first-lesson month when that falls in
 * `year`, else January.
 */
export function monthlyTaught(
  a: ScheduleInputs & { year: number; today: string; firstLogDate: string | null },
): MonthBar[] {
  const firstInYear = a.firstLogDate?.startsWith(`${a.year}-`) ? a.firstLogDate : null;
  const firstMonth = firstInYear ? Number(firstInYear.slice(5, 7)) : 1;
  const todayMonth = a.today.startsWith(`${a.year}-`) ? Number(a.today.slice(5, 7)) : a.today < `${a.year}` ? 0 : 12;

  const bars: MonthBar[] = [];
  for (let month = firstMonth; month <= 12; month++) {
    const range = monthRange(a.year, month);
    const partial = !!firstInYear && month === firstMonth && !firstInYear.endsWith('-01');
    if (month <= todayMonth) {
      bars.push({ month, cents: taughtIn(range, a.logs).cents, kind: 'actual', partial });
    } else {
      const raw = stillToCome(range, a.today, a.bookings, a.exceptions, a.awayPeriods, a.logs);
      bars.push({ month, cents: afterCancellations(raw, a.cancelRate).cents, kind: 'forecast', partial });
    }
  }
  return bars;
}

/**
 * Every day in `range` is Worked (≥1 lesson marked done), Time off (inside a
 * planned away period, not worked) or Other. Callers clamp `range` to
 * since-date…today.
 */
export function daysSplit(
  range: DateRange,
  logs: LessonLog[],
  awayPeriods: AwayPeriod[],
): { worked: number; timeOff: number; other: number } {
  const worked = new Set(logs.map((l) => l.date));
  const out = { worked: 0, timeOff: 0, other: 0 };
  for (const date of eachDate(range)) {
    if (worked.has(date)) out.worked += 1;
    else if (isDateInAwayPeriod(date, awayPeriods)) out.timeOff += 1;
    else out.other += 1;
  }
  return out;
}

function distinctClasses(logs: LessonLog[]): LessonLog[] {
  const seen = new Map<string, LessonLog>();
  for (const l of logs) {
    const k = classKey(l);
    if (!seen.has(k)) seen.set(k, l);
  }
  return [...seen.values()];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes coached: each class once, end − start. */
export function minutesTaught(logs: LessonLog[]): number {
  return distinctClasses(logs).reduce(
    (sum, l) => sum + Math.max(0, toMinutes(l.endTime) - toMinutes(l.startTime)),
    0,
  );
}

export function classesByWeekday(logs: LessonLog[]): Record<DayOfWeek, number> {
  const counts: Record<DayOfWeek, number> = {
    monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0,
  };
  for (const l of distinctClasses(logs)) counts[getDayOfWeekForDate(l.date)] += 1;
  return counts;
}

const WEEK: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Day with the most classes (Monday first on ties); null with no classes. */
export function busiestDay(weekdays: Record<DayOfWeek, number>): DayOfWeek | null {
  let best: DayOfWeek | null = null;
  for (const d of WEEK) if (weekdays[d] > 0 && (!best || weekdays[d] > weekdays[best])) best = d;
  return best;
}

/**
 * Most common (weekday, start hour) across classes; null with no lessons.
 * Ties go to the earlier weekday, then the earlier hour, so the answer doesn't
 * depend on the order lessons were loaded in.
 */
export function busiestSlot(logs: LessonLog[]): { day: DayOfWeek; hour: number } | null {
  const counts = new Map<string, { day: DayOfWeek; hour: number; count: number }>();
  for (const l of distinctClasses(logs)) {
    const day = getDayOfWeekForDate(l.date);
    const hour = Number(l.startTime.slice(0, 2));
    const key = `${day}|${hour}`;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { day, hour, count: 1 });
  }
  const ranked = [...counts.values()].sort(
    (a, b) => b.count - a.count || WEEK.indexOf(a.day) - WEEK.indexOf(b.day) || a.hour - b.hour,
  );
  return ranked[0] ? { day: ranked[0].day, hour: ranked[0].hour } : null;
}

/**
 * - taught: distinct students with a lesson in the year.
 * - newThisYear: of those, students created that year (students are created
 *   when first booked). null in the coach's first year, where it'd be everyone.
 * - stopped: current year → taught this year but on no running booking now;
 *   past year → taught that year but not in `laterLogs`.
 */
export function studentStats(a: {
  year: number;
  today: string;
  yearLogs: LessonLog[];
  laterLogs: LessonLog[];
  students: Student[];
  confirmedBookings: Booking[];
  isFirstYear: boolean;
}): { taught: number; newThisYear: number | null; stopped: number } {
  const taught = new Set(a.yearLogs.map((l) => l.studentId));
  const createdYear = new Map(a.students.map((s) => [s.id, s.createdAt.getFullYear()]));

  const newThisYear = a.isFirstYear
    ? null
    : [...taught].filter((sid) => createdYear.get(sid) === a.year).length;

  const isCurrentYear = a.today.startsWith(`${a.year}-`);
  const stillActive = new Set<string>();
  if (isCurrentYear) {
    for (const b of a.confirmedBookings) {
      if (b.endDate && b.endDate < a.today) continue;
      for (const sid of b.studentIds) stillActive.add(sid);
    }
  } else {
    for (const l of a.laterLogs) stillActive.add(l.studentId);
  }
  const stopped = [...taught].filter((sid) => !stillActive.has(sid)).length;

  return { taught: taught.size, newThisYear, stopped };
}

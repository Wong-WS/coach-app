import type { AwayPeriod, Booking, ClassException, LessonLog } from '@/types';
import { getBookingTotalCents, getClassesForDate } from '@/lib/class-schedule';
import { countClasses } from '@/lib/lesson-logs';
import { clampRange, eachDate, type DateRange } from './periods';

export type Tally = { classes: number; cents: number };

/** Lessons marked done in `range`: classes (deduped) and RM charged. */
export function taughtIn(range: DateRange, logs: LessonLog[]): Tally {
  const inRange = logs.filter((l) => l.date >= range.start && l.date <= range.end);
  return {
    classes: countClasses(inRange),
    cents: inRange.reduce((sum, l) => sum + l.priceCents, 0),
  };
}

/**
 * Scheduled classes from max(range.start, today) to range.end that have not
 * been marked done yet. Today's unfinished classes count; past days never
 * marked done do not (they just weren't taught). `bookings` must be
 * confirmed-only.
 */
export function stillToComeByDate(
  range: DateRange,
  today: string,
  bookings: Booking[],
  exceptions: ClassException[],
  awayPeriods: AwayPeriod[],
  logs: LessonLog[],
): { date: string; booking: Booking }[] {
  const window = clampRange(range, today);
  if (!window) return [];
  const done = new Set(logs.map((l) => `${l.bookingId}|${l.date}`));
  const out: { date: string; booking: Booking }[] = [];
  for (const date of eachDate(window)) {
    for (const booking of getClassesForDate(date, bookings, exceptions, awayPeriods)) {
      if (!done.has(`${booking.id}|${date}`)) out.push({ date, booking });
    }
  }
  return out;
}

export function stillToCome(
  range: DateRange,
  today: string,
  bookings: Booking[],
  exceptions: ClassException[],
  awayPeriods: AwayPeriod[],
  logs: LessonLog[],
): Tally {
  const classes = stillToComeByDate(range, today, bookings, exceptions, awayPeriods, logs);
  return {
    classes: classes.length,
    cents: classes.reduce((sum, c) => sum + getBookingTotalCents(c.booking), 0),
  };
}

/** Projected = taught so far + still to come. Shared by Analytics and Payments. */
export function projectPeriod(
  range: DateRange,
  today: string,
  bookings: Booking[],
  exceptions: ClassException[],
  awayPeriods: AwayPeriod[],
  logs: LessonLog[],
): { taught: Tally; toCome: Tally; projected: Tally } {
  const taught = taughtIn(range, logs);
  const toCome = stillToCome(range, today, bookings, exceptions, awayPeriods, logs);
  return {
    taught,
    toCome,
    projected: { classes: taught.classes + toCome.classes, cents: taught.cents + toCome.cents },
  };
}

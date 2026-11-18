import type { Booking, ClassException } from '@/types';
import type { CancelReason } from '@/lib/cancel-reasons';
import { getDayOfWeekForDate } from '@/lib/class-schedule';
import type { DateRange } from './periods';

/** Reason shown on the analytics page. 'none' = cancelled before reasons were tracked. */
export type ReasonBucket = 'weather' | 'student' | 'coach' | 'other' | 'none';

export interface CancellationRecord {
  date: string;
  bucket: ReasonBucket;
  bookingId: string;
  studentIds: string[];
}

function inRange(date: string | undefined, range: DateRange): date is string {
  return !!date && date >= range.start && date <= range.end;
}

/**
 * Would this booking really have run on `date`? Filters out exceptions left
 * behind when "edit this + future" split a series or changed its weekday.
 */
function wouldHaveRun(booking: Booking, date: string): boolean {
  if (getDayOfWeekForDate(date) !== booking.dayOfWeek) return false;
  if (booking.startDate && date < booking.startDate) return false;
  if (booking.endDate && date > booking.endDate) return false;
  return true;
}

function bucketOf(reason: CancelReason | undefined): ReasonBucket {
  return reason && reason !== 'away' ? reason : 'none';
}

/**
 * Cancellations in `range` (spec: "Cancellation"). Weekly classes come from
 * cancelled exceptions, dated on the day the class would actually have run
 * (`newDate` if it had been moved). One-off classes come from soft-cancelled
 * bookings. Time off ('away') is never a cancellation.
 *
 * `allBookings` must hold bookings of every status — soft-cancelled one-offs
 * and ended series are looked up in it.
 */
export function collectCancellations(
  range: DateRange,
  exceptions: ClassException[],
  allBookings: Booking[],
): CancellationRecord[] {
  const byId = new Map(allBookings.map((b) => [b.id, b]));
  const out: CancellationRecord[] = [];

  for (const ex of exceptions) {
    if (ex.type !== 'cancelled' || ex.reason === 'away') continue;
    const date = ex.newDate ?? ex.originalDate;
    if (!inRange(date, range)) continue;
    const booking = byId.get(ex.bookingId);
    if (!booking || !wouldHaveRun(booking, ex.originalDate)) continue;
    out.push({
      date,
      bucket: bucketOf(ex.reason),
      bookingId: booking.id,
      studentIds: ex.newStudentIds ?? booking.studentIds,
    });
  }

  for (const b of allBookings) {
    if (b.status !== 'cancelled' || !b.cancelReason || b.cancelReason === 'away') continue;
    if (!b.startDate || b.startDate !== b.endDate || !inRange(b.startDate, range)) continue;
    out.push({ date: b.startDate, bucket: bucketOf(b.cancelReason), bookingId: b.id, studentIds: b.studentIds });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function reasonCounts(records: CancellationRecord[]): Record<ReasonBucket, number> {
  const counts: Record<ReasonBucket, number> = { weather: 0, student: 0, coach: 0, other: 0, none: 0 };
  for (const r of records) counts[r.bucket] += 1;
  return counts;
}

/**
 * Weekly classes actually moved in `range` (by original date): to a new date
 * or a new start time. One-date edits of students, price, note, name or
 * location also write a 'rescheduled' exception and are not counted.
 */
export function countReschedules(
  range: DateRange,
  exceptions: ClassException[],
  allBookings: Booking[],
): number {
  const byId = new Map(allBookings.map((b) => [b.id, b]));
  let count = 0;
  for (const ex of exceptions) {
    if (ex.type !== 'rescheduled' || !inRange(ex.originalDate, range)) continue;
    const booking = byId.get(ex.bookingId);
    if (!booking || !wouldHaveRun(booking, ex.originalDate)) continue;
    const movedDate = !!ex.newDate && ex.newDate !== ex.originalDate;
    const movedTime = !!ex.newStartTime && ex.newStartTime !== booking.startTime;
    if (movedDate || movedTime) count += 1;
  }
  return count;
}

/** Share of scheduled classes that got cancelled: cancelled ÷ (cancelled + taught). */
export function cancellationRate(cancelled: number, taughtClasses: number): number {
  const total = cancelled + taughtClasses;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, cancelled / total));
}

import { Booking, ClassException, DayOfWeek } from '@/types';

const DAY_NAMES: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function getDayOfWeekForDate(dateStr: string): DayOfWeek {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return DAY_NAMES[date.getDay()];
}

export function getClassesForDate(
  date: string,
  bookings: Booking[],
  exceptions: ClassException[]
): Booking[] {
  const dayOfWeek = getDayOfWeekForDate(date);

  // Start with bookings for this day of week, excluding those that haven't started yet
  let classes = bookings.filter((b) => b.dayOfWeek === dayOfWeek && (!b.startDate || date >= b.startDate));

  // Remove bookings that have a cancelled or rescheduled exception for this date
  const cancelledOrMovedIds = new Set(
    exceptions
      .filter((e) => e.originalDate === date && (e.type === 'cancelled' || e.type === 'rescheduled'))
      .map((e) => e.bookingId)
  );
  classes = classes.filter((b) => !cancelledOrMovedIds.has(b.id));

  // Add bookings rescheduled TO this date (with optional time override)
  // But skip if there's also a cancellation for this booking on this date
  const cancelledOnThisDate = new Set(
    exceptions
      .filter((e) => e.originalDate === date && e.type === 'cancelled')
      .map((e) => e.bookingId)
  );
  const rescheduledToThisDate = exceptions.filter(
    (e) => e.type === 'rescheduled' && e.newDate === date
  );
  for (const exception of rescheduledToThisDate) {
    const originalBooking = bookings.find((b) => b.id === exception.bookingId);
    if (originalBooking && !classes.some((c) => c.id === originalBooking.id) && !cancelledOnThisDate.has(originalBooking.id)) {
      if (exception.newStartTime && exception.newEndTime) {
        classes.push({ ...originalBooking, startTime: exception.newStartTime, endTime: exception.newEndTime });
      } else {
        classes.push(originalBooking);
      }
    }
  }

  // Sort by start time
  return classes.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function isRescheduledToDate(
  bookingId: string,
  date: string,
  exceptions: ClassException[]
): boolean {
  return exceptions.some(
    (e) => e.bookingId === bookingId && e.type === 'rescheduled' && e.newDate === date
  );
}

export interface CancelledClass {
  booking: Booking;
  exceptionId: string;
}

export function getCancelledClassesForDate(
  date: string,
  bookings: Booking[],
  exceptions: ClassException[]
): CancelledClass[] {
  const cancelledExceptions = exceptions.filter(
    (e) => e.originalDate === date && e.type === 'cancelled'
  );

  const result: CancelledClass[] = [];
  for (const ex of cancelledExceptions) {
    const booking = bookings.find((b) => b.id === ex.bookingId);
    if (booking) {
      result.push({ booking, exceptionId: ex.id });
    }
  }

  return result.sort((a, b) => a.booking.startTime.localeCompare(b.booking.startTime));
}

import { Booking, ClassException, DayOfWeek } from '@/types';

const DAY_NAMES: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function getDayOfWeekForDate(dateStr: string): DayOfWeek {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return DAY_NAMES[date.getDay()];
}

export function getBookingTotal(
  booking: Pick<Booking, 'studentPrices'>,
): number {
  return Object.values(booking.studentPrices).reduce((sum, p) => sum + (p ?? 0), 0);
}

export function isGroupBooking(
  booking: Pick<Booking, 'studentIds'>,
): boolean {
  return booking.studentIds.length > 1;
}

export function getClassesForDate(
  date: string,
  bookings: Booking[],
  exceptions: ClassException[]
): Booking[] {
  const dayOfWeek = getDayOfWeekForDate(date);

  // Start with bookings for this day of week, within their active date range
  let classes = bookings.filter((b) => b.dayOfWeek === dayOfWeek && (!b.startDate || date >= b.startDate) && (!b.endDate || date <= b.endDate));

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
    if (originalBooking && !cancelledOnThisDate.has(originalBooking.id)) {
      const overrides: Partial<Booking> = {};
      if (exception.newStartTime) overrides.startTime = exception.newStartTime;
      if (exception.newEndTime) overrides.endTime = exception.newEndTime;
      if (exception.newLocationId) overrides.locationId = exception.newLocationId;
      if (exception.newLocationName) overrides.locationName = exception.newLocationName;
      if (exception.newNote !== undefined) overrides.notes = exception.newNote;
      if (exception.newClassName !== undefined) overrides.className = exception.newClassName;
      if (exception.newStudentIds !== undefined) overrides.studentIds = exception.newStudentIds;
      if (exception.newStudentPrices !== undefined) overrides.studentPrices = exception.newStudentPrices;
      if (exception.newStudentWallets !== undefined) overrides.studentWallets = exception.newStudentWallets;

      const existingIdx = classes.findIndex((c) => c.id === originalBooking.id);
      if (existingIdx >= 0) {
        // Same-date edit: apply overrides to the existing entry
        classes[existingIdx] = { ...classes[existingIdx], ...overrides };
      } else {
        // Different-date reschedule: add with overrides
        classes.push({ ...originalBooking, ...overrides });
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

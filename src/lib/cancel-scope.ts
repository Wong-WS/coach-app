import type { Booking, ClassException, DayOfWeek } from '@/types';

export type CancelFutureResult =
  | { action: 'endDate'; newEndDate: string; exceptionIdsToDelete: string[] }
  | { action: 'delete'; exceptionIdsToDelete: string[] };

const DAY_NAMES: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Walk back from the day before `selectedDate` until we hit the booking's
// dayOfWeek. The result is the last real class date — so capping endDate
// there produces a range that exactly covers the remaining occurrences.
// When only the series-start occurrence remains, startDate === endDate and
// the booking is correctly treated as a one-time class.
function previousOccurrence(selectedDate: string, dayOfWeek: DayOfWeek): string {
  const [y, m, d] = selectedDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  for (let i = 0; i < 7; i++) {
    if (DAY_NAMES[date.getDay()] === dayOfWeek) break;
    date.setDate(date.getDate() - 1);
  }
  return formatDate(date);
}

export function computeCancelFuture(
  booking: Booking,
  exceptions: ClassException[],
  selectedDate: string,
): CancelFutureResult {
  const lastOccurrence = previousOccurrence(selectedDate, booking.dayOfWeek);
  const ownExceptions = exceptions.filter((e) => e.bookingId === booking.id);

  if (booking.startDate && lastOccurrence < booking.startDate) {
    return {
      action: 'delete',
      exceptionIdsToDelete: ownExceptions.map((e) => e.id),
    };
  }

  return {
    action: 'endDate',
    newEndDate: lastOccurrence,
    exceptionIdsToDelete: ownExceptions
      .filter((e) => e.originalDate >= selectedDate)
      .map((e) => e.id),
  };
}

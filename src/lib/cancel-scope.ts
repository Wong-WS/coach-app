import type { Booking, ClassException } from '@/types';

export type CancelFutureResult =
  | { action: 'endDate'; newEndDate: string; exceptionIdsToDelete: string[] }
  | { action: 'delete'; exceptionIdsToDelete: string[] };

function previousDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function computeCancelFuture(
  booking: Booking,
  exceptions: ClassException[],
  selectedDate: string,
): CancelFutureResult {
  const dayBefore = previousDay(selectedDate);
  const ownExceptions = exceptions.filter((e) => e.bookingId === booking.id);

  if (booking.startDate && dayBefore < booking.startDate) {
    return {
      action: 'delete',
      exceptionIdsToDelete: ownExceptions.map((e) => e.id),
    };
  }

  return {
    action: 'endDate',
    newEndDate: dayBefore,
    exceptionIdsToDelete: ownExceptions
      .filter((e) => e.originalDate >= selectedDate)
      .map((e) => e.id),
  };
}

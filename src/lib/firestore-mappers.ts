import type { Booking, ClassException, LessonLog } from '@/types';
import { centsFromLegacy, mapRmToCents } from '@/lib/money';

// Firestore doc data → app types. Shared by the live hooks (useCoachData) and
// the one-time analytics fetchers so both read documents the same way.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore doc data
export function bookingFromDoc(id: string, data: any): Booking {
  return {
    id,
    locationId: data.locationId,
    locationName: data.locationName,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    status: data.status,
    className: data.className ?? '',
    notes: data.notes ?? '',
    studentIds: data.studentIds ?? [],
    studentPriceCents:
      data.studentPriceCents ?? mapRmToCents(data.studentPrices ?? {}),
    studentWallets: data.studentWallets ?? {},
    startDate: data.startDate ?? undefined,
    endDate: data.endDate ?? undefined,
    createdAt: data.createdAt?.toDate() || new Date(),
    cancelledAt: data.cancelledAt?.toDate(),
    cancelReason: data.cancelReason ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore doc data
export function lessonLogFromDoc(id: string, data: any): LessonLog {
  return {
    id,
    date: data.date,
    bookingId: data.bookingId,
    studentId: data.studentId,
    studentName: data.studentName,
    locationName: data.locationName,
    startTime: data.startTime,
    endTime: data.endTime,
    priceCents: centsFromLegacy(data.priceCents, data.price),
    note: data.note ?? undefined,
    // Passed through raw on purpose: undefined (pre-2026-10-18 log, wallet
    // unknown) and null (nothing was charged) mean different things to
    // selectUndoWalletIds. `?? undefined` here would erase that.
    walletId: data.walletId,
    createdAt: data.createdAt?.toDate() || new Date(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore doc data
export function exceptionFromDoc(id: string, data: any): ClassException {
  return {
    id,
    bookingId: data.bookingId,
    originalDate: data.originalDate,
    type: data.type,
    reason: data.reason ?? undefined,
    newDate: data.newDate,
    newStartTime: data.newStartTime,
    newEndTime: data.newEndTime,
    newLocationId: data.newLocationId,
    newLocationName: data.newLocationName,
    newNote: data.newNote,
    newClassName: data.newClassName,
    newStudentIds: data.newStudentIds,
    newStudentPriceCents:
      data.newStudentPriceCents ??
      (data.newStudentPrices
        ? mapRmToCents(data.newStudentPrices)
        : undefined),
    newStudentWallets: data.newStudentWallets,
    createdAt: data.createdAt?.toDate() || new Date(),
  };
}

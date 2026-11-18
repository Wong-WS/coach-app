import type { LessonLog } from '@/types';

// Lesson logs are written one per student, so a 2-student class is 2 logs.
// This counts classes (one booking on one date) — the number a coach thinks in.
// Logs without a bookingId fall back to date + time + location.
type ClassKeyFields = Pick<LessonLog, 'bookingId' | 'date' | 'startTime' | 'locationName'>;

/** One key per class (booking on a date), shared by every student's log of it. */
export function classKey(l: ClassKeyFields): string {
  return `${l.bookingId ?? `${l.locationName}@${l.startTime}`}|${l.date}`;
}

export function countClasses(logs: ClassKeyFields[]): number {
  return new Set(logs.map(classKey)).size;
}

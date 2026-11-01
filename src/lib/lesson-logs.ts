import type { LessonLog } from '@/types';

// Lesson logs are written one per student, so a 2-student class is 2 logs.
// This counts classes (one booking on one date) — the number a coach thinks in.
// Logs without a bookingId fall back to date + time + location.
export function countClasses(logs: Pick<LessonLog, 'bookingId' | 'date' | 'startTime' | 'locationName'>[]): number {
  const keys = new Set(
    logs.map((l) => `${l.bookingId ?? `${l.locationName}@${l.startTime}`}|${l.date}`),
  );
  return keys.size;
}

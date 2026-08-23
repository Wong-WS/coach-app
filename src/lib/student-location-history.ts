import type { Booking, Student } from '@/types';

export type StudentsByLocation = {
  /** Students with at least one booking at the given location. */
  here: Student[];
  /** Everyone else — still selectable, just not surfaced first. */
  others: Student[];
};

/**
 * Split students into those who have lessons at `locationId` and those who don't,
 * so the Add Lesson picker can surface the likely names first without hiding anyone.
 *
 * `locationId` may be empty or the `__new` sentinel while a location is being
 * created — neither has history, so everyone lands in `others`.
 */
export function groupStudentsByLocation(
  students: Student[],
  bookings: Booking[],
  locationId: string
): StudentsByLocation {
  if (!locationId || locationId === '__new') {
    return { here: [], others: [...students] };
  }

  const seenHere = new Set<string>();
  for (const b of bookings) {
    if (b.locationId !== locationId) continue;
    for (const sid of b.studentIds || []) seenHere.add(sid);
  }

  const here: Student[] = [];
  const others: Student[] = [];
  for (const s of students) {
    (seenHere.has(s.id) ? here : others).push(s);
  }

  return { here, others };
}

import type { LessonLog, Student, Wallet } from '@/types';
import { classKey } from '@/lib/lesson-logs';
import type { CancellationRecord, ReasonBucket } from './cancellations';

/** A paying family: the wallet a student belongs to, or the student alone. */
export type Family = { key: string; name: string };
/** `key` tells apart families that share a name. */
export type Ranked = { key: string; name: string; count: number };
export type ResolveFamily = (studentId: string, fallbackName?: string) => Family;

export function familyResolver(wallets: Wallet[], students: Student[]): ResolveFamily {
  const walletOf = new Map<string, Wallet>();
  // Active wallets first so they win over archived ones holding the same student.
  const ordered = [...wallets.filter((w) => !w.archived), ...wallets.filter((w) => w.archived)];
  for (const w of ordered) {
    for (const sid of w.studentIds) if (!walletOf.has(sid)) walletOf.set(sid, w);
  }
  const nameOf = new Map(students.map((s) => [s.id, s.clientName]));

  return (studentId, fallbackName) => {
    const w = walletOf.get(studentId);
    if (w) return { key: `w:${w.id}`, name: w.name };
    return { key: `s:${studentId}`, name: nameOf.get(studentId) ?? fallbackName ?? 'Unknown' };
  };
}

function rank(counts: Map<string, Ranked>, limit: number): Ranked[] {
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function bump(counts: Map<string, Ranked>, family: Family) {
  const cur = counts.get(family.key);
  if (cur) cur.count += 1;
  else counts.set(family.key, { key: family.key, name: family.name, count: 1 });
}

/** Reasons that could be the family's doing. Weather and the coach are not. */
const FAMILY_REASONS: ReadonlySet<ReasonBucket> = new Set(['student', 'other', 'none']);

export function cancelsMost(records: CancellationRecord[], resolve: ResolveFamily, limit = 3): Ranked[] {
  const counts = new Map<string, Ranked>();
  for (const r of records) {
    if (!FAMILY_REASONS.has(r.bucket)) continue;
    const families = new Map(r.studentIds.map((sid) => {
      const f = resolve(sid);
      return [f.key, f] as const;
    }));
    for (const f of families.values()) bump(counts, f);
  }
  return rank(counts, limit);
}

/** Classes taught per family; siblings logged in the same class count once. */
export function mostLessons(logs: LessonLog[], resolve: ResolveFamily, limit = 3): Ranked[] {
  const counts = new Map<string, Ranked>();
  const seen = new Set<string>();
  for (const l of logs) {
    const f = resolve(l.studentId, l.studentName);
    const key = `${f.key}|${classKey(l)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bump(counts, f);
  }
  return rank(counts, limit);
}

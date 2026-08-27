import type { PortalChargeRow } from '@/lib/portal-data';

/**
 * Mark-as-done writes one charge per student as `Lesson — Name (HH:MM)`, so the
 * trailing start time is what separates a genuine second session from a second
 * student sitting in the same one. Charges are only ever written there, but an
 * unparseable description falls back to '' — an empty key groups rather than
 * splits, so the portal under-counts sessions instead of inventing them.
 */
const SESSION_TIME_RE = /\((\d{1,2}:\d{2})\)\s*$/;

export function sessionKeyFromDescription(description: unknown): string {
  if (typeof description !== 'string') return '';
  return SESSION_TIME_RE.exec(description)?.[1] ?? '';
}

export type PortalChargeGroup = {
  key: string;
  date: string;
  /** Distinct student names in the group, newest charge first. Empty for single-student wallets. */
  names: string[];
  /** Distinct lessons that day — two students in one session count once. */
  sessions: number;
  /** Sum of the group's charges, positive RM. */
  amountCents: number;
};

/**
 * Roll same-date charges into one row so a wallet shared by two students shows
 * "Jian & Seoan — RM 100" instead of two RM 50 lines.
 *
 * Rows arrive newest-first (createdAt desc). Grouping is keyed by date rather
 * than by adjacency so a backdated charge still lands in its day's row, and so
 * a day split across two pages merges when the next page is appended.
 *
 * `sessions` counts distinct lesson times, not charges: mark-as-done writes one
 * charge per attending student, and a parent reading the portal thinks in
 * lessons — Jian and Seoan at 08:30 together is one lesson, not two.
 */
export function groupCharges(rows: PortalChargeRow[]): PortalChargeGroup[] {
  const byDate = new Map<string, PortalChargeGroup>();
  const sessionsByDate = new Map<string, Set<string>>();

  for (const r of rows) {
    const existing = byDate.get(r.date);
    if (existing) {
      existing.amountCents += r.amountCents;
      if (r.studentName && !existing.names.includes(r.studentName)) {
        existing.names.push(r.studentName);
      }
    } else {
      byDate.set(r.date, {
        key: `${r.date}-${r.cursor}`,
        date: r.date,
        names: r.studentName ? [r.studentName] : [],
        sessions: 0,
        amountCents: r.amountCents,
      });
      sessionsByDate.set(r.date, new Set());
    }
    sessionsByDate.get(r.date)!.add(r.sessionKey);
  }

  for (const [date, group] of byDate) {
    group.sessions = sessionsByDate.get(date)!.size;
  }
  return Array.from(byDate.values());
}

/** "Jian", "Jian & Seoan", "Jian, Seoan & Rui" */
export function formatNameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

import type { PortalChargeRow } from '@/lib/portal-data';

export type PortalChargeGroup = {
  key: string;
  date: string;
  /** Distinct student names in the group, newest charge first. Empty for single-student wallets. */
  names: string[];
  /** Number of charges rolled into this row. */
  count: number;
  /** Sum of the group's charges, positive RM. */
  amount: number;
};

/**
 * Roll same-date charges into one row so a wallet shared by two students shows
 * "Jian & Seoan — RM 100" instead of two RM 50 lines.
 *
 * Rows arrive newest-first (createdAt desc). Grouping is keyed by date rather
 * than by adjacency so a backdated charge still lands in its day's row, and so
 * a day split across two pages merges when the next page is appended.
 */
export function groupCharges(rows: PortalChargeRow[]): PortalChargeGroup[] {
  const byDate = new Map<string, PortalChargeGroup>();
  for (const r of rows) {
    const existing = byDate.get(r.date);
    if (existing) {
      existing.count += 1;
      existing.amount += r.amount;
      if (r.studentName && !existing.names.includes(r.studentName)) {
        existing.names.push(r.studentName);
      }
    } else {
      byDate.set(r.date, {
        key: `${r.date}-${r.cursor}`,
        date: r.date,
        names: r.studentName ? [r.studentName] : [],
        count: 1,
        amount: r.amount,
      });
    }
  }
  return Array.from(byDate.values());
}

/** "Jian", "Jian & Seoan", "Jian, Seoan & Rui" */
export function formatNameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

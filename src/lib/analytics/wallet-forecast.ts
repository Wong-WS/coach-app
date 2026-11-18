import type { AwayPeriod, Booking, ClassException, LessonLog, Wallet } from '@/types';
import { stillToComeByDate } from './projection';

export type RunOut = { kind: 'now' } | { kind: 'date'; date: string } | { kind: 'tab' };

export interface ExpectedPayment {
  walletId: string;
  name: string;
  runOut: RunOut;
  /** null when the wallet has no usual top-up and no past top-up to go by. */
  amountCents: number | null;
}

/**
 * Wallets expected to need money before `monthEnd` (spec: "Likely to
 * receive"). Walks the still-to-come classes, charging each wallet its
 * students' prices. Prepaid wallets expect one top-up when they can no longer
 * cover a class; tab wallets expect what they'll owe at month end.
 */
export function likelyToReceive(args: {
  wallets: Wallet[];
  bookings: Booking[];
  exceptions: ClassException[];
  awayPeriods: AwayPeriod[];
  logs: LessonLog[];
  today: string;
  monthEnd: string;
  lastTopUpCents: Record<string, number>;
}): { rows: ExpectedPayment[]; totalCents: number } {
  const { wallets, today, monthEnd, lastTopUpCents } = args;
  const upcoming = stillToComeByDate(
    { start: today, end: monthEnd },
    today,
    args.bookings,
    args.exceptions,
    args.awayPeriods,
    args.logs,
  );

  // Charges per wallet, in date order.
  const charges = new Map<string, { date: string; cents: number }[]>();
  for (const { date, booking } of upcoming) {
    const perWallet = new Map<string, number>();
    for (const sid of booking.studentIds) {
      const wid = booking.studentWallets?.[sid];
      if (!wid) continue;
      perWallet.set(wid, (perWallet.get(wid) ?? 0) + (booking.studentPriceCents?.[sid] ?? 0));
    }
    for (const [wid, cents] of perWallet) {
      if (cents <= 0) continue;
      const list = charges.get(wid) ?? [];
      list.push({ date, cents });
      charges.set(wid, list);
    }
  }

  const rows: ExpectedPayment[] = [];
  for (const w of wallets) {
    if (w.archived) continue;
    const list = charges.get(w.id) ?? [];

    if (w.tabMode) {
      const end = list.reduce((bal, c) => bal - c.cents, w.balanceCents);
      if (end < 0) rows.push({ walletId: w.id, name: w.name, runOut: { kind: 'tab' }, amountCents: -end });
      continue;
    }

    let runOut: RunOut | null = w.balanceCents < 0 ? { kind: 'now' } : null;
    let balance = w.balanceCents;
    for (let i = 0; !runOut && i < list.length; i++) {
      if (balance < list[i].cents) {
        runOut = i === 0 ? { kind: 'now' } : { kind: 'date', date: list[i].date };
      }
      balance -= list[i].cents;
    }
    if (!runOut) continue;
    // Nothing left to come (e.g. the family stopped): expect only the debt,
    // not a fresh top-up.
    const amountCents =
      list.length === 0 ? -w.balanceCents : (w.usualTopUpCents ?? lastTopUpCents[w.id] ?? null);
    rows.push({ walletId: w.id, name: w.name, runOut, amountCents });
  }

  const order = (r: RunOut) => (r.kind === 'now' ? '0' : r.kind === 'date' ? `1${r.date}` : '2');
  rows.sort((a, b) => order(a.runOut).localeCompare(order(b.runOut)) || a.name.localeCompare(b.name));

  return { rows, totalCents: rows.reduce((sum, r) => sum + (r.amountCents ?? 0), 0) };
}

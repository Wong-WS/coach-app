import type { WalletTransactionType } from '@/types';

/** One wallet transaction, reduced to what set computation needs. */
export interface SetInputTxn {
  type: WalletTransactionType;
  amount: number;        // as stored (top-up positive; charge magnitude used via abs)
  balanceAfter: number;  // running balance immediately after this txn, as stored
  date: string;          // YYYY-MM-DD (lesson/top-up date)
  createdAt: number;     // ms since epoch, for chronological ordering
}

/** A completed lesson slot, numbered oldest-first within its set. */
export interface PortalLesson {
  n: number;
  date: string;
  price: number;         // whole RM, positive
}

/** Leftover credit or shortfall at the bottom of a set. */
export interface PortalReconciliation {
  kind: 'credit' | 'owed' | 'none';
  amount: number;        // whole RM, >= 0 (0 when kind === 'none')
}

/** One payment batch: a top-up's worth of lesson slots. */
export interface PortalSet {
  topUp: { date: string; amount: number } | null;  // null = legacy set with no top-up
  slots: number;
  done: number;
  left: number;
  lessons: PortalLesson[];   // oldest-first
  reconciliation: PortalReconciliation;
}

/** Result of replaying a wallet's history. `flat` is populated only in flat mode. */
export interface PortalLessonSets {
  mode: 'sets' | 'flat';
  current: PortalSet | null;
  earlier: PortalSet[];      // most-recent-first
  flat: { date: string; price: number; balanceAfter: number }[];  // newest-first
}

interface WorkingSet {
  topUpDate: string | null;
  topUpSum: number;
  openingBalance: number;    // balance just before this set started
  lessons: { date: string; price: number }[];
  endingBalance: number;     // running balance at the set's close
}

function finalizeSet(ws: WorkingSet, rate: number): PortalSet {
  const done = ws.lessons.length;
  const topUp =
    ws.topUpDate != null ? { date: ws.topUpDate, amount: ws.topUpSum } : null;

  // Legacy set (charges with no top-up): no blank slots.
  const slots =
    topUp == null && ws.topUpSum === 0
      ? done
      : Math.max(Math.round((ws.openingBalance + ws.topUpSum) / rate), done);

  const left = slots - done;
  const raw = Math.round(ws.endingBalance - left * rate);
  const reconciliation: PortalReconciliation =
    raw > 0
      ? { kind: 'credit', amount: raw }
      : raw < 0
        ? { kind: 'owed', amount: -raw }
        : { kind: 'none', amount: 0 };

  return {
    topUp,
    slots,
    done,
    left,
    lessons: ws.lessons.map((l, i) => ({ n: i + 1, date: l.date, price: l.price })),
    reconciliation,
  };
}

/**
 * Replay a wallet's transactions into payment-batch "sets".
 *
 * Rule: a top-up starts a NEW set only when the balance immediately before it is
 * below one lesson's cost (`rate`). Otherwise it is absorbed into the current set
 * (advance payment / installment). Charges append dated, priced lessons; refunds
 * and adjustments move the balance only.
 *
 * `forceFlat` (multi-student / tab-mode wallets) or a non-positive `rate` returns
 * a flat newest-first lesson list instead of sets.
 */
export function computeLessonSets(
  input: SetInputTxn[],
  rate: number,
  forceFlat = false,
): PortalLessonSets {
  const txns = [...input].sort((a, b) => a.createdAt - b.createdAt);

  if (forceFlat || rate <= 0) {
    const flat = txns
      .filter((t) => t.type === 'charge')
      .map((t) => ({
        date: t.date,
        price: Math.abs(t.amount),
        balanceAfter: t.balanceAfter,
      }))
      .reverse(); // newest-first
    return { mode: 'flat', current: null, earlier: [], flat };
  }

  const sets: WorkingSet[] = [];
  let current: WorkingSet | null = null;

  for (const t of txns) {
    if (t.type === 'top-up') {
      const preBalance = t.balanceAfter - t.amount;
      if (current == null || preBalance < rate) {
        if (current != null) {
          current.endingBalance = preBalance;
          sets.push(current);
        }
        current = {
          topUpDate: t.date,
          topUpSum: t.amount,
          openingBalance: preBalance,
          lessons: [],
          endingBalance: t.balanceAfter,
        };
      } else {
        // absorbed: advance payment or installment for the same batch
        current.topUpSum += t.amount;
        if (current.topUpDate == null) current.topUpDate = t.date;
        current.endingBalance = t.balanceAfter;
      }
    } else if (t.type === 'charge') {
      if (current == null) {
        // legacy: charges before any tracked top-up
        current = {
          topUpDate: null,
          topUpSum: 0,
          openingBalance: t.balanceAfter + Math.abs(t.amount),
          lessons: [],
          endingBalance: t.balanceAfter,
        };
      }
      current.lessons.push({ date: t.date, price: Math.abs(t.amount) });
      current.endingBalance = t.balanceAfter;
    } else {
      // refund / adjustment: balance only
      if (current != null) current.endingBalance = t.balanceAfter;
    }
  }

  if (current != null) sets.push(current);

  const finalized = sets.map((s) => finalizeSet(s, rate));
  const currentSet = finalized.length > 0 ? finalized[finalized.length - 1] : null;
  const earlier = finalized.slice(0, -1).reverse();

  return { mode: 'sets', current: currentSet, earlier, flat: [] };
}

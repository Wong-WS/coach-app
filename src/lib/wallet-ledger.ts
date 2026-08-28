import type { Wallet } from '@/types';

/**
 * Running-balance tracker for building wallet transactions in a batch.
 *
 * Every transaction records balanceAfterCents. When one batch charges the same
 * wallet more than once (two siblings on a shared wallet in one mark-done),
 * each receipt must see the charges before it — computing every receipt from
 * the wallet's pre-batch snapshot writes the same "balance after" twice.
 *
 * `apply` returns the balance after the given delta, remembering it for the
 * next call. Seed it with the wallets' current balances, use the return value
 * as the transaction's balanceAfterCents.
 */
export function createBalanceTracker(wallets: Wallet[]): {
  apply: (walletId: string, deltaCents: number) => number;
} {
  const running = new Map(wallets.map((w) => [w.id, w.balanceCents]));
  return {
    apply(walletId, deltaCents) {
      const current = running.get(walletId);
      if (current === undefined) {
        throw new Error(`Unknown wallet: ${walletId}`);
      }
      const next = current + deltaCents;
      running.set(walletId, next);
      return next;
    },
  };
}

export type UndoLedgerEntry = {
  lessonLogId: string;
  walletId: string;
  type: 'charge' | 'refund';
  amountCents: number;
  description: string;
  studentId?: string;
};

export type PlannedRefund = {
  walletId: string;
  lessonLogId: string;
  amountCents: number;
  description: string;
  studentId?: string;
};

/**
 * Given every transaction tagged with the lesson logs being undone (charges
 * AND refunds), plan which refunds to post: one per charge that has no refund
 * yet. This is what makes undo idempotent — a double-fired undo (spam-click,
 * a second tab) sees the first run's refunds and plans nothing, instead of
 * paying the student twice.
 */
export function planUndoRefunds(entries: UndoLedgerEntry[]): PlannedRefund[] {
  const alreadyRefunded = new Set(
    entries.filter((e) => e.type === 'refund').map((e) => e.lessonLogId),
  );
  return entries
    .filter(
      (e) =>
        e.type === 'charge' &&
        Math.abs(e.amountCents) > 0 &&
        !alreadyRefunded.has(e.lessonLogId),
    )
    .map((e) => ({
      walletId: e.walletId,
      lessonLogId: e.lessonLogId,
      amountCents: Math.abs(e.amountCents),
      description: e.description,
      studentId: e.studentId,
    }));
}

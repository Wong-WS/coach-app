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

/**
 * Load each wallet's ledger entries for an undo — all queries at once.
 *
 * The charged wallet can only be found by asking every wallet whether it holds
 * a transaction tagged with the lesson's id: the coach may have moved the
 * student to a different wallet since the lesson was marked done, and the old
 * transaction stays where it was posted. That scan is unavoidable; doing it one
 * `await` at a time was not. A coach with 70 wallets paid 70 sequential round
 * trips before a single document was written, and watched the button sit on
 * "Reopening…" for tens of seconds. Issued together it costs one round trip.
 *
 * Results keep wallet order, so `entries[0]` is still the first match in the
 * wallet list — the same transaction the old sequential scan would have broken
 * out on.
 */
export async function collectWalletLedgerEntries<T>(
  walletIds: string[],
  loadForWallet: (walletId: string) => Promise<T[]>,
): Promise<T[]> {
  const perWallet = await Promise.all(walletIds.map((id) => loadForWallet(id)));
  return perWallet.flat();
}

/**
 * Which wallets undo has to interrogate to find a lesson's charge.
 *
 * Mark-as-done records the charged wallet on the lesson log, so the usual
 * answer is "just that one" — one query instead of one per wallet. Three
 * states, and the difference matters:
 *
 *   - a wallet id  → the charge went there; ask only it
 *   - null         → nothing was charged (no wallet attached, or RM 0)
 *   - undefined    → the log predates the field; where its charge went is
 *                    unknowable from the log, so every wallet must be asked
 *
 * One legacy log forces the full scan for the whole class: a class is undone
 * as a unit, and a half-scan would silently skip a refund.
 */
export function selectUndoWalletIds(
  logs: Array<{ walletId?: string | null }>,
  allWalletIds: string[],
): string[] {
  if (logs.some((l) => l.walletId === undefined)) return allWalletIds;
  const targeted = new Set(logs.map((l) => l.walletId).filter((id): id is string => !!id));
  // Intersected with the live list deliberately: a wallet deleted since the
  // lesson was charged has no balance to credit, and feeding its id to
  // createBalanceTracker would throw partway through planning the undo.
  return allWalletIds.filter((id) => targeted.has(id));
}

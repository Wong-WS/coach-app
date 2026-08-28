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

import type { Booking, Wallet, WalletTransaction } from '@/types';

/**
 * One "lesson-round" cost for this wallet: for each student using this wallet
 * across all bookings, take the max price they pay in any of their bookings,
 * then sum those per-student maxes. Multiplying by N gives "5 lessons per kid",
 * independent of class frequency — a multi-booking wallet doesn't get
 * discounted, and a high-frequency wallet doesn't get inflated.
 */
export function getNextLessonCost(wallet: Wallet, bookings: Booking[]): number {
  const studentMax: Record<string, number> = {};
  for (const b of bookings) {
    for (const studentId of b.studentIds) {
      if (b.studentWallets?.[studentId] !== wallet.id) continue;
      const price = b.studentPrices?.[studentId] ?? 0;
      if (price > (studentMax[studentId] ?? 0)) {
        studentMax[studentId] = price;
      }
    }
  }
  let total = 0;
  for (const sid in studentMax) total += studentMax[sid];
  return total;
}

/**
 * True when at least one booking references this wallet and is not ended.
 * Ended = has endDate AND endDate < today.
 */
export function hasActiveBooking(wallet: Wallet, bookings: Booking[], today: string): boolean {
  for (const b of bookings) {
    let referencesWallet = false;
    for (const studentId of b.studentIds) {
      if (b.studentWallets?.[studentId] === wallet.id) {
        referencesWallet = true;
        break;
      }
    }
    if (!referencesWallet) continue;
    if (!b.endDate || b.endDate >= today) return true;
  }
  return false;
}

/**
 * The single rule the whole feature hangs on.
 */
export function isLowBalance(wallet: Wallet, bookings: Booking[], today: string): boolean {
  if (wallet.payPerLesson) return false;
  if (wallet.archived) return false;
  if (!hasActiveBooking(wallet, bookings, today)) return false;
  return wallet.balance < getNextLessonCost(wallet, bookings);
}

/**
 * Balance used for sizing the top-up ask.
 *
 * When the wallet is currently negative (student did unpaid lessons on credit),
 * we don't want the ask to swell with the debt — the coach asks for the same
 * package price and absorbs the overdraft. So we walk backwards through
 * transactions (newest first, as returned by useWalletTransactions) to find
 * the most recent non-negative balanceAfter, which represents the balance
 * snapshot at the start of this debt cycle. If no such snapshot exists, fall
 * back to 0.
 */
export function getEffectiveBalance(
  wallet: Wallet,
  transactions?: WalletTransaction[]
): number {
  if (wallet.balance >= 0) return wallet.balance;
  if (!transactions) return 0;
  for (const t of transactions) {
    if (t.balanceAfter >= 0) return t.balanceAfter;
  }
  return 0;
}

/**
 * Cash amount the coach should ask for to cover `minLessonsPerTopUp` lessons,
 * after rolling over the current balance. Returns 0 for pay-per-lesson wallets
 * or wallets with no active bookings.
 *
 * Pass `transactions` (newest-first) so the ask can ignore overdraft debt and
 * reflect the pre-debt balance instead. Omitted → negative balances are
 * clamped to 0 (stateless fallback).
 */
export function getTopUpMinimum(
  wallet: Wallet,
  bookings: Booking[],
  transactions?: WalletTransaction[]
): number {
  if (wallet.payPerLesson) return 0;
  const rate = getNextLessonCost(wallet, bookings);
  if (rate === 0) return 0;
  const packageSize = wallet.minLessonsPerTopUp ?? 5;
  const effective = getEffectiveBalance(wallet, transactions);
  return Math.max(0, rate * packageSize - effective);
}

/**
 * Combined selector — one pass each for rate and active-booking check.
 * Use this when a caller needs two or more of { rate, isLow, topUpMinimum }.
 */
export function getWalletStatus(
  wallet: Wallet,
  bookings: Booking[],
  today: string,
  transactions?: WalletTransaction[]
): { rate: number; isLow: boolean; topUpMinimum: number } {
  if (wallet.payPerLesson || wallet.archived) {
    return { rate: 0, isLow: false, topUpMinimum: 0 };
  }
  const rate = getNextLessonCost(wallet, bookings);
  const active = hasActiveBooking(wallet, bookings, today);
  const isLow = active && wallet.balance < rate;
  const packageSize = wallet.minLessonsPerTopUp ?? 5;
  const effective = getEffectiveBalance(wallet, transactions);
  const topUpMinimum = rate === 0 ? 0 : Math.max(0, rate * packageSize - effective);
  return { rate, isLow, topUpMinimum };
}

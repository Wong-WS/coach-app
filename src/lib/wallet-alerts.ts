import type { Booking, Wallet } from '@/types';

/**
 * Sum of studentPrices paid out of `wallet` for a single occurrence of `booking`.
 * Only students in this booking who explicitly use this wallet count.
 */
function occurrenceCost(wallet: Wallet, booking: Booking): number {
  let sum = 0;
  for (const studentId of booking.studentIds) {
    if (booking.studentWallets?.[studentId] === wallet.id) {
      sum += booking.studentPrices?.[studentId] ?? 0;
    }
  }
  return sum;
}

/**
 * Worst-case cost for this wallet on any single class day,
 * across all active bookings that reference it.
 * Returns 0 if no bookings reference the wallet.
 */
export function getNextLessonCost(wallet: Wallet, bookings: Booking[]): number {
  let max = 0;
  for (const b of bookings) {
    const cost = occurrenceCost(wallet, b);
    if (cost > max) max = cost;
  }
  return max;
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
 * Cash amount the coach should ask for to cover `minLessonsPerTopUp` lessons,
 * after rolling over the current balance. Returns 0 for pay-per-lesson wallets
 * or wallets with no active bookings.
 */
export function getTopUpMinimum(wallet: Wallet, bookings: Booking[]): number {
  if (wallet.payPerLesson) return 0;
  const rate = getNextLessonCost(wallet, bookings);
  if (rate === 0) return 0;
  const packageSize = wallet.minLessonsPerTopUp ?? 5;
  return rate * packageSize - wallet.balance;
}

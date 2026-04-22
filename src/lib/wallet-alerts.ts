import type { Booking, Wallet } from '@/types';

/**
 * One "lesson-round" cost for this wallet: for each student using this wallet
 * across all bookings, take the max price they pay in any of their bookings,
 * then sum those per-student maxes.
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
 * Low = balance covers fewer than 2 upcoming lessons. Coach gets a warning
 * before the wallet runs dry.
 */
export function isLowBalance(wallet: Wallet, bookings: Booking[], today: string): boolean {
  if (wallet.archived) return false;
  if (!hasActiveBooking(wallet, bookings, today)) return false;
  return wallet.balance < getNextLessonCost(wallet, bookings) * 2;
}

/**
 * Combined selector — one pass each for rate and active-booking check.
 */
export function getWalletStatus(
  wallet: Wallet,
  bookings: Booking[],
  today: string,
): { rate: number; isLow: boolean } {
  if (wallet.archived) {
    return { rate: 0, isLow: false };
  }
  const rate = getNextLessonCost(wallet, bookings);
  const active = hasActiveBooking(wallet, bookings, today);
  const isLow = active && wallet.balance < rate * 2;
  return { rate, isLow };
}

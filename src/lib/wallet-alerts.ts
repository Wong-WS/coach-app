import type { Booking, Wallet } from '@/types';

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
 * Cash amount the coach should ask for to cover `minLessonsPerTopUp` lessons,
 * after rolling over the current balance. Returns 0 for pay-per-lesson wallets
 * or wallets with no active bookings.
 */
export function getTopUpMinimum(wallet: Wallet, bookings: Booking[]): number {
  if (wallet.payPerLesson) return 0;
  const rate = getNextLessonCost(wallet, bookings);
  if (rate === 0) return 0;
  const packageSize = wallet.minLessonsPerTopUp ?? 5;
  return Math.max(0, rate * packageSize - wallet.balance);
}

/**
 * Combined selector — one pass each for rate and active-booking check.
 * Use this when a caller needs two or more of { rate, isLow, topUpMinimum }.
 */
export function getWalletStatus(
  wallet: Wallet,
  bookings: Booking[],
  today: string
): { rate: number; isLow: boolean; topUpMinimum: number } {
  if (wallet.payPerLesson || wallet.archived) {
    return { rate: 0, isLow: false, topUpMinimum: 0 };
  }
  const rate = getNextLessonCost(wallet, bookings);
  const active = hasActiveBooking(wallet, bookings, today);
  const isLow = active && wallet.balance < rate;
  const packageSize = wallet.minLessonsPerTopUp ?? 5;
  const topUpMinimum = rate === 0 ? 0 : Math.max(0, rate * packageSize - wallet.balance);
  return { rate, isLow, topUpMinimum };
}

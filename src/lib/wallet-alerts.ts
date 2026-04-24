import type { Booking, Wallet } from '@/types';

/**
 * One "lesson-round" cost for this wallet: for each student using this wallet
 * across all bookings, take the max price they pay in any of their bookings,
 * then sum those per-student maxes.
 */
export function getNextLessonCost(wallet: Wallet, bookings: Booking[]): number {
  const studentMax: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debug: any[] = [];
  for (const b of bookings) {
    for (const studentId of b.studentIds) {
      if (b.studentWallets?.[studentId] !== wallet.id) continue;
      const price = b.studentPrices?.[studentId] ?? 0;
      debug.push({ bookingId: b.id, day: b.dayOfWeek, time: `${b.startTime}-${b.endTime}`, studentId, price });
      if (price > (studentMax[studentId] ?? 0)) {
        studentMax[studentId] = price;
      }
    }
  }
  let total = 0;
  for (const sid in studentMax) total += studentMax[sid];
  if (wallet.name?.toLowerCase().includes('dong')) {
    // TEMP DEBUG — remove once Dong-wallet rate mystery is solved
    console.log('[wallet-debug]', {
      wallet: wallet.name,
      walletId: wallet.id,
      balance: wallet.balance,
      walletStudentIds: wallet.studentIds,
      rateComputed: total,
      studentMax,
      matchedBookingEntries: debug,
    });
  }
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
 *
 * Skipped for tab-mode wallets: they sit near zero by design (student pays
 * after each lesson), so a "low" alert would fire constantly.
 */
export function isLowBalance(wallet: Wallet, bookings: Booking[], today: string): boolean {
  if (wallet.archived) return false;
  if (wallet.tabMode) return false;
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
  if (wallet.tabMode) {
    return { rate, isLow: false };
  }
  const active = hasActiveBooking(wallet, bookings, today);
  const isLow = active && wallet.balance < rate * 2;
  return { rate, isLow };
}

/**
 * Wallet health buckets:
 *   owing    — balance < 0 (student owes coach)
 *   empty    — 0 ≤ balance < rate (can't cover next lesson)
 *   low      — rate ≤ balance < 2×rate (1 lesson left, top up soon)
 *   healthy  — balance ≥ 2×rate
 *   tab      — tab-mode wallet (pays after lesson, never "low")
 *   inactive — archived or no active bookings (nothing to alert)
 */
export type WalletHealth =
  | 'owing'
  | 'empty'
  | 'low'
  | 'healthy'
  | 'tab'
  | 'inactive';

export function getWalletHealth(
  wallet: Wallet,
  bookings: Booking[],
  today: string,
): { health: WalletHealth; rate: number; lessonsLeft: number } {
  if (wallet.archived) return { health: 'inactive', rate: 0, lessonsLeft: 0 };
  const rate = getNextLessonCost(wallet, bookings);
  const lessonsLeft = rate > 0 ? Math.floor(wallet.balance / rate) : 0;
  if (wallet.tabMode) return { health: 'tab', rate, lessonsLeft };
  if (!hasActiveBooking(wallet, bookings, today))
    return { health: 'inactive', rate, lessonsLeft };
  if (wallet.balance < 0) return { health: 'owing', rate, lessonsLeft };
  if (rate <= 0) return { health: 'healthy', rate, lessonsLeft };
  if (wallet.balance < rate) return { health: 'empty', rate, lessonsLeft };
  if (wallet.balance < rate * 2) return { health: 'low', rate, lessonsLeft };
  return { health: 'healthy', rate, lessonsLeft };
}

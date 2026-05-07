import type { Booking, ClassException, LessonLog, Wallet, AwayPeriod } from '@/types';
import { getClassesForDate } from '@/lib/class-schedule';
import { parseDateString } from '@/lib/date-format';

const LOOKAHEAD_DAYS = 56;

function ymd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Cost of the next chronological lesson for this wallet that hasn't been
 * marked done yet. Walks forward from `today` (up to LOOKAHEAD_DAYS, which
 * stays inside the 4-month exception fetch window), applies class exceptions
 * via `getClassesForDate`, and skips any class with a matching lessonLog for
 * that date. Respects away periods — lessons on dates within an away period
 * are skipped.
 *
 * Returns 0 if no upcoming lesson is found in the lookahead window — caller
 * should treat that as "no rate to compare against".
 */
export function getNextLessonCost(
  wallet: Wallet,
  bookings: Booking[],
  exceptions: ClassException[],
  completedLogs: LessonLog[],
  today: string,
  awayPeriods: AwayPeriod[] = [],
): number {
  const cur = parseDateString(today);
  for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
    const date = ymd(cur);
    const classes = getClassesForDate(date, bookings, exceptions, awayPeriods);
    for (const c of classes) {
      const isDone = completedLogs.some(
        (l) => l.date === date && l.bookingId === c.id,
      );
      if (isDone) continue;
      let cost = 0;
      for (const sid of c.studentIds) {
        if (c.studentWallets?.[sid] !== wallet.id) continue;
        cost += c.studentPrices?.[sid] ?? 0;
      }
      if (cost > 0) return cost;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return 0;
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
export function isLowBalance(
  wallet: Wallet,
  bookings: Booking[],
  exceptions: ClassException[],
  completedLogs: LessonLog[],
  today: string,
  awayPeriods: AwayPeriod[] = [],
): boolean {
  if (wallet.archived) return false;
  if (wallet.tabMode) return false;
  if (!hasActiveBooking(wallet, bookings, today)) return false;
  const rate = getNextLessonCost(wallet, bookings, exceptions, completedLogs, today, awayPeriods);
  if (rate <= 0) return false;
  return wallet.balance < rate * 2;
}

/**
 * Combined selector — one pass each for rate and active-booking check.
 */
export function getWalletStatus(
  wallet: Wallet,
  bookings: Booking[],
  exceptions: ClassException[],
  completedLogs: LessonLog[],
  today: string,
  awayPeriods: AwayPeriod[] = [],
): { rate: number; isLow: boolean } {
  if (wallet.archived) {
    return { rate: 0, isLow: false };
  }
  const rate = getNextLessonCost(wallet, bookings, exceptions, completedLogs, today, awayPeriods);
  if (wallet.tabMode) {
    return { rate, isLow: false };
  }
  const active = hasActiveBooking(wallet, bookings, today);
  const isLow = active && rate > 0 && wallet.balance < rate * 2;
  return { rate, isLow };
}

/**
 * Wallet health buckets:
 *   owing    — balance < 0 (student owes coach)
 *   empty    — 0 ≤ balance < rate (can't cover next lesson)
 *   low      — rate ≤ balance < 2×rate (1 lesson left, top up soon)
 *   healthy  — balance ≥ 2×rate
 *   tab      — tab-mode wallet (pays after lesson, never "low")
 *   inactive — archived or no upcoming lesson within the lookahead window
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
  exceptions: ClassException[],
  completedLogs: LessonLog[],
  today: string,
  awayPeriods: AwayPeriod[] = [],
): { health: WalletHealth; rate: number; lessonsLeft: number } {
  if (wallet.archived) return { health: 'inactive', rate: 0, lessonsLeft: 0 };
  const rate = getNextLessonCost(wallet, bookings, exceptions, completedLogs, today, awayPeriods);
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

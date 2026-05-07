import { describe, it, expect } from 'vitest';
import {
  getNextLessonCost,
  hasActiveBooking,
  isLowBalance,
  getWalletStatus,
  getWalletHealth,
} from '@/lib/wallet-alerts';
import type { Booking, ClassException, LessonLog, Wallet, AwayPeriod } from '@/types';

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w1',
    name: 'Test Wallet',
    balance: 0,
    studentIds: ['s1'],
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    locationId: 'loc1',
    locationName: 'Court A',
    dayOfWeek: 'monday',
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    className: 'Test Class',
    notes: '',
    studentIds: ['s1'],
    studentPrices: { s1: 60 },
    studentWallets: { s1: 'w1' },
    createdAt: new Date(),
    ...overrides,
  };
}

function makeLog(overrides: Partial<LessonLog> = {}): LessonLog {
  return {
    id: 'log1',
    date: '2026-04-30',
    bookingId: 'b1',
    studentId: 's1',
    studentName: 'Test Student',
    locationName: 'Court A',
    startTime: '10:00',
    endTime: '11:00',
    price: 60,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeAwayPeriod(overrides: Partial<AwayPeriod> = {}): AwayPeriod {
  return {
    id: 'away1',
    startDate: '2026-05-01',
    endDate: '2026-05-30',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// 2026-04-30 is a Thursday. 2026-05-04 is a Monday. Use these consistently
// so booking dayOfWeek matching works across cases.
const TODAY = '2026-04-30';
const NEXT_MONDAY = '2026-05-04';

describe('getNextLessonCost', () => {
  it('returns 0 when no bookings reference the wallet', () => {
    const wallet = makeWallet();
    expect(getNextLessonCost(wallet, [], [], [], TODAY)).toBe(0);
  });

  it('returns the cost of the next chronological lesson (single weekly group)', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'] });
    // Monday weekly group, both kids on this wallet at 70 each.
    const booking = makeBooking({
      dayOfWeek: 'monday',
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 70, s2: 70 },
      studentWallets: { s1: 'w1', s2: 'w1' },
    });
    expect(getNextLessonCost(wallet, [booking], [], [], TODAY)).toBe(140);
  });

  it('skips a class already marked done and uses the next one', () => {
    // Today (Thu): one-time solo override at 120, already marked done.
    // Sat: weekly group at 70/70 = 140 → that's the next chronological lesson.
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'] });
    const todaySolo = makeBooking({
      id: 'today',
      dayOfWeek: 'thursday',
      studentIds: ['s1'],
      studentPrices: { s1: 120 },
      studentWallets: { s1: 'w1' },
      startDate: TODAY,
      endDate: TODAY,
    });
    const satGroup = makeBooking({
      id: 'sat',
      dayOfWeek: 'saturday',
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 70, s2: 70 },
      studentWallets: { s1: 'w1', s2: 'w1' },
    });
    const log = makeLog({ date: TODAY, bookingId: 'today' });
    expect(getNextLessonCost(wallet, [todaySolo, satGroup], [], [log], TODAY)).toBe(140);
  });

  it('counts today as the next lesson if it is not yet marked done', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1'] });
    const todaySolo = makeBooking({
      id: 'today',
      dayOfWeek: 'thursday',
      studentIds: ['s1'],
      studentPrices: { s1: 120 },
      studentWallets: { s1: 'w1' },
      startDate: TODAY,
      endDate: TODAY,
    });
    expect(getNextLessonCost(wallet, [todaySolo], [], [], TODAY)).toBe(120);
  });

  it('respects per-date "this only" exception overrides via getClassesForDate', () => {
    // Recurring Thursday group at 70/70 = 140; "this only" exception today
    // makes it Tawoo solo at 120. Next-lesson cost today should be 120.
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'] });
    const recurring = makeBooking({
      id: 'rec',
      dayOfWeek: 'thursday',
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 70, s2: 70 },
      studentWallets: { s1: 'w1', s2: 'w1' },
    });
    const exception: ClassException = {
      id: 'ex1',
      bookingId: 'rec',
      originalDate: TODAY,
      type: 'rescheduled',
      newDate: TODAY,
      newStudentIds: ['s1'],
      newStudentPrices: { s1: 120 },
      newStudentWallets: { s1: 'w1' },
      createdAt: new Date(),
    };
    expect(getNextLessonCost(wallet, [recurring], [exception], [], TODAY)).toBe(120);
  });

  it('returns the chronological next, not the most expensive', () => {
    // Wallet covers two students with separate solo bookings:
    //   s1 on Mon at 100, s2 on Wed at 120.
    // Today Mon: next = Mon at 100 (NOT 120 just because it is higher).
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'] });
    const monSolo = makeBooking({
      id: 'mon',
      dayOfWeek: 'monday',
      studentIds: ['s1'],
      studentPrices: { s1: 100 },
      studentWallets: { s1: 'w1' },
    });
    const wedSolo = makeBooking({
      id: 'wed',
      dayOfWeek: 'wednesday',
      studentIds: ['s2'],
      studentPrices: { s2: 120 },
      studentWallets: { s2: 'w1' },
    });
    expect(getNextLessonCost(wallet, [monSolo, wedSolo], [], [], NEXT_MONDAY)).toBe(100);
  });

  it('returns 0 when all bookings are ended', () => {
    const wallet = makeWallet({ id: 'w1' });
    const ended = makeBooking({ endDate: '2026-03-01' });
    expect(getNextLessonCost(wallet, [ended], [], [], TODAY)).toBe(0);
  });

  it('ignores students in the same booking who use a different wallet', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1'] });
    const booking = makeBooking({
      dayOfWeek: 'thursday',
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 60, s2: 60 },
      studentWallets: { s1: 'w1', s2: 'w2' },
    });
    expect(getNextLessonCost(wallet, [booking], [], [], TODAY)).toBe(60);
  });
});

describe('hasActiveBooking', () => {
  it('returns false when no bookings reference the wallet', () => {
    const wallet = makeWallet();
    expect(hasActiveBooking(wallet, [], '2026-04-18')).toBe(false);
  });

  it('returns true for an open-ended booking (no endDate)', () => {
    const wallet = makeWallet();
    const b = makeBooking();
    expect(hasActiveBooking(wallet, [b], '2026-04-18')).toBe(true);
  });

  it('returns true when endDate is today', () => {
    const wallet = makeWallet();
    const b = makeBooking({ endDate: '2026-04-18' });
    expect(hasActiveBooking(wallet, [b], '2026-04-18')).toBe(true);
  });

  it('returns true when endDate is in the future', () => {
    const wallet = makeWallet();
    const b = makeBooking({ endDate: '2026-06-01' });
    expect(hasActiveBooking(wallet, [b], '2026-04-18')).toBe(true);
  });

  it('returns false when all bookings have ended', () => {
    const wallet = makeWallet();
    const b = makeBooking({ endDate: '2026-03-01' });
    expect(hasActiveBooking(wallet, [b], '2026-04-18')).toBe(false);
  });

  it('returns true if ANY booking is still active', () => {
    const wallet = makeWallet();
    const ended = makeBooking({ id: 'b1', endDate: '2026-03-01' });
    const active = makeBooking({ id: 'b2' });
    expect(hasActiveBooking(wallet, [ended, active], '2026-04-18')).toBe(true);
  });
});

describe('isLowBalance', () => {
  // Thursday group at 70 each → next lesson is 140.
  const groupBooking = makeBooking({
    dayOfWeek: 'thursday',
    studentIds: ['s1', 's2'],
    studentPrices: { s1: 70, s2: 70 },
    studentWallets: { s1: 'w1', s2: 'w1' },
  });

  it('fires when balance < 2x next lesson cost', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'], balance: 200 });
    expect(isLowBalance(wallet, [groupBooking], [], [], TODAY)).toBe(true);
  });

  it('does not fire when balance covers 2+ lessons', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'], balance: 300 });
    expect(isLowBalance(wallet, [groupBooking], [], [], TODAY)).toBe(false);
  });

  it('does not fire for archived wallets', () => {
    const wallet = makeWallet({ id: 'w1', balance: 0, archived: true });
    expect(isLowBalance(wallet, [groupBooking], [], [], TODAY)).toBe(false);
  });

  it('does not fire when wallet has no active bookings', () => {
    const wallet = makeWallet({ id: 'w1', balance: 0 });
    const ended = makeBooking({ endDate: '2026-03-01' });
    expect(isLowBalance(wallet, [ended], [], [], TODAY)).toBe(false);
  });

  it('does not fire for tab-mode wallets', () => {
    const wallet = makeWallet({ id: 'w1', balance: 0, tabMode: true });
    expect(isLowBalance(wallet, [groupBooking], [], [], TODAY)).toBe(false);
  });
});

describe('getWalletHealth', () => {
  const groupBooking = makeBooking({
    dayOfWeek: 'thursday',
    studentIds: ['s1', 's2'],
    studentPrices: { s1: 70, s2: 70 },
    studentWallets: { s1: 'w1', s2: 'w1' },
  });

  it('regression: today\'s edited solo (already done) does not inflate next-lesson cost', () => {
    // Reproduces the original bug:
    //   - Wallet covers Tawoo (s1) and Riwoo (s2)
    //   - Today (Thu): one-time solo for Tawoo at 120, already marked done
    //   - Saturday: weekly group at 70/70 = 140
    //   - Wallet at 160 after the 120 charge
    //   - Old algo summed per-student maxes → 120 + 70 = 190 → "empty"
    //   - New algo: today done → next is Sat at 140 → 160 ≥ 140 → "low"
    const wallet = makeWallet({
      id: 'w1',
      studentIds: ['s1', 's2'],
      balance: 160,
    });
    const todaySolo = makeBooking({
      id: 'today',
      dayOfWeek: 'thursday',
      studentIds: ['s1'],
      studentPrices: { s1: 120 },
      studentWallets: { s1: 'w1' },
      startDate: TODAY,
      endDate: TODAY,
    });
    const satGroup = makeBooking({
      id: 'sat',
      dayOfWeek: 'saturday',
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 70, s2: 70 },
      studentWallets: { s1: 'w1', s2: 'w1' },
    });
    const log = makeLog({ date: TODAY, bookingId: 'today' });
    const result = getWalletHealth(
      wallet,
      [todaySolo, satGroup],
      [],
      [log],
      TODAY,
    );
    expect(result.rate).toBe(140);
    expect(result.health).toBe('low');
    expect(result.lessonsLeft).toBe(1);
  });

  it('reports empty when balance < next lesson cost', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'], balance: 100 });
    const result = getWalletHealth(wallet, [groupBooking], [], [], TODAY);
    expect(result.health).toBe('empty');
    expect(result.rate).toBe(140);
  });

  it('reports owing when balance < 0 even with high rate', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'], balance: -50 });
    const result = getWalletHealth(wallet, [groupBooking], [], [], TODAY);
    expect(result.health).toBe('owing');
  });

  it('reports inactive when archived', () => {
    const wallet = makeWallet({ id: 'w1', balance: 1000, archived: true });
    const result = getWalletHealth(wallet, [groupBooking], [], [], TODAY);
    expect(result.health).toBe('inactive');
  });

  it('reports tab for tab-mode wallets regardless of balance', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'], balance: -100, tabMode: true });
    const result = getWalletHealth(wallet, [groupBooking], [], [], TODAY);
    expect(result.health).toBe('tab');
  });
});

describe('getWalletStatus', () => {
  const groupBooking = makeBooking({
    dayOfWeek: 'thursday',
    studentIds: ['s1', 's2'],
    studentPrices: { s1: 70, s2: 70 },
    studentWallets: { s1: 'w1', s2: 'w1' },
  });

  it('reports isLow = false for tab-mode wallets regardless of balance', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'], balance: 0, tabMode: true });
    expect(getWalletStatus(wallet, [groupBooking], [], [], TODAY).isLow).toBe(false);
  });

  it('still computes rate for tab-mode wallets (for top-up presets)', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'], balance: 0, tabMode: true });
    expect(getWalletStatus(wallet, [groupBooking], [], [], TODAY).rate).toBe(140);
  });

  it('reports isLow = true for prepaid wallets at zero with active booking', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'], balance: 0 });
    expect(getWalletStatus(wallet, [groupBooking], [], [], TODAY).isLow).toBe(true);
  });

  it('returns zero rate for archived wallets', () => {
    const wallet = makeWallet({ id: 'w1', balance: 0, archived: true });
    const status = getWalletStatus(wallet, [groupBooking], [], [], TODAY);
    expect(status.rate).toBe(0);
    expect(status.isLow).toBe(false);
  });
});

describe('away periods affect wallet health lookahead', () => {
  // Today is Mon 2026-04-27 (a few days before the away period starts).
  // Recurring Monday booking at rate 60.
  const TODAY = '2026-04-27';

  it('getNextLessonCost returns 0 when every upcoming Monday falls inside an away period', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 100 });
    // Cover all Mondays in lookahead window (LOOKAHEAD_DAYS = 56)
    const away = [makeAwayPeriod({ startDate: '2026-04-27', endDate: '2026-06-30' })];
    expect(getNextLessonCost(wallet, [booking], [], [], TODAY, away)).toBe(0);
  });

  it('getNextLessonCost finds the first Monday outside the away period', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 100 });
    // Mondays in window: 2026-04-27, 2026-05-04, 2026-05-11, 2026-05-18, 2026-05-25, 2026-06-01...
    // Block first 4: away period covers 2026-04-26 → 2026-05-22
    const away = [makeAwayPeriod({ startDate: '2026-04-26', endDate: '2026-05-22' })];
    expect(getNextLessonCost(wallet, [booking], [], [], TODAY, away)).toBe(60);
  });

  it('getWalletHealth flips from "low" to "healthy" when away period removes upcoming charges', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 60 });
    const noAwayHealth = getWalletHealth(wallet, [booking], [], [], TODAY);
    expect(noAwayHealth.health).toBe('low');

    const away = [makeAwayPeriod({ startDate: '2026-04-27', endDate: '2026-06-30' })];
    const withAwayHealth = getWalletHealth(wallet, [booking], [], [], TODAY, away);
    expect(withAwayHealth.health).toBe('healthy');
  });

  it('isLowBalance returns false when away period clears upcoming charges', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 60 });
    const away = [makeAwayPeriod({ startDate: '2026-04-27', endDate: '2026-06-30' })];
    expect(isLowBalance(wallet, [booking], [], [], TODAY, away)).toBe(false);
  });

  it('omitting awayPeriods keeps existing behaviour (backward-compatible)', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 60 });
    expect(getNextLessonCost(wallet, [booking], [], [], TODAY)).toBe(60);
  });
});

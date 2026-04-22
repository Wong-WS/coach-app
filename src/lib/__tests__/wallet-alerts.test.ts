import { describe, it, expect } from 'vitest';
import {
  getNextLessonCost,
  hasActiveBooking,
  isLowBalance,
  getTopUpMinimum,
  getEffectiveBalance,
} from '@/lib/wallet-alerts';
import type { Booking, Wallet, WalletTransaction } from '@/types';

function makeTxn(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    id: 't1',
    type: 'charge',
    amount: -60,
    balanceAfter: 0,
    description: '',
    date: '2026-04-18',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w1',
    name: 'Test Wallet',
    balance: 0,
    studentIds: ['s1'],
    payPerLesson: false,
    archived: false,
    minLessonsPerTopUp: 5,
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

describe('getNextLessonCost', () => {
  it('returns 0 when no bookings reference the wallet', () => {
    const wallet = makeWallet();
    expect(getNextLessonCost(wallet, [])).toBe(0);
  });

  it('sums prices for students in this wallet (single booking)', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'] });
    const booking = makeBooking({
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 60, s2: 60 },
      studentWallets: { s1: 'w1', s2: 'w1' },
    });
    expect(getNextLessonCost(wallet, [booking])).toBe(120);
  });

  it('excludes students in the same booking who use a different wallet', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1'] });
    const booking = makeBooking({
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 60, s2: 60 },
      studentWallets: { s1: 'w1', s2: 'w2' },
    });
    expect(getNextLessonCost(wallet, [booking])).toBe(60);
  });

  it('takes max across multiple bookings (worst-case single day)', () => {
    const wallet = makeWallet({ id: 'w1' });
    const b1 = makeBooking({ id: 'b1', studentPrices: { s1: 100 }, studentWallets: { s1: 'w1' } });
    const b2 = makeBooking({ id: 'b2', studentPrices: { s1: 140 }, studentWallets: { s1: 'w1' } });
    expect(getNextLessonCost(wallet, [b1, b2])).toBe(140);
  });

  it('ignores bookings that do not reference the wallet', () => {
    const wallet = makeWallet({ id: 'w1' });
    const other = makeBooking({ studentWallets: { s1: 'w2' } });
    expect(getNextLessonCost(wallet, [other])).toBe(0);
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
  const today = '2026-04-18';
  const booking = makeBooking();

  it('fires when balance < 2x next lesson cost and all gating rules pass', () => {
    const wallet = makeWallet({ balance: 20 });
    expect(isLowBalance(wallet, [booking], today)).toBe(true);
  });

  it('fires when balance covers exactly 1 lesson (< 2 lessons)', () => {
    const wallet = makeWallet({ balance: 60 });
    expect(isLowBalance(wallet, [booking], today)).toBe(true);
  });

  it('does not fire when balance covers 2+ lessons', () => {
    const wallet = makeWallet({ balance: 120 });
    expect(isLowBalance(wallet, [booking], today)).toBe(false);
  });

  it('does not fire for pay-per-lesson wallets', () => {
    const wallet = makeWallet({ balance: 0, payPerLesson: true });
    expect(isLowBalance(wallet, [booking], today)).toBe(false);
  });

  it('does not fire for archived wallets', () => {
    const wallet = makeWallet({ balance: 0, archived: true });
    expect(isLowBalance(wallet, [booking], today)).toBe(false);
  });

  it('does not fire when wallet has no active bookings', () => {
    const wallet = makeWallet({ balance: 0 });
    const ended = makeBooking({ endDate: '2026-03-01' });
    expect(isLowBalance(wallet, [ended], today)).toBe(false);
  });

  it('does not fire for orphan wallet (no bookings at all)', () => {
    const wallet = makeWallet({ balance: -100 });
    expect(isLowBalance(wallet, [], today)).toBe(false);
  });
});

describe('getTopUpMinimum', () => {
  it('returns rate × 5 − balance by default', () => {
    const wallet = makeWallet({ balance: 20 });
    const booking = makeBooking();
    expect(getTopUpMinimum(wallet, [booking])).toBe(280); // 60*5 - 20
  });

  it('respects custom minLessonsPerTopUp', () => {
    const wallet = makeWallet({ balance: 0, minLessonsPerTopUp: 10 });
    const booking = makeBooking();
    expect(getTopUpMinimum(wallet, [booking])).toBe(600); // 60*10 - 0
  });

  it('rolls over positive balance (subtracts it from the ask)', () => {
    const wallet = makeWallet({ balance: 200, minLessonsPerTopUp: 5 });
    const booking = makeBooking({ studentPrices: { s1: 240 }, studentWallets: { s1: 'w1' } });
    expect(getTopUpMinimum(wallet, [booking])).toBe(1000); // 240*5 - 200
  });

  it('clamps negative balance to 0 when no transactions are provided', () => {
    const wallet = makeWallet({ balance: -40 });
    const booking = makeBooking();
    expect(getTopUpMinimum(wallet, [booking])).toBe(300); // 60*5 - max(0, -40) = 300 - 0
  });

  it('uses most recent non-negative balanceAfter for the ask when balance is negative', () => {
    const wallet = makeWallet({ balance: -100 });
    const booking = makeBooking();
    const txns: WalletTransaction[] = [
      makeTxn({ id: 't3', balanceAfter: -100 }),
      makeTxn({ id: 't2', balanceAfter: -40 }),
      makeTxn({ id: 't1', balanceAfter: 20 }),
    ];
    expect(getTopUpMinimum(wallet, [booking], txns)).toBe(280); // 60*5 - 20
  });

  it('ignores transactions when current balance is non-negative', () => {
    const wallet = makeWallet({ balance: 20 });
    const booking = makeBooking();
    const txns: WalletTransaction[] = [makeTxn({ balanceAfter: 500 })];
    expect(getTopUpMinimum(wallet, [booking], txns)).toBe(280); // 60*5 - 20
  });

  it('returns 0 for pay-per-lesson wallets', () => {
    const wallet = makeWallet({ balance: -100, payPerLesson: true });
    const booking = makeBooking();
    expect(getTopUpMinimum(wallet, [booking])).toBe(0);
  });

  it('returns 0 when wallet has no active bookings (rate is 0)', () => {
    const wallet = makeWallet({ balance: 0 });
    expect(getTopUpMinimum(wallet, [])).toBe(0);
  });

  it('returns 0 when balance already exceeds package target', () => {
    const wallet = makeWallet({ balance: 600, minLessonsPerTopUp: 5 });
    const booking = makeBooking(); // rate = 60, target = 300, balance already covers
    expect(getTopUpMinimum(wallet, [booking])).toBe(0);
  });
});

describe('getEffectiveBalance', () => {
  it('returns current balance when non-negative', () => {
    const wallet = makeWallet({ balance: 50 });
    expect(getEffectiveBalance(wallet)).toBe(50);
    expect(getEffectiveBalance(wallet, [])).toBe(50);
  });

  it('returns 0 when balance is negative and no transactions are provided', () => {
    const wallet = makeWallet({ balance: -40 });
    expect(getEffectiveBalance(wallet)).toBe(0);
  });

  it('returns 0 when no transaction has a non-negative balanceAfter', () => {
    const wallet = makeWallet({ balance: -100 });
    const txns: WalletTransaction[] = [
      makeTxn({ balanceAfter: -40 }),
      makeTxn({ balanceAfter: -100 }),
    ];
    expect(getEffectiveBalance(wallet, txns)).toBe(0);
  });

  it('walks newest-first and returns the first non-negative balanceAfter', () => {
    const wallet = makeWallet({ balance: -100 });
    const txns: WalletTransaction[] = [
      makeTxn({ id: 't3', balanceAfter: -100 }),
      makeTxn({ id: 't2', balanceAfter: -40 }),
      makeTxn({ id: 't1', balanceAfter: 20 }),
    ];
    expect(getEffectiveBalance(wallet, txns)).toBe(20);
  });

  it('treats balanceAfter of exactly 0 as non-negative', () => {
    const wallet = makeWallet({ balance: -60 });
    const txns: WalletTransaction[] = [
      makeTxn({ balanceAfter: -60 }),
      makeTxn({ balanceAfter: 0 }),
      makeTxn({ balanceAfter: 120 }),
    ];
    expect(getEffectiveBalance(wallet, txns)).toBe(0);
  });
});

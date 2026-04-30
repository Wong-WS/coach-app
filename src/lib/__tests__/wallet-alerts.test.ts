import { describe, it, expect } from 'vitest';
import {
  getNextLessonCost,
  hasActiveBooking,
  isLowBalance,
  getWalletStatus,
} from '@/lib/wallet-alerts';
import type { Booking, Wallet } from '@/types';

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

describe('getNextLessonCost', () => {
  const today = '2026-04-30';

  it('returns 0 when no bookings reference the wallet', () => {
    const wallet = makeWallet();
    expect(getNextLessonCost(wallet, [], today)).toBe(0);
  });

  it('sums prices for students in this wallet (single booking)', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'] });
    const booking = makeBooking({
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 60, s2: 60 },
      studentWallets: { s1: 'w1', s2: 'w1' },
    });
    expect(getNextLessonCost(wallet, [booking], today)).toBe(120);
  });

  it('excludes students in the same booking who use a different wallet', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1'] });
    const booking = makeBooking({
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 60, s2: 60 },
      studentWallets: { s1: 'w1', s2: 'w2' },
    });
    expect(getNextLessonCost(wallet, [booking], today)).toBe(60);
  });

  it('takes max across multiple bookings (worst-case single day)', () => {
    const wallet = makeWallet({ id: 'w1' });
    const b1 = makeBooking({ id: 'b1', studentPrices: { s1: 100 }, studentWallets: { s1: 'w1' } });
    const b2 = makeBooking({ id: 'b2', studentPrices: { s1: 140 }, studentWallets: { s1: 'w1' } });
    expect(getNextLessonCost(wallet, [b1, b2], today)).toBe(140);
  });

  it('ignores bookings that do not reference the wallet', () => {
    const wallet = makeWallet({ id: 'w1' });
    const other = makeBooking({ studentWallets: { s1: 'w2' } });
    expect(getNextLessonCost(wallet, [other], today)).toBe(0);
  });

  it('skips ended bookings so stale prices do not leak into the rate', () => {
    // Repro: group lesson [s1, s2] @ 70/70 was edited to a solo for s1 @ 120
    // via "this and future". The old booking is capped with endDate < today
    // but stays status=confirmed in Firestore. Without the endDate filter,
    // s2's 70 from the ended booking would still count, giving 120 + 70 = 190.
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'] });
    const ended = makeBooking({
      id: 'ended',
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 70, s2: 70 },
      studentWallets: { s1: 'w1', s2: 'w1' },
      endDate: '2026-04-23',
    });
    const active = makeBooking({
      id: 'active',
      studentIds: ['s1'],
      studentPrices: { s1: 120 },
      studentWallets: { s1: 'w1' },
      startDate: '2026-04-30',
    });
    expect(getNextLessonCost(wallet, [ended, active], today)).toBe(120);
  });

  it('still counts a booking ending today', () => {
    const wallet = makeWallet({ id: 'w1' });
    const b = makeBooking({ studentPrices: { s1: 80 }, endDate: today });
    expect(getNextLessonCost(wallet, [b], today)).toBe(80);
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

  it('does not fire for tab-mode wallets, even at zero or negative', () => {
    const zero = makeWallet({ balance: 0, tabMode: true });
    expect(isLowBalance(zero, [booking], today)).toBe(false);
    const negative = makeWallet({ balance: -100, tabMode: true });
    expect(isLowBalance(negative, [booking], today)).toBe(false);
  });
});

describe('getWalletStatus', () => {
  const today = '2026-04-18';
  const booking = makeBooking();

  it('reports isLow = false for tab-mode wallets regardless of balance', () => {
    const wallet = makeWallet({ balance: 0, tabMode: true });
    expect(getWalletStatus(wallet, [booking], today).isLow).toBe(false);
  });

  it('still computes rate for tab-mode wallets (for top-up presets)', () => {
    const wallet = makeWallet({ balance: 0, tabMode: true });
    expect(getWalletStatus(wallet, [booking], today).rate).toBe(60);
  });

  it('reports isLow = true for prepaid wallets at zero with active booking', () => {
    const wallet = makeWallet({ balance: 0 });
    expect(getWalletStatus(wallet, [booking], today).isLow).toBe(true);
  });

  it('returns zero rate for archived wallets', () => {
    const wallet = makeWallet({ balance: 0, archived: true });
    const status = getWalletStatus(wallet, [booking], today);
    expect(status.rate).toBe(0);
    expect(status.isLow).toBe(false);
  });
});

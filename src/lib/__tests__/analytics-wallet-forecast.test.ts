import { describe, it, expect } from 'vitest';
import { likelyToReceive } from '@/lib/analytics/wallet-forecast';
import type { Booking, Wallet } from '@/types';

function wallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w1',
    name: 'Tan family',
    balanceCents: 12000,
    studentIds: ['s1'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    locationId: 'loc1',
    locationName: 'Pool A',
    dayOfWeek: 'monday', // Mondays left from 16 Nov: 16, 23, 30
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    className: 'Swim',
    notes: '',
    studentIds: ['s1'],
    studentPriceCents: { s1: 6000 },
    studentWallets: { s1: 'w1' },
    createdAt: new Date(),
    ...overrides,
  };
}

function run(wallets: Wallet[], bookings: Booking[], today = '2026-11-16', lastTopUpCents: Record<string, number> = {}) {
  return likelyToReceive({
    wallets,
    bookings,
    exceptions: [],
    awayPeriods: [],
    logs: [],
    today,
    monthEnd: '2026-11-30',
    lastTopUpCents,
  });
}

describe('likelyToReceive — prepaid wallets', () => {
  it('finds the first class the balance cannot cover', () => {
    const { rows } = run([wallet({ usualTopUpCents: 60000 })], [booking()]);
    expect(rows).toEqual([
      { walletId: 'w1', name: 'Tan family', runOut: { kind: 'date', date: '2026-11-30' }, amountCents: 60000 },
    ]);
  });

  it('falls back to the last top-up amount', () => {
    expect(run([wallet()], [booking()], '2026-11-16', { w1: 48000 }).rows[0].amountCents).toBe(48000);
  });

  it('shows no amount when there is no usual or past top-up, and leaves it out of the total', () => {
    const result = run([wallet()], [booking()]);
    expect(result.rows[0].amountCents).toBeNull();
    expect(result.totalCents).toBe(0);
  });

  it('is out now when the balance cannot cover the next class', () => {
    expect(run([wallet({ balanceCents: 3000 })], [booking()]).rows[0].runOut).toEqual({ kind: 'now' });
  });

  it('is out now when it already owes money and has nothing left to come', () => {
    expect(run([wallet({ balanceCents: -500 })], []).rows[0].runOut).toEqual({ kind: 'now' });
  });

  it('is not listed when the balance lasts the month', () => {
    expect(run([wallet({ balanceCents: 50000 })], [booking()]).rows).toEqual([]);
  });

  it('charges both siblings sharing a wallet for the same class', () => {
    const b = booking({
      studentIds: ['s1', 's2'],
      studentPriceCents: { s1: 6000, s2: 4000 },
      studentWallets: { s1: 'w1', s2: 'w1' },
    });
    // 15000 covers 16 Nov (10000) but not 23 Nov.
    expect(run([wallet({ balanceCents: 15000 })], [b]).rows[0].runOut).toEqual({ kind: 'date', date: '2026-11-23' });
  });

  it('ignores archived wallets', () => {
    expect(run([wallet({ archived: true, balanceCents: 0 })], [booking()]).rows).toEqual([]);
  });
});

describe('likelyToReceive — tab wallets', () => {
  it('expects what the wallet will owe by month end', () => {
    const { rows, totalCents } = run([wallet({ tabMode: true, balanceCents: -2000 })], [booking()], '2026-11-18');
    expect(rows).toEqual([{ walletId: 'w1', name: 'Tan family', runOut: { kind: 'tab' }, amountCents: 14000 }]);
    expect(totalCents).toBe(14000);
  });

  it('is not listed when it will owe nothing', () => {
    expect(run([wallet({ tabMode: true, balanceCents: 50000 })], [booking()]).rows).toEqual([]);
  });
});

describe('likelyToReceive — ordering and total', () => {
  it('lists out-now first, then by run-out date, then tab wallets', () => {
    const wallets = [
      wallet({ id: 'w1', name: 'Date', usualTopUpCents: 100 }),
      wallet({ id: 'w2', name: 'Now', balanceCents: 0, usualTopUpCents: 200 }),
      wallet({ id: 'w3', name: 'Tab', tabMode: true, balanceCents: 0 }),
    ];
    const bookings = [
      booking({ id: 'a', studentWallets: { s1: 'w1' } }),
      booking({ id: 'b', studentIds: ['s2'], studentPriceCents: { s2: 6000 }, studentWallets: { s2: 'w2' } }),
      booking({ id: 'c', studentIds: ['s3'], studentPriceCents: { s3: 6000 }, studentWallets: { s3: 'w3' } }),
    ];
    const result = run(wallets, bookings);
    expect(result.rows.map((r) => r.name)).toEqual(['Now', 'Date', 'Tab']);
    expect(result.totalCents).toBe(100 + 200 + 18000);
  });
});

import { describe, it, expect } from 'vitest';
import { createBalanceTracker, planUndoRefunds } from '@/lib/wallet-ledger';
import type { Wallet } from '@/types';

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w1',
    name: 'Test Wallet',
    balanceCents: 0,
    studentIds: ['s1'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('createBalanceTracker', () => {
  it('returns the balance after a single charge', () => {
    const t = createBalanceTracker([makeWallet({ id: 'w1', balanceCents: 36000 })]);

    expect(t.apply('w1', -6000)).toBe(30000);
  });

  it('sequences charges to the same wallet — the second sees the first', () => {
    // Two siblings on one RM 360 wallet, RM 60 each: receipts must read
    // 300 then 240, not 300 twice.
    const t = createBalanceTracker([makeWallet({ id: 'w1', balanceCents: 36000 })]);

    expect(t.apply('w1', -6000)).toBe(30000);
    expect(t.apply('w1', -6000)).toBe(24000);
  });

  it('tracks wallets independently', () => {
    const t = createBalanceTracker([
      makeWallet({ id: 'w1', balanceCents: 10000 }),
      makeWallet({ id: 'w2', balanceCents: 5000 }),
    ]);

    expect(t.apply('w1', -2000)).toBe(8000);
    expect(t.apply('w2', -2000)).toBe(3000);
    expect(t.apply('w1', -2000)).toBe(6000);
  });

  it('handles refunds (positive deltas)', () => {
    const t = createBalanceTracker([makeWallet({ id: 'w1', balanceCents: 5000 })]);

    expect(t.apply('w1', 10000)).toBe(15000);
    expect(t.apply('w1', 10000)).toBe(25000);
  });

  it('goes negative when charges exceed the balance', () => {
    const t = createBalanceTracker([makeWallet({ id: 'w1', balanceCents: 5000 })]);

    expect(t.apply('w1', -6000)).toBe(-1000);
  });

  it('throws on an unknown wallet id rather than inventing a balance', () => {
    const t = createBalanceTracker([makeWallet({ id: 'w1' })]);

    expect(() => t.apply('nope', -100)).toThrow();
  });
});

describe('planUndoRefunds', () => {
  const charge = (lessonLogId: string, walletId: string, amountCents: number) => ({
    lessonLogId, walletId, amountCents, type: 'charge' as const, description: `Lesson x`, studentId: 's1',
  });
  const refund = (lessonLogId: string, walletId: string) => ({
    lessonLogId, walletId, amountCents: 7000, type: 'refund' as const, description: 'Reversed', studentId: 's1',
  });

  it('plans one refund per charge', () => {
    const plan = planUndoRefunds([charge('log1', 'w1', -7000)]);
    expect(plan).toEqual([
      { walletId: 'w1', lessonLogId: 'log1', amountCents: 7000, description: 'Lesson x', studentId: 's1' },
    ]);
  });

  it('skips a charge that already has a refund — undo must be idempotent', () => {
    // A double-fired undo (spam-click, two tabs) found the charge twice.
    // The second pass must see the first refund and do nothing.
    const plan = planUndoRefunds([charge('log1', 'w1', -7000), refund('log1', 'w1')]);
    expect(plan).toEqual([]);
  });

  it('refunds only the unreversed charges in a mixed set', () => {
    const plan = planUndoRefunds([
      charge('log1', 'w1', -7000),
      refund('log1', 'w1'),
      charge('log2', 'w2', -6000),
    ]);
    expect(plan.map((p) => p.lessonLogId)).toEqual(['log2']);
  });

  it('ignores zero-amount charges', () => {
    expect(planUndoRefunds([charge('log1', 'w1', 0)])).toEqual([]);
  });

  it('uses the charged magnitude, not a sign', () => {
    const plan = planUndoRefunds([charge('log1', 'w1', -12345)]);
    expect(plan[0].amountCents).toBe(12345);
  });
});

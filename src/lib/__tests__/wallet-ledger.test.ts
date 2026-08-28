import { describe, it, expect } from 'vitest';
import { createBalanceTracker } from '@/lib/wallet-ledger';
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

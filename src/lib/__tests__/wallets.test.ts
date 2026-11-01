import { describe, it, expect } from 'vitest';
import { walletMembersToAdd } from '@/lib/wallets';
import type { Wallet } from '@/types';

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w1',
    name: 'Chris Chiu',
    balanceCents: 0,
    studentIds: ['murphy'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('walletMembersToAdd', () => {
  it('adds a wallet-less student to the wallet the lesson charges', () => {
    const wallets = [makeWallet()];
    expect(walletMembersToAdd({ sunny: 'w1' }, wallets)).toEqual({ w1: ['sunny'] });
  });

  it('skips a student already in that wallet', () => {
    const wallets = [makeWallet()];
    expect(walletMembersToAdd({ murphy: 'w1' }, wallets)).toEqual({});
  });

  it('skips a student who already belongs to a different wallet', () => {
    const wallets = [makeWallet(), makeWallet({ id: 'w2', studentIds: ['sunny'] })];
    expect(walletMembersToAdd({ sunny: 'w1' }, wallets)).toEqual({});
  });

  it('groups several new members of the same wallet', () => {
    const wallets = [makeWallet()];
    expect(walletMembersToAdd({ sunny: 'w1', amy: 'w1' }, wallets)).toEqual({
      w1: ['sunny', 'amy'],
    });
  });

  it('ignores wallets it does not know about', () => {
    expect(walletMembersToAdd({ sunny: 'missing' }, [makeWallet()])).toEqual({});
  });
});

import type { Booking, Wallet } from '@/types';

export function resolveWallet(
  booking: Pick<Booking, 'studentWallets'> | null | undefined,
  studentId: string,
  wallets: Wallet[],
): Wallet | null {
  if (!studentId) return null;
  const explicitId = booking?.studentWallets?.[studentId];
  if (explicitId) return wallets.find((w) => w.id === explicitId) ?? null;
  return wallets.find((w) => w.studentIds.includes(studentId)) ?? null;
}

// Students a new lesson should add to an existing wallet's `studentIds`, keyed
// by wallet id. Only students in no wallet yet are added — the Students page and
// Payments search find a student's wallet by membership, so without this a new
// student charged to a sibling's wallet looks wallet-less. Students who already
// have a wallet are left alone: charging someone else's wallet for one lesson
// shouldn't make them a member of two.
export function walletMembersToAdd(
  studentWallets: Record<string, string>,
  wallets: Wallet[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [studentId, walletId] of Object.entries(studentWallets)) {
    if (!wallets.some((w) => w.id === walletId)) continue;
    if (wallets.some((w) => w.studentIds.includes(studentId))) continue;
    (out[walletId] ??= []).push(studentId);
  }
  return out;
}

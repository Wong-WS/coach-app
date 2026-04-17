import type { Booking, Wallet } from '@/types';

export function resolveWallet(
  booking: Pick<Booking, 'studentWallets' | 'walletId'> | null | undefined,
  studentId: string,
  wallets: Wallet[],
): Wallet | null {
  if (!studentId) return null;
  const explicitId = booking?.studentWallets?.[studentId] || booking?.walletId;
  if (explicitId) return wallets.find((w) => w.id === explicitId) ?? null;
  return wallets.find((w) => w.studentIds.includes(studentId)) ?? null;
}

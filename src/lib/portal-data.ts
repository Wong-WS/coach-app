import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Booking, Wallet, WalletTransaction } from '@/types';
import { getWalletHealth, type WalletHealth } from '@/lib/wallet-alerts';
import { getSuggestedTopUp } from '@/lib/portal-suggestion';

export type PortalPayload = {
  coach: { displayName: string };
  wallet: {
    name: string;
    balance: number;
    status: WalletHealth;
    rate: number;
  };
  suggestion: { usual: number; amount: number } | null;
  charges: Array<{
    date: string;
    studentName: string;
    amount: number;
    balanceAfter: number;
  }>;
  topUps: Array<{
    date: string;
    amount: number;
    balanceAfter: number;
  }>;
};

function todayIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchPortalData(token: string): Promise<PortalPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const db = getAdminDb();

  // 1. Resolve token → { coachId, walletId }
  const tokenSnap = await db.doc(`walletPortalTokens/${token}`).get();
  if (!tokenSnap.exists) return null;
  const tokenData = tokenSnap.data() as { coachId?: string; walletId?: string } | undefined;
  const coachId = tokenData?.coachId;
  const walletId = tokenData?.walletId;
  if (!coachId || !walletId) return null;

  // 2. Coach
  const coachSnap = await db.doc(`coaches/${coachId}`).get();
  if (!coachSnap.exists) return null;
  const displayName = (coachSnap.data()?.displayName as string | undefined) ?? 'Coach';

  // 3. Wallet (reject if archived)
  const walletSnap = await db.doc(`coaches/${coachId}/wallets/${walletId}`).get();
  if (!walletSnap.exists) return null;
  const wd = walletSnap.data() ?? {};
  if (wd.archived) return null;
  const wallet: Wallet = {
    id: walletSnap.id,
    name: (wd.name as string) ?? 'Wallet',
    balance: (wd.balance as number) ?? 0,
    studentIds: (wd.studentIds as string[]) ?? [],
    archived: false,
    tabMode: (wd.tabMode as boolean) ?? false,
    portalToken: (wd.portalToken as string) ?? undefined,
    createdAt: wd.createdAt?.toDate?.() ?? new Date(),
    updatedAt: wd.updatedAt?.toDate?.() ?? new Date(),
  };

  // 4. Bookings → feeds getWalletHealth for rate + status
  const bookingsSnap = await db
    .collection(`coaches/${coachId}/bookings`)
    .where('status', '==', 'confirmed')
    .get();
  const bookings: Booking[] = bookingsSnap.docs.map((d) => {
    const b = d.data();
    return {
      id: d.id,
      locationId: b.locationId,
      locationName: b.locationName,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      className: b.className ?? '',
      notes: b.notes ?? '',
      studentIds: b.studentIds ?? [],
      studentPrices: b.studentPrices ?? {},
      studentWallets: b.studentWallets ?? {},
      startDate: b.startDate ?? undefined,
      endDate: b.endDate ?? undefined,
      createdAt: b.createdAt?.toDate?.() ?? new Date(),
      cancelledAt: b.cancelledAt?.toDate?.(),
    };
  });
  const { health, rate } = getWalletHealth(wallet, bookings, todayIsoDate());

  // 5. Transactions (30 most recent, newest first)
  const txnsSnap = await db
    .collection(`coaches/${coachId}/wallets/${walletId}/transactions`)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get();
  const txns: WalletTransaction[] = txnsSnap.docs.map((d) => {
    const t = d.data();
    return {
      id: d.id,
      type: t.type,
      amount: t.amount ?? 0,
      balanceAfter: t.balanceAfter ?? 0,
      description: t.description ?? '',
      studentId: t.studentId ?? undefined,
      lessonLogId: t.lessonLogId ?? undefined,
      date: t.date,
      createdAt: t.createdAt?.toDate?.() ?? new Date(),
    };
  });

  // 6. Resolve student names (only the ones that appear in transactions on this wallet)
  const studentIdsInTxns = new Set<string>();
  for (const t of txns) {
    if (t.studentId) studentIdsInTxns.add(t.studentId);
  }
  const studentNames = new Map<string, string>();
  await Promise.all(
    Array.from(studentIdsInTxns).map(async (sid) => {
      const s = await db.doc(`coaches/${coachId}/students/${sid}`).get();
      if (s.exists) studentNames.set(sid, (s.data()?.clientName as string) ?? '');
    }),
  );
  const hideStudentNames = wallet.studentIds.length <= 1;

  // 7. Split transactions into charges / top-ups
  const charges: PortalPayload['charges'] = [];
  const topUps: PortalPayload['topUps'] = [];
  for (const t of txns) {
    if (t.type === 'charge') {
      charges.push({
        date: t.date,
        studentName: hideStudentNames ? '' : (t.studentId ? studentNames.get(t.studentId) ?? '' : ''),
        amount: Math.abs(t.amount),
        balanceAfter: t.balanceAfter,
      });
    } else if (t.type === 'top-up') {
      topUps.push({
        date: t.date,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
      });
    }
    // refunds and adjustments: intentionally omitted from the portal view to
    // keep the parent-facing list clean. Balance still reflects them.
  }
  const displayCharges = charges.slice(0, 20);
  const displayTopUps = topUps.slice(0, 10);

  // 8. Suggestion — only meaningful when balance can't cover next lesson
  const usualTopUp = topUps.length > 0 ? topUps[0].amount : null;
  const showSuggestion = health === 'empty' || health === 'owing';
  const suggestion = showSuggestion ? getSuggestedTopUp(usualTopUp, wallet.balance) : null;

  return {
    coach: { displayName },
    wallet: {
      name: wallet.name,
      balance: wallet.balance,
      status: health,
      rate,
    },
    suggestion,
    charges: displayCharges,
    topUps: displayTopUps,
  };
}

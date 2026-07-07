import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Booking, ClassException, LessonLog, Wallet, AwayPeriod } from '@/types';
import { getWalletHealth, type WalletHealth } from '@/lib/wallet-alerts';
import { getSuggestedTopUp } from '@/lib/portal-suggestion';
import { computeLessonSets, type SetInputTxn, type PortalLessonSets } from '@/lib/portal-sets';
import type { WalletTransactionType } from '@/types';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';

export type PortalPayload = {
  coach: { displayName: string };
  wallet: {
    name: string;
    balance: number;
    status: WalletHealth;
    rate: number;
    hideStudentNames: boolean;
  };
  suggestion: { usual: number; amount: number } | null;
  sets: PortalLessonSets;
};

export type PortalTokenResolution = {
  db: Firestore;
  coachId: string;
  walletId: string;
  hideStudentNames: boolean;
};

function todayIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDateOffset(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Resolve a portal token to its coach+wallet context, rejecting if the token
 * is missing, the wallet is archived, or either doc has been deleted.
 * Shared by the page fetch and the load-more API route so both enforce the
 * same access rules.
 */
export async function resolvePortalToken(
  token: string,
): Promise<PortalTokenResolution | null> {
  if (!token || typeof token !== 'string') return null;
  const db = getAdminDb();

  const tokenSnap = await db.doc(`walletPortalTokens/${token}`).get();
  if (!tokenSnap.exists) return null;
  const tokenData = tokenSnap.data() as { coachId?: string; walletId?: string } | undefined;
  const coachId = tokenData?.coachId;
  const walletId = tokenData?.walletId;
  if (!coachId || !walletId) return null;

  const walletSnap = await db.doc(`coaches/${coachId}/wallets/${walletId}`).get();
  if (!walletSnap.exists) return null;
  const wd = walletSnap.data() ?? {};
  if (wd.archived) return null;
  const studentIds = (wd.studentIds as string[]) ?? [];
  return {
    db,
    coachId,
    walletId,
    hideStudentNames: studentIds.length <= 1,
  };
}

/**
 * Fetch every transaction for the wallet, oldest-first, reduced to the fields
 * `computeLessonSets` needs. Solo-coach wallets have small histories, so a single
 * ordered read is fine.
 */
async function fetchAllTransactions(ctx: PortalTokenResolution): Promise<SetInputTxn[]> {
  const { db, coachId, walletId } = ctx;
  const snap = await db
    .collection(`coaches/${coachId}/wallets/${walletId}/transactions`)
    .orderBy('createdAt', 'asc')
    .get();
  return snap.docs.map((d) => {
    const t = d.data();
    return {
      type: (t.type as WalletTransactionType) ?? 'charge',
      amount: (t.amount as number) ?? 0,
      balanceAfter: (t.balanceAfter as number) ?? 0,
      date: (t.date as string) ?? '',
      createdAt: (t.createdAt as Timestamp | undefined)?.toMillis?.() ?? 0,
    };
  });
}

export async function fetchPortalData(token: string): Promise<PortalPayload | null> {
  const ctx = await resolvePortalToken(token);
  if (!ctx) return null;
  const { db, coachId, walletId, hideStudentNames } = ctx;

  const today = todayIsoDate();
  // Fetch a 4-month exception window centred on today, matching the dashboard's
  // useClassExceptions hook so getWalletHealth's lookahead has the same data.
  const fourMonthsAgo = isoDateOffset(today, -120);
  const fourMonthsAhead = isoDateOffset(today, 120);
  const [coachSnap, walletSnap, bookingsSnap, exceptionsSnap, awayPeriodsSnap, todayLogsSnap, allTxns] =
    await Promise.all([
      db.doc(`coaches/${coachId}`).get(),
      db.doc(`coaches/${coachId}/wallets/${walletId}`).get(),
      db
        .collection(`coaches/${coachId}/bookings`)
        .where('status', '==', 'confirmed')
        .get(),
      db
        .collection(`coaches/${coachId}/classExceptions`)
        .where('originalDate', '>=', fourMonthsAgo)
        .where('originalDate', '<=', fourMonthsAhead)
        .get(),
      db
        .collection(`coaches/${coachId}/awayPeriods`)
        .where('startDate', '<=', fourMonthsAhead)
        .get(),
      db.collection(`coaches/${coachId}/lessonLogs`).where('date', '==', today).get(),
      fetchAllTransactions(ctx),
    ]);

  if (!coachSnap.exists || !walletSnap.exists) return null;
  const displayName = (coachSnap.data()?.displayName as string | undefined) ?? 'Coach';

  const wd = walletSnap.data() ?? {};
  const wallet: Wallet = {
    id: walletSnap.id,
    name: (wd.name as string) ?? 'Wallet',
    balance: (wd.balance as number) ?? 0,
    studentIds: (wd.studentIds as string[]) ?? [],
    archived: false,
    tabMode: (wd.tabMode as boolean) ?? false,
    portalToken: (wd.portalToken as string) ?? undefined,
    usualTopUp: typeof wd.usualTopUp === 'number' ? wd.usualTopUp : undefined,
    createdAt: wd.createdAt?.toDate?.() ?? new Date(),
    updatedAt: wd.updatedAt?.toDate?.() ?? new Date(),
  };

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

  const exceptions: ClassException[] = exceptionsSnap.docs.map((d) => {
    const e = d.data();
    return {
      id: d.id,
      bookingId: e.bookingId,
      originalDate: e.originalDate,
      type: e.type,
      newDate: e.newDate,
      newStartTime: e.newStartTime,
      newEndTime: e.newEndTime,
      newLocationId: e.newLocationId,
      newLocationName: e.newLocationName,
      newNote: e.newNote,
      newClassName: e.newClassName,
      newStudentIds: e.newStudentIds,
      newStudentPrices: e.newStudentPrices,
      newStudentWallets: e.newStudentWallets,
      createdAt: e.createdAt?.toDate?.() ?? new Date(),
    };
  });
  const awayPeriods: AwayPeriod[] = awayPeriodsSnap.docs
    .map((d) => {
      const a = d.data();
      return {
        id: d.id,
        startDate: a.startDate as string,
        endDate: a.endDate as string,
        label: a.label as string | undefined,
        createdAt: a.createdAt?.toDate?.() ?? new Date(),
        updatedAt: a.updatedAt?.toDate?.() ?? new Date(),
      };
    })
    .filter((p) => p.endDate >= fourMonthsAgo);

  const todayLogs: LessonLog[] = todayLogsSnap.docs.map((d) => {
    const l = d.data();
    return {
      id: d.id,
      date: l.date,
      bookingId: l.bookingId,
      studentId: l.studentId,
      studentName: l.studentName ?? '',
      locationName: l.locationName ?? '',
      startTime: l.startTime ?? '',
      endTime: l.endTime ?? '',
      price: l.price ?? 0,
      createdAt: l.createdAt?.toDate?.() ?? new Date(),
    };
  });

  const { health, rate } = getWalletHealth(wallet, bookings, exceptions, todayLogs, today, awayPeriods);

  const suggestion =
    (health === 'empty' || health === 'owing')
      ? getSuggestedTopUp(wallet.usualTopUp ?? null, wallet.balance)
      : null;

  const forceFlat = wallet.tabMode === true || !hideStudentNames;
  const sets = computeLessonSets(allTxns, rate, forceFlat);

  return {
    coach: { displayName },
    wallet: {
      name: wallet.name,
      balance: wallet.balance,
      status: health,
      rate,
      hideStudentNames,
    },
    suggestion,
    sets,
  };
}

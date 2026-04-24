import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Booking, Wallet } from '@/types';
import { getWalletHealth, type WalletHealth } from '@/lib/wallet-alerts';
import { getSuggestedTopUp } from '@/lib/portal-suggestion';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';

export const PORTAL_PAGE_SIZE = 10;

export type PortalChargeRow = {
  date: string;
  studentName: string;          // empty when wallet has ≤1 student
  amount: number;               // positive RM
  balanceAfter: number;
  cursor: number;               // createdAt ms — opaque pagination key
};

export type PortalTopUpRow = {
  date: string;
  amount: number;
  balanceAfter: number;
  cursor: number;
};

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
  charges: { items: PortalChargeRow[]; hasMore: boolean };
  topUps: { items: PortalTopUpRow[]; hasMore: boolean };
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

async function fetchStudentNames(
  db: Firestore,
  coachId: string,
  studentIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  await Promise.all(
    studentIds.map(async (sid) => {
      const s = await db.doc(`coaches/${coachId}/students/${sid}`).get();
      if (s.exists) names.set(sid, (s.data()?.clientName as string) ?? '');
    }),
  );
  return names;
}

/**
 * Fetch a page of charges (oldest cursor = newest shown; pass `cursor` to load
 * older entries). Requests one extra row to derive `hasMore`.
 */
export async function fetchChargesPage(
  ctx: PortalTokenResolution,
  cursor: number | null,
  limit: number = PORTAL_PAGE_SIZE,
): Promise<{ items: PortalChargeRow[]; hasMore: boolean }> {
  const { db, coachId, walletId, hideStudentNames } = ctx;
  let q = db
    .collection(`coaches/${coachId}/wallets/${walletId}/transactions`)
    .where('type', '==', 'charge')
    .orderBy('createdAt', 'desc');
  if (cursor != null) q = q.startAfter(new Date(cursor));
  const snap = await q.limit(limit + 1).get();

  const rows = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;

  const studentIds = new Set<string>();
  for (const d of rows) {
    const sid = d.data().studentId as string | undefined;
    if (sid) studentIds.add(sid);
  }
  const studentNames = hideStudentNames
    ? new Map<string, string>()
    : await fetchStudentNames(db, coachId, Array.from(studentIds));

  const items: PortalChargeRow[] = rows.map((d) => {
    const t = d.data();
    const createdAt = (t.createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
    const sid = t.studentId as string | undefined;
    return {
      date: t.date as string,
      studentName: hideStudentNames ? '' : (sid ? studentNames.get(sid) ?? '' : ''),
      amount: Math.abs((t.amount as number) ?? 0),
      balanceAfter: (t.balanceAfter as number) ?? 0,
      cursor: createdAt,
    };
  });
  return { items, hasMore };
}

export async function fetchTopUpsPage(
  ctx: PortalTokenResolution,
  cursor: number | null,
  limit: number = PORTAL_PAGE_SIZE,
): Promise<{ items: PortalTopUpRow[]; hasMore: boolean }> {
  const { db, coachId, walletId } = ctx;
  let q = db
    .collection(`coaches/${coachId}/wallets/${walletId}/transactions`)
    .where('type', '==', 'top-up')
    .orderBy('createdAt', 'desc');
  if (cursor != null) q = q.startAfter(new Date(cursor));
  const snap = await q.limit(limit + 1).get();

  const rows = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;
  const items: PortalTopUpRow[] = rows.map((d) => {
    const t = d.data();
    const createdAt = (t.createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
    return {
      date: t.date as string,
      amount: (t.amount as number) ?? 0,
      balanceAfter: (t.balanceAfter as number) ?? 0,
      cursor: createdAt,
    };
  });
  return { items, hasMore };
}

export async function fetchPortalData(token: string): Promise<PortalPayload | null> {
  const ctx = await resolvePortalToken(token);
  if (!ctx) return null;
  const { db, coachId, walletId, hideStudentNames } = ctx;

  const [coachSnap, walletSnap, bookingsSnap, charges, topUps] = await Promise.all([
    db.doc(`coaches/${coachId}`).get(),
    db.doc(`coaches/${coachId}/wallets/${walletId}`).get(),
    db
      .collection(`coaches/${coachId}/bookings`)
      .where('status', '==', 'confirmed')
      .get(),
    fetchChargesPage(ctx, null),
    fetchTopUpsPage(ctx, null),
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

  const { health, rate } = getWalletHealth(wallet, bookings, todayIsoDate());

  const suggestion =
    (health === 'empty' || health === 'owing')
      ? getSuggestedTopUp(wallet.usualTopUp ?? null, wallet.balance)
      : null;

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
    charges,
    topUps,
  };
}

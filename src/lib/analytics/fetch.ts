import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { centsFromLegacy } from '@/lib/money';
import { exceptionFromDoc, lessonLogFromDoc } from '@/lib/firestore-mappers';
import type { ClassException, LessonLog } from '@/types';
import type { DateRange } from './periods';

// One-time range reads for the analytics page. History doesn't change under
// the coach's feet, so no live listeners — each read costs quota once.

export type TopUp = { walletId: string; amountCents: number; date: string };

function fs(): Firestore {
  if (!db) throw new Error('Firestore not initialised');
  return db as Firestore;
}

export async function fetchLessonLogs(coachId: string, range: DateRange): Promise<LessonLog[]> {
  const snap = await getDocs(
    query(
      collection(fs(), 'coaches', coachId, 'lessonLogs'),
      where('date', '>=', range.start),
      where('date', '<=', range.end),
    ),
  );
  return snap.docs.map((d) => lessonLogFromDoc(d.id, d.data()));
}

/**
 * Exceptions whose original date OR moved-to date falls in `range`: a class
 * moved into the range and then cancelled counts on the date it moved to.
 */
export async function fetchExceptions(coachId: string, range: DateRange): Promise<ClassException[]> {
  const col = collection(fs(), 'coaches', coachId, 'classExceptions');
  const [byOriginal, byNew] = await Promise.all([
    getDocs(query(col, where('originalDate', '>=', range.start), where('originalDate', '<=', range.end))),
    getDocs(query(col, where('newDate', '>=', range.start), where('newDate', '<=', range.end))),
  ]);
  const byId = new Map<string, ClassException>();
  for (const d of [...byOriginal.docs, ...byNew.docs]) byId.set(d.id, exceptionFromDoc(d.id, d.data()));
  return [...byId.values()];
}

/** Top-ups dated in `range`, one query per wallet fanned out in parallel. */
export async function fetchTopUps(coachId: string, walletIds: string[], range: DateRange): Promise<TopUp[]> {
  const perWallet = await Promise.all(
    walletIds.map(async (walletId) => {
      const snap = await getDocs(
        query(
          collection(fs(), 'coaches', coachId, 'wallets', walletId, 'transactions'),
          where('type', '==', 'top-up'),
          where('date', '>=', range.start),
          where('date', '<=', range.end),
        ),
      );
      return snap.docs.map((d) => ({
        walletId,
        amountCents: centsFromLegacy(d.data().amountCents, d.data().amount),
        date: d.data().date as string,
      }));
    }),
  );
  return perWallet.flat();
}

/** Most recent top-up amount per wallet (fallback for wallets with no usual top-up). */
export async function fetchLastTopUps(coachId: string, walletIds: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    walletIds.map(async (walletId) => {
      const snap = await getDocs(
        query(
          collection(fs(), 'coaches', coachId, 'wallets', walletId, 'transactions'),
          where('type', '==', 'top-up'),
          orderBy('createdAt', 'desc'),
          limit(1),
        ),
      );
      const d = snap.docs[0];
      return d ? ([walletId, centsFromLegacy(d.data().amountCents, d.data().amount)] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, number] => e !== null));
}

/** Date of the coach's first-ever lesson marked done, or null. */
export async function fetchFirstLogDate(coachId: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(fs(), 'coaches', coachId, 'lessonLogs'), orderBy('date', 'asc'), limit(1)),
  );
  return snap.docs[0]?.data().date ?? null;
}

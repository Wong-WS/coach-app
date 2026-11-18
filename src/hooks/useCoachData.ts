'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking, Location, Student, LessonLog, ClassException, Wallet, WalletTransaction, AwayPeriod } from '@/types';
import { centsFromLegacy, rmToCents } from '@/lib/money';
import { bookingFromDoc, exceptionFromDoc, lessonLogFromDoc } from '@/lib/firestore-mappers';

export function useLocations(coachId: string | undefined) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const unsubscribe = onSnapshot(
      query(collection(firestore, 'coaches', coachId, 'locations'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const locs: Location[] = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          address: d.data().address,
          notes: d.data().notes,
          createdAt: d.data().createdAt?.toDate() || new Date(),
        }));
        setLocations(locs);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [coachId]);

  return { locations, loading };
}

export function useBookings(coachId: string | undefined, statusFilter?: 'confirmed' | 'cancelled') {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const bookingsRef = collection(firestore, 'coaches', coachId, 'bookings');
    const q = statusFilter
      ? query(bookingsRef, where('status', '==', statusFilter), orderBy('createdAt', 'desc'))
      : query(bookingsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const books: Booking[] = snapshot.docs.map((d) => bookingFromDoc(d.id, d.data()));
      setBookings(books);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, statusFilter]);

  return { bookings, loading };
}


/**
 * One-off classes soft-cancelled for `date` (status 'cancelled', startDate ===
 * date). Feeds the dashboard's "Cancelled for this date" list so a cancelled
 * one-off can be undone. Equality-only filters, so Firestore serves it from
 * single-field indexes.
 */
export function useCancelledOneOffs(coachId: string | undefined, date: string) {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!coachId || !db) return;
    const firestore = db as Firestore;
    const q = query(
      collection(firestore, 'coaches', coachId, 'bookings'),
      where('status', '==', 'cancelled'),
      where('startDate', '==', date),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setBookings(snapshot.docs.map((d) => bookingFromDoc(d.id, d.data()))),
      (err) => console.error('useCancelledOneOffs', err),
    );
    return () => unsubscribe();
  }, [coachId, date]);

  return { cancelledOneOffs: bookings };
}


export function useStudents(coachId: string | undefined) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const unsubscribe = onSnapshot(
      query(collection(firestore, 'coaches', coachId, 'students'), orderBy('clientName', 'asc')),
      (snapshot) => {
        const items: Student[] = snapshot.docs.map((d) => ({
          id: d.id,
          clientName: d.data().clientName,
          clientPhone: d.data().clientPhone,
          notes: d.data().notes ?? '',
          createdAt: d.data().createdAt?.toDate() || new Date(),
          updatedAt: d.data().updatedAt?.toDate() || new Date(),
        }));
        setStudents(items);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [coachId]);

  return { students, loading };
}

export function useLessonLogs(coachId: string | undefined, dateFilter?: string, studentIdFilter?: string, monthsBack?: number, limitCount?: number) {
  const [lessonLogs, setLessonLogs] = useState<LessonLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync stale state during render when filter changes. Without this, the first
  // render after a date change still has the previous date's logs (and shows
  // recurring classes briefly as "not done"). React's recommended pattern for
  // resetting state on prop change.
  const filterKey = `${coachId ?? ''}|${dateFilter ?? ''}|${studentIdFilter ?? ''}|${monthsBack ?? ''}|${limitCount ?? ''}`;
  const [trackedFilter, setTrackedFilter] = useState(filterKey);
  if (trackedFilter !== filterKey) {
    setTrackedFilter(filterKey);
    setLessonLogs([]);
    setLoading(true);
  }

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const col = collection(firestore, 'coaches', coachId, 'lessonLogs');
    let q;

    if (dateFilter) {
      q = query(col, where('date', '==', dateFilter));
    } else if (studentIdFilter) {
      q = limitCount
        ? query(col, where('studentId', '==', studentIdFilter), orderBy('date', 'desc'), limit(limitCount))
        : query(col, where('studentId', '==', studentIdFilter), orderBy('date', 'desc'));
    } else if (monthsBack) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsBack);
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-01`;
      q = query(col, where('date', '>=', cutoffStr), orderBy('date', 'desc'));
    } else {
      q = query(col, orderBy('date', 'desc'));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: LessonLog[] = snapshot.docs.map((d) => lessonLogFromDoc(d.id, d.data()));
        setLessonLogs(items);
        setLoading(false);
      },
      (error) => {
        // Without this handler, a missing composite index or rules error
        // leaves the UI stuck on a spinner forever.
        console.error('[useLessonLogs] snapshot error:', error);
        setLessonLogs([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [coachId, dateFilter, studentIdFilter, monthsBack, limitCount]);

  return { lessonLogs, loading };
}

export function useClassExceptions(coachId: string | undefined, referenceDate?: string) {
  const [classExceptions, setClassExceptions] = useState<ClassException[]>([]);
  const [loading, setLoading] = useState(true);

  // Build a 4-month window around the reference date (2 months each direction)
  const dateWindow = useMemo(() => {
    const ref = referenceDate ? new Date(referenceDate + 'T00:00:00') : new Date();
    const from = new Date(ref);
    from.setMonth(from.getMonth() - 2);
    const to = new Date(ref);
    to.setMonth(to.getMonth() + 2);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
      to: `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
    };
  }, [referenceDate]);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const q = query(
      collection(firestore, 'coaches', coachId, 'classExceptions'),
      where('originalDate', '>=', dateWindow.from),
      where('originalDate', '<=', dateWindow.to)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: ClassException[] = snapshot.docs.map((d) => exceptionFromDoc(d.id, d.data()));
      setClassExceptions(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, dateWindow]);

  return { classExceptions, loading };
}


export function useWallets(coachId: string | undefined) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const q = query(
      collection(firestore, 'coaches', coachId, 'wallets'),
      orderBy('name', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Wallet[] = snapshot.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        balanceCents: centsFromLegacy(d.data().balanceCents, d.data().balance),
        studentIds: d.data().studentIds ?? [],
        archived: d.data().archived ?? false,
        tabMode: d.data().tabMode ?? false,
        portalToken: d.data().portalToken ?? undefined,
        usualTopUpCents:
          d.data().usualTopUpCents ??
          (typeof d.data().usualTopUp === 'number'
            ? rmToCents(d.data().usualTopUp)
            : undefined),
        createdAt: d.data().createdAt?.toDate() || new Date(),
        updatedAt: d.data().updatedAt?.toDate() || new Date(),
      }));
      setWallets(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId]);

  return { wallets, loading };
}

export function useWalletTransactions(coachId: string | undefined, walletId: string | undefined, limitCount?: number) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Render-time sync so the first render after a wallet/limit change doesn't
  // briefly show the previous wallet's transactions.
  const filterKey = `${coachId ?? ''}|${walletId ?? ''}|${limitCount ?? ''}`;
  const [trackedFilter, setTrackedFilter] = useState(filterKey);
  if (trackedFilter !== filterKey) {
    setTrackedFilter(filterKey);
    setTransactions([]);
    setLoading(true);
  }

  useEffect(() => {
    if (!coachId || !walletId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const col = collection(firestore, 'coaches', coachId, 'wallets', walletId, 'transactions');
    const q = limitCount
      ? query(col, orderBy('createdAt', 'desc'), limit(limitCount))
      : query(col, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: WalletTransaction[] = snapshot.docs.map((d) => ({
        id: d.id,
        type: d.data().type,
        amountCents: centsFromLegacy(d.data().amountCents, d.data().amount),
        balanceAfterCents: centsFromLegacy(
          d.data().balanceAfterCents,
          d.data().balanceAfter,
        ),
        description: d.data().description ?? '',
        studentId: d.data().studentId ?? undefined,
        lessonLogId: d.data().lessonLogId ?? undefined,
        date: d.data().date,
        createdAt: d.data().createdAt?.toDate() || new Date(),
      }));
      setTransactions(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, walletId, limitCount]);

  return { transactions, loading };
}

export function useAwayPeriods(coachId: string | undefined, referenceDate?: string) {
  const [awayPeriods, setAwayPeriods] = useState<AwayPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  // Build a 4-month window around the reference date (2 months each direction).
  // Periods whose endDate < window.from or startDate > window.to are excluded.
  const dateWindow = useMemo(() => {
    const ref = referenceDate ? new Date(referenceDate + 'T00:00:00') : new Date();
    const from = new Date(ref);
    from.setMonth(from.getMonth() - 2);
    const to = new Date(ref);
    to.setMonth(to.getMonth() + 2);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
      to: `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
    };
  }, [referenceDate]);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    // Filter by startDate <= window.to. We can't add endDate >= window.from in
    // the same query (Firestore allows range filters on only one field), so we
    // post-filter on the client.
    const q = query(
      collection(firestore, 'coaches', coachId, 'awayPeriods'),
      where('startDate', '<=', dateWindow.to),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: AwayPeriod[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          startDate: d.data().startDate,
          endDate: d.data().endDate,
          label: d.data().label,
          createdAt: d.data().createdAt?.toDate() || new Date(),
          updatedAt: d.data().updatedAt?.toDate() || new Date(),
        }))
        .filter((p) => p.endDate >= dateWindow.from);
      // Sort by startDate ascending — settings list will reverse for display.
      items.sort((a, b) => a.startDate.localeCompare(b.startDate));
      setAwayPeriods(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, dateWindow]);

  return { awayPeriods, loading };
}

/**
 * Loads ALL away periods (no date window). Used by Settings → Time off so the
 * coach can see their full history. Small dataset (a few per year) — fine.
 */
export function useAllAwayPeriods(coachId: string | undefined) {
  const [awayPeriods, setAwayPeriods] = useState<AwayPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }
    const firestore = db as Firestore;
    const unsubscribe = onSnapshot(
      query(collection(firestore, 'coaches', coachId, 'awayPeriods')),
      (snapshot) => {
        const items: AwayPeriod[] = snapshot.docs.map((d) => ({
          id: d.id,
          startDate: d.data().startDate,
          endDate: d.data().endDate,
          label: d.data().label,
          createdAt: d.data().createdAt?.toDate() || new Date(),
          updatedAt: d.data().updatedAt?.toDate() || new Date(),
        }));
        items.sort((a, b) => b.startDate.localeCompare(a.startDate));
        setAwayPeriods(items);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [coachId]);

  return { awayPeriods, loading };
}

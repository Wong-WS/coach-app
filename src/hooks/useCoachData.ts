'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking, Location, Student, LessonLog, ClassException, Wallet, WalletTransaction } from '@/types';

export function useLocations(coachId: string | undefined) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
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
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const bookingsRef = collection(firestore, 'coaches', coachId, 'bookings');
    const q = statusFilter
      ? query(bookingsRef, where('status', '==', statusFilter), orderBy('createdAt', 'desc'))
      : query(bookingsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const books: Booking[] = snapshot.docs.map((d) => ({
        id: d.id,
        locationId: d.data().locationId,
        locationName: d.data().locationName,
        dayOfWeek: d.data().dayOfWeek,
        startTime: d.data().startTime,
        endTime: d.data().endTime,
        status: d.data().status,
        clientName: d.data().clientName,
        clientPhone: d.data().clientPhone,
        lessonType: d.data().lessonType,
        groupSize: d.data().groupSize,
        notes: d.data().notes,
        price: d.data().price,
        linkedStudentIds: d.data().linkedStudentIds ?? undefined,
        studentPrices: d.data().studentPrices ?? undefined,
        walletId: d.data().walletId ?? undefined,
        studentWallets: d.data().studentWallets ?? undefined,
        startDate: d.data().startDate ?? undefined,
        endDate: d.data().endDate ?? undefined,
        createdAt: d.data().createdAt?.toDate() || new Date(),
        cancelledAt: d.data().cancelledAt?.toDate(),
      }));
      setBookings(books);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, statusFilter]);

  return { bookings, loading };
}


export function useStudents(coachId: string | undefined) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
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

  useEffect(() => {
    if (!coachId || !db) {
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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: LessonLog[] = snapshot.docs.map((d) => ({
        id: d.id,
        date: d.data().date,
        bookingId: d.data().bookingId,
        studentId: d.data().studentId,
        studentName: d.data().studentName,
        locationName: d.data().locationName,
        startTime: d.data().startTime,
        endTime: d.data().endTime,
        price: d.data().price ?? 0,
        note: d.data().note ?? undefined,
        paySeparately: d.data().paySeparately ?? false,
        createdAt: d.data().createdAt?.toDate() || new Date(),
      }));
      setLessonLogs(items);
      setLoading(false);
    });

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
      const items: ClassException[] = snapshot.docs.map((d) => ({
        id: d.id,
        bookingId: d.data().bookingId,
        originalDate: d.data().originalDate,
        type: d.data().type,
        newDate: d.data().newDate,
        newStartTime: d.data().newStartTime,
        newEndTime: d.data().newEndTime,
        newLocationId: d.data().newLocationId,
        newLocationName: d.data().newLocationName,
        newPrice: d.data().newPrice,
        newNote: d.data().newNote,
        createdAt: d.data().createdAt?.toDate() || new Date(),
      }));
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
        balance: d.data().balance ?? 0,
        studentIds: d.data().studentIds ?? [],
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

  useEffect(() => {
    if (!coachId || !walletId || !db) {
      setTransactions([]);
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
        amount: d.data().amount ?? 0,
        balanceAfter: d.data().balanceAfter ?? 0,
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

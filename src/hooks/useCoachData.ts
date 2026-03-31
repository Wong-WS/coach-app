'use client';

import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, limit, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking, Location, WorkingHours, DayOfWeek, WaitlistEntry, WaitlistStatus, Student, LessonLog, ClassException, Payment } from '@/types';

export function useWorkingHours(coachId: string | undefined) {
  const [workingHours, setWorkingHours] = useState<WorkingHours[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const unsubscribe = onSnapshot(
      collection(firestore, 'coaches', coachId, 'workingHours'),
      (snapshot) => {
        const hours: WorkingHours[] = snapshot.docs.map((d) => {
          const data = d.data();
          // Backward compat: migrate old { startTime, endTime } format
          const timeRanges = data.timeRanges
            ?? (data.startTime ? [{ startTime: data.startTime, endTime: data.endTime }] : [{ startTime: '09:00', endTime: '17:00' }]);
          return {
            day: d.id as DayOfWeek,
            enabled: data.enabled,
            timeRanges,
          };
        });
        setWorkingHours(hours);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [coachId]);

  return { workingHours, loading };
}

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

export function useWaitlist(coachId: string | undefined, statusFilter?: WaitlistStatus) {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const waitlistRef = collection(firestore, 'coaches', coachId, 'waitlist');
    const q = statusFilter
      ? query(waitlistRef, where('status', '==', statusFilter), orderBy('createdAt', 'desc'))
      : query(waitlistRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: WaitlistEntry[] = snapshot.docs.map((d) => ({
        id: d.id,
        locationId: d.data().locationId,
        locationName: d.data().locationName,
        dayOfWeek: d.data().dayOfWeek,
        preferredTime: d.data().preferredTime,
        clientName: d.data().clientName,
        clientPhone: d.data().clientPhone,
        notes: d.data().notes,
        status: d.data().status,
        createdAt: d.data().createdAt?.toDate() || new Date(),
        contactedAt: d.data().contactedAt?.toDate(),
        bookedAt: d.data().bookedAt?.toDate(),
      }));
      setWaitlist(entries);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, statusFilter]);

  return { waitlist, loading };
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
          linkToken: d.data().linkToken,
          prepaidTotal: d.data().prepaidTotal ?? 0,
          prepaidUsed: d.data().prepaidUsed ?? 0,
          credit: d.data().credit ?? 0,
          pendingPayment: d.data().pendingPayment ?? 0,
          payPerLesson: d.data().payPerLesson ?? false,
          linkedToStudentId: d.data().linkedToStudentId ?? undefined,
          nextPrepaidTotal: d.data().nextPrepaidTotal ?? undefined,
          nextPrepaidPaidAt: d.data().nextPrepaidPaidAt?.toDate() ?? undefined,
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

export function useLessonLogs(coachId: string | undefined, dateFilter?: string, studentIdFilter?: string, monthsBack?: number) {
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
      q = query(col, where('studentId', '==', studentIdFilter), orderBy('date', 'desc'));
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
        createdAt: d.data().createdAt?.toDate() || new Date(),
      }));
      setLessonLogs(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, dateFilter, studentIdFilter, monthsBack]);

  return { lessonLogs, loading };
}

export function useClassExceptions(coachId: string | undefined) {
  const [classExceptions, setClassExceptions] = useState<ClassException[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const unsubscribe = onSnapshot(
      collection(firestore, 'coaches', coachId, 'classExceptions'),
      (snapshot) => {
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
          createdAt: d.data().createdAt?.toDate() || new Date(),
        }));
        setClassExceptions(items);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [coachId]);

  return { classExceptions, loading };
}

export function usePayments(coachId: string | undefined, limitCount?: number) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const col = collection(firestore, 'coaches', coachId, 'payments');
    const q = limitCount
      ? query(col, orderBy('collectedAt', 'desc'), limit(limitCount))
      : query(col, orderBy('collectedAt', 'desc'));
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const items: Payment[] = snapshot.docs.map((d) => ({
          id: d.id,
          studentId: d.data().studentId,
          studentName: d.data().studentName,
          amount: d.data().amount ?? 0,
          collectedAt: d.data().collectedAt?.toDate() || new Date(),
          createdAt: d.data().createdAt?.toDate() || new Date(),
        }));
        setPayments(items);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [coachId, limitCount]);

  return { payments, loading };
}

// Hook for public page - fetches coach by slug
export function useCoachBySlug(slug: string) {
  const [coach, setCoach] = useState<{
    id: string;
    displayName: string;
    serviceType: string;
    whatsappNumber: string;
    lessonDurationMinutes: number;
    travelBufferMinutes: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setError('Firebase not initialized');
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const slugDocRef = doc(firestore, 'coachSlugs', slug);

    let unsubscribeCoach: (() => void) | null = null;

    const unsubscribeSlug = onSnapshot(slugDocRef, (slugDoc) => {
      // Clean up previous inner listener before creating a new one
      if (unsubscribeCoach) {
        unsubscribeCoach();
        unsubscribeCoach = null;
      }

      if (!slugDoc.exists()) {
        setError('Coach not found');
        setLoading(false);
        return;
      }

      const coachId = slugDoc.data().coachId;
      const coachDocRef = doc(firestore, 'coaches', coachId);

      unsubscribeCoach = onSnapshot(coachDocRef, (coachDoc) => {
        if (!coachDoc.exists()) {
          setError('Coach profile not found');
          setLoading(false);
          return;
        }

        const data = coachDoc.data();
        setCoach({
          id: coachDoc.id,
          displayName: data.displayName,
          serviceType: data.serviceType,
          whatsappNumber: data.whatsappNumber,
          lessonDurationMinutes: data.lessonDurationMinutes,
          travelBufferMinutes: data.travelBufferMinutes,
        });
        setLoading(false);
      });
    });

    return () => {
      unsubscribeSlug();
      if (unsubscribeCoach) {
        unsubscribeCoach();
      }
    };
  }, [slug]);

  return { coach, loading, error };
}

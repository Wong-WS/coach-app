'use client';

import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking, Location, WorkingHours, DayOfWeek, WaitlistEntry, WaitlistStatus } from '@/types';

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
        const hours: WorkingHours[] = snapshot.docs.map((d) => ({
          day: d.id as DayOfWeek,
          enabled: d.data().enabled,
          startTime: d.data().startTime,
          endTime: d.data().endTime,
        }));
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

    const unsubscribeSlug = onSnapshot(slugDocRef, (slugDoc) => {
      if (!slugDoc.exists()) {
        setError('Coach not found');
        setLoading(false);
        return;
      }

      const coachId = slugDoc.data().coachId;
      const coachDocRef = doc(firestore, 'coaches', coachId);

      onSnapshot(coachDocRef, (coachDoc) => {
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

    return () => unsubscribeSlug();
  }, [slug]);

  return { coach, loading, error };
}

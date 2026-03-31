import { notFound } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import { calculateAvailability } from '@/lib/availability-engine';
import { Booking, DayOfWeek, WorkingHours, Location } from '@/types';
import PublicCoachClient from './PublicCoachClient';

export default async function PublicCoachPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getAdminDb();

  // Look up coachId from slug
  const slugDoc = await db.collection('coachSlugs').doc(slug).get();
  if (!slugDoc.exists) {
    notFound();
  }
  const coachId = slugDoc.data()!.coachId;

  // Fetch coach profile, locations, working hours, and bookings in parallel
  const [coachDoc, locationsSnapshot, hoursSnapshot, bookingsSnapshot] = await Promise.all([
    db.collection('coaches').doc(coachId).get(),
    db.collection('coaches').doc(coachId).collection('locations').get(),
    db.collection('coaches').doc(coachId).collection('workingHours').get(),
    db.collection('coaches').doc(coachId).collection('bookings').where('status', '==', 'confirmed').get(),
  ]);

  if (!coachDoc.exists) {
    notFound();
  }

  const coachData = coachDoc.data()!;

  const locations: Location[] = locationsSnapshot.docs.map((doc) => ({
    id: doc.id,
    name: doc.data().name,
    address: doc.data().address || '',
    notes: doc.data().notes || '',
    createdAt: new Date(),
  }));

  // Calculate initial availability for first location
  const initialLocationId = locations.length > 0 ? locations[0].id : '';

  const workingHours: WorkingHours[] = hoursSnapshot.docs.map((doc) => {
    const data = doc.data();
    const timeRanges = data.timeRanges
      ?? (data.startTime ? [{ startTime: data.startTime, endTime: data.endTime }] : [{ startTime: '09:00', endTime: '17:00' }]);
    return {
      day: doc.id as DayOfWeek,
      enabled: data.enabled,
      timeRanges,
    };
  });

  const confirmedBookings: Booking[] = bookingsSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      locationId: data.locationId,
      locationName: '',
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status,
      clientName: '',
      clientPhone: '',
      lessonType: 'private' as const,
      groupSize: 0,
      notes: '',
      createdAt: new Date(),
    };
  });

  const initialAvailability = calculateAvailability({
    workingHours,
    lessonDurationMinutes: coachData.lessonDurationMinutes ?? 60,
    travelBufferMinutes: coachData.travelBufferMinutes ?? 0,
    confirmedBookings,
    clientLocationId: initialLocationId,
  });

  return (
    <PublicCoachClient
      coach={{
        id: coachId,
        displayName: coachData.displayName,
        serviceType: coachData.serviceType,
        whatsappNumber: coachData.whatsappNumber,
        lessonDurationMinutes: coachData.lessonDurationMinutes ?? 60,
      }}
      locations={locations}
      initialAvailability={initialAvailability}
      initialLocationId={initialLocationId}
    />
  );
}

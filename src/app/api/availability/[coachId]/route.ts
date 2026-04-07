import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { calculateAvailability } from '@/lib/availability-engine';
import { Booking, DayOfWeek, WorkingHours } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ coachId: string }> }
) {
  const { coachId } = await params;
  const locationId = request.nextUrl.searchParams.get('locationId') || '';

  const db = getAdminDb();

  // Fetch coach settings, working hours, and bookings in parallel
  const [coachDoc, hoursSnapshot, bookingsSnapshot] = await Promise.all([
    db.collection('coaches').doc(coachId).get(),
    db.collection('coaches').doc(coachId).collection('workingHours').get(),
    db.collection('coaches').doc(coachId).collection('bookings')
      .where('status', '==', 'confirmed')
      .get(),
  ]);

  if (!coachDoc.exists) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }
  const coachData = coachDoc.data()!;
  const lessonDurationMinutes = coachData.lessonDurationMinutes ?? 60;
  const travelBufferMinutes = coachData.travelBufferMinutes ?? 0;

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

  // Only include recurring bookings (no endDate) for public availability
  const confirmedBookings: Booking[] = bookingsSnapshot.docs
    .filter((doc) => !doc.data().endDate)
    .map((doc) => {
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

  const availability = calculateAvailability({
    workingHours,
    lessonDurationMinutes,
    travelBufferMinutes,
    confirmedBookings,
    clientLocationId: locationId,
  });

  return NextResponse.json({ availability }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}

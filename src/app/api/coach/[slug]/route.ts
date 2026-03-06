import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = getAdminDb();

  // Look up coachId from slug
  const slugDoc = await db.collection('coachSlugs').doc(slug).get();
  if (!slugDoc.exists) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }
  const coachId = slugDoc.data()!.coachId;

  // Fetch coach profile
  const coachDoc = await db.collection('coaches').doc(coachId).get();
  if (!coachDoc.exists) {
    return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 });
  }
  const coachData = coachDoc.data()!;

  // Fetch locations
  const locationsSnapshot = await db.collection('coaches').doc(coachId).collection('locations').get();
  const locations = locationsSnapshot.docs.map((doc) => ({
    id: doc.id,
    name: doc.data().name,
    address: doc.data().address || '',
    notes: doc.data().notes || '',
  }));

  return NextResponse.json({
    coachId,
    coach: {
      displayName: coachData.displayName,
      slug: coachData.slug,
      serviceType: coachData.serviceType,
      lessonDurationMinutes: coachData.lessonDurationMinutes,
      travelBufferMinutes: coachData.travelBufferMinutes,
      whatsappNumber: coachData.whatsappNumber,
      // email intentionally omitted
    },
    locations,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { coachId, locationId, locationName, dayOfWeek, preferredTime, clientName, clientPhone, notes } = body;

    if (!coachId || !locationId || !clientName || !clientPhone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify the coach exists
    const coachDoc = await db.collection('coaches').doc(coachId).get();
    if (!coachDoc.exists) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    const docRef = await db.collection('coaches').doc(coachId).collection('waitlist').add({
      locationId,
      locationName: locationName || '',
      dayOfWeek: dayOfWeek || 'monday',
      preferredTime: preferredTime || 'any',
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      notes: (notes || '').trim(),
      status: 'waiting',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: docRef.id });
  } catch (error) {
    console.error('Error adding to waitlist:', error);
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
  }
}

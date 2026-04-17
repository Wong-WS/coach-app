import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const db = getAdminDb();

    const tokenDoc = await db.collection('studentTokens').doc(token).get();
    if (!tokenDoc.exists) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const { coachId, studentId } = tokenDoc.data()!;

    const studentDoc = await db
      .collection('coaches')
      .doc(coachId)
      .collection('students')
      .doc(studentId)
      .get();
    if (!studentDoc.exists) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const student = studentDoc.data()!;

    const coachDoc = await db.collection('coaches').doc(coachId).get();
    const coach = coachDoc.exists ? coachDoc.data()! : null;

    const walletSnap = await db
      .collection('coaches')
      .doc(coachId)
      .collection('wallets')
      .where('studentIds', 'array-contains', studentId)
      .limit(1)
      .get();
    const walletBalance = walletSnap.empty ? null : (walletSnap.docs[0].data().balance ?? 0);

    const logsSnapshot = await db
      .collection('coaches')
      .doc(coachId)
      .collection('lessonLogs')
      .where('studentId', '==', studentId)
      .limit(100)
      .get();

    const lessons = logsSnapshot.docs
      .map((doc) => ({
        date: doc.data().date,
        startTime: doc.data().startTime,
        endTime: doc.data().endTime,
        locationName: doc.data().locationName,
        note: doc.data().note || undefined,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      studentName: student.clientName,
      walletBalance,
      coachName: coach?.displayName ?? 'Coach',
      serviceType: coach?.serviceType ?? '',
      lessons,
    });
  } catch (error) {
    console.error('Student portal API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

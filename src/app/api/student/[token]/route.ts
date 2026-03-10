import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const db = getAdminDb();

  // Look up token
  const tokenDoc = await db.collection('studentTokens').doc(token).get();
  if (!tokenDoc.exists) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const { coachId, studentId } = tokenDoc.data()!;

  // Fetch student
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

  // Fetch coach
  const coachDoc = await db.collection('coaches').doc(coachId).get();
  const coach = coachDoc.exists ? coachDoc.data()! : null;

  // Fetch lesson logs for this student
  const logsSnapshot = await db
    .collection('coaches')
    .doc(coachId)
    .collection('lessonLogs')
    .where('studentId', '==', studentId)
    .orderBy('date', 'desc')
    .limit(100)
    .get();

  const lessons = logsSnapshot.docs.map((doc) => ({
    date: doc.data().date,
    startTime: doc.data().startTime,
    endTime: doc.data().endTime,
    locationName: doc.data().locationName,
  }));

  return NextResponse.json({
    studentName: student.clientName,
    prepaidTotal: student.prepaidTotal ?? 0,
    prepaidUsed: student.prepaidUsed ?? 0,
    coachName: coach?.displayName ?? 'Coach',
    serviceType: coach?.serviceType ?? '',
    lessons,
  });
}

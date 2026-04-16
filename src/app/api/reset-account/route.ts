import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

async function deleteCollection(db: FirebaseFirestore.Firestore, path: string) {
  const snap = await db.collection(path).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

export async function POST(req: NextRequest) {
  const { coachId } = await req.json();
  if (!coachId) return NextResponse.json({ error: 'coachId required' }, { status: 400 });

  const db = getAdminDb();
  const base = `coaches/${coachId}`;

  // Delete wallet transactions first (nested subcollection)
  const walletsSnap = await db.collection(`${base}/wallets`).get();
  for (const walletDoc of walletsSnap.docs) {
    await deleteCollection(db, `${base}/wallets/${walletDoc.id}/transactions`);
  }

  // Delete all subcollections
  const collections = ['wallets', 'students', 'bookings', 'lessonLogs', 'classExceptions', 'payments', 'locations'];
  const deleted: Record<string, number> = {};
  for (const col of collections) {
    deleted[col] = await deleteCollection(db, `${base}/${col}`);
  }

  // Delete student tokens for this coach
  const tokensSnap = await db.collection('studentTokens').where('coachId', '==', coachId).get();
  if (!tokensSnap.empty) {
    const batch = db.batch();
    tokensSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted['studentTokens'] = tokensSnap.size;
  }

  return NextResponse.json({ deleted });
}

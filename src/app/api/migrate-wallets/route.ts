import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  const { coachId } = await req.json();
  if (!coachId) return NextResponse.json({ error: 'coachId required' }, { status: 400 });

  const db = getAdminDb();
  const studentsSnap = await db.collection(`coaches/${coachId}/students`).get();
  const walletsCreated: string[] = [];
  let studentsProcessed = 0;

  for (const studentDoc of studentsSnap.docs) {
    const student = studentDoc.data();
    const studentId = studentDoc.id;

    // Skip if student already has a wallet
    const existingWallets = await db.collection(`coaches/${coachId}/wallets`)
      .where('studentIds', 'array-contains', studentId).get();
    if (!existingWallets.empty) continue;

    // Check if this is a linked student → merge into primary's wallet
    if (student.linkedToStudentId) {
      const primaryWallets = await db.collection(`coaches/${coachId}/wallets`)
        .where('studentIds', 'array-contains', student.linkedToStudentId).get();
      if (!primaryWallets.empty) {
        const primaryWallet = primaryWallets.docs[0];
        const currentStudentIds = primaryWallet.data().studentIds || [];
        if (!currentStudentIds.includes(studentId)) {
          await primaryWallet.ref.update({
            studentIds: [...currentStudentIds, studentId],
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        studentsProcessed++;
        continue;
      }
    }

    // Calculate wallet balance from current student state
    let balance = 0;
    if (student.useMonetaryBalance) {
      balance = student.monetaryBalance ?? 0;
    } else if ((student.prepaidTotal ?? 0) > 0) {
      const rate = student.lessonRate ?? 0;
      const remaining = (student.prepaidTotal ?? 0) - (student.prepaidUsed ?? 0);
      balance = remaining * rate - (student.pendingPayment ?? 0) + (student.credit ?? 0);
    } else if (student.payPerLesson) {
      balance = -(student.pendingPayment ?? 0);
    }

    // Create wallet
    const walletRef = await db.collection(`coaches/${coachId}/wallets`).add({
      name: student.clientName,
      balance,
      studentIds: [studentId],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create migration transaction
    if (balance !== 0) {
      await db.collection(`coaches/${coachId}/wallets/${walletRef.id}/transactions`).add({
        type: balance >= 0 ? 'top-up' : 'adjustment',
        amount: balance,
        balanceAfter: balance,
        description: 'Migrated from previous system',
        studentId,
        date: new Date().toISOString().split('T')[0],
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    walletsCreated.push(walletRef.id);
    studentsProcessed++;
  }

  return NextResponse.json({
    walletsCreated: walletsCreated.length,
    studentsProcessed,
  });
}

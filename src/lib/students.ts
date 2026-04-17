import { collection, query, where, getDocs, addDoc, doc, setDoc, serverTimestamp, Firestore } from 'firebase/firestore';

export async function findOrCreateStudent(
  db: Firestore,
  coachId: string,
  clientName: string,
  clientPhone: string
): Promise<string> {
  const studentsRef = collection(db, 'coaches', coachId, 'students');
  const q = query(
    studentsRef,
    where('clientName', '==', clientName),
    where('clientPhone', '==', clientPhone)
  );
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  const linkToken = crypto.randomUUID();
  const studentDoc = await addDoc(studentsRef, {
    clientName,
    clientPhone,
    linkToken,
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Write top-level token lookup doc
  await setDoc(doc(db, 'studentTokens', linkToken), {
    coachId,
    studentId: studentDoc.id,
  });

  return studentDoc.id;
}

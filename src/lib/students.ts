import { collection, addDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import type { Student } from '@/types';

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Existing students whose name matches `name` (case/whitespace-insensitive).
// Drives the "you already have a Sunny" warning in Add Lesson — phone is
// deliberately ignored so a blank or mistyped phone still surfaces the match.
export function findStudentsWithSameName(students: Student[], name: string): Student[] {
  const target = normalizeName(name);
  if (!target) return [];
  return students.filter((s) => normalizeName(s.clientName) === target);
}

export async function createStudent(
  db: Firestore,
  coachId: string,
  clientName: string,
  clientPhone: string
): Promise<string> {
  const studentDoc = await addDoc(collection(db, 'coaches', coachId, 'students'), {
    clientName,
    clientPhone,
    notes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return studentDoc.id;
}

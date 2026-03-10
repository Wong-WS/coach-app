'use client';

import { useState, useMemo } from 'react';
import { doc, updateDoc, serverTimestamp, increment, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useStudents, useLessonLogs } from '@/hooks/useCoachData';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Student, LessonLog } from '@/types';
import { formatTimeDisplay } from '@/lib/availability-engine';

export default function StudentsPage() {
  const { coach } = useAuth();
  const { students, loading } = useStudents(coach?.id);
  const { lessonLogs: allLogs } = useLessonLogs(coach?.id);
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Count lessons per student
  const lessonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of allLogs) {
      counts[log.studentId] = (counts[log.studentId] || 0) + 1;
    }
    return counts;
  }, [allLogs]);

  // Student's lesson history
  const studentLogs = useMemo(() => {
    if (!selectedStudent) return [];
    return allLogs
      .filter((l) => l.studentId === selectedStudent.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allLogs, selectedStudent]);

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) =>
        s.clientName.toLowerCase().includes(q) ||
        s.clientPhone.toLowerCase().includes(q)
    );
  }, [students, search]);

  const openDetail = (student: Student) => {
    setSelectedStudent(student);
    setEditName(student.clientName);
    setEditPhone(student.clientPhone);
    setEditNotes(student.notes);
  };

  const handleSave = async () => {
    if (!coach || !db || !selectedStudent) return;
    setSaving(true);
    try {
      await updateDoc(
        doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
        {
          clientName: editName.trim(),
          clientPhone: editPhone.trim(),
          notes: editNotes.trim(),
          updatedAt: serverTimestamp(),
        }
      );
      showToast('Student updated!', 'success');
      setSelectedStudent(null);
    } catch (error) {
      console.error('Error updating student:', error);
      showToast('Failed to update student', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addPrepaid = async (amount: number) => {
    if (!coach || !db || !selectedStudent) return;
    try {
      await updateDoc(
        doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
        {
          prepaidTotal: increment(amount),
          updatedAt: serverTimestamp(),
        }
      );
      // Refresh selected student locally
      setSelectedStudent((prev) =>
        prev ? { ...prev, prepaidTotal: prev.prepaidTotal + amount } : null
      );
      showToast(`Added ${amount} prepaid lessons!`, 'success');
    } catch (error) {
      console.error('Error adding prepaid:', error);
      showToast('Failed to add prepaid lessons', 'error');
    }
  };

  const copyPortalLink = async () => {
    if (!selectedStudent) return;
    const url = `${window.location.origin}/student/${selectedStudent.linkToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Portal link copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy link', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const remaining = selectedStudent
    ? selectedStudent.prepaidTotal - selectedStudent.prepaidUsed
    : 0;
  const needsRenewal =
    selectedStudent &&
    selectedStudent.prepaidTotal > 0 &&
    selectedStudent.prepaidUsed >= selectedStudent.prepaidTotal;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Students</h1>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">
          {students.length} student{students.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search */}
      <Input
        id="search"
        placeholder="Search by name or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Student cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
          {students.length === 0
            ? 'No students yet. Students are created automatically when you add bookings or mark classes as done.'
            : 'No students match your search.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((student) => {
            const count = lessonCounts[student.id] || 0;
            const hasPrepaid = student.prepaidTotal > 0;
            const prepaidRemaining = student.prepaidTotal - student.prepaidUsed;
            const expired = hasPrepaid && prepaidRemaining <= 0;

            return (
              <button
                key={student.id}
                onClick={() => openDetail(student)}
                className="text-left bg-white dark:bg-[#1f1f1f] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-[#333333] hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-zinc-100">
                      {student.clientName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
                      {student.clientPhone}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                      {count} lesson{count !== 1 ? 's' : ''}
                    </p>
                    {hasPrepaid ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                          expired
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}
                      >
                        {student.prepaidUsed}/{student.prepaidTotal}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-zinc-500 mt-1 inline-block">
                        No package
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Student detail modal */}
      <Modal
        isOpen={selectedStudent !== null}
        onClose={() => setSelectedStudent(null)}
        title="Student Details"
      >
        {selectedStudent && (
          <div className="space-y-6">
            {/* Editable fields */}
            <div className="space-y-4">
              <Input
                id="editName"
                label="Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <Input
                id="editPhone"
                label="Phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
              <div>
                <label htmlFor="editNotes" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Notes
                </label>
                <textarea
                  id="editNotes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
                />
              </div>
              <Button onClick={handleSave} loading={saving} size="sm">
                Save Changes
              </Button>
            </div>

            {/* Prepaid section */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
                Prepaid Package
              </h3>
              {selectedStudent.prepaidTotal > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-zinc-400">
                      {selectedStudent.prepaidUsed} of {selectedStudent.prepaidTotal} used
                    </span>
                    <span className={`font-medium ${remaining > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                      {remaining > 0 ? `${remaining} remaining` : 'Package used up'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-[#333333] rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full ${remaining > 0 ? 'bg-blue-600' : 'bg-red-500'}`}
                      style={{
                        width: `${Math.min(100, (selectedStudent.prepaidUsed / selectedStudent.prepaidTotal) * 100)}%`,
                      }}
                    />
                  </div>
                  {needsRenewal && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      Time to renew!
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-zinc-500">No prepaid package</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button variant="secondary" size="sm" onClick={() => addPrepaid(5)}>
                  + 5 Lessons
                </Button>
                <Button variant="secondary" size="sm" onClick={() => addPrepaid(10)}>
                  + 10 Lessons
                </Button>
              </div>
            </div>

            {/* Portal link */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Student Portal Link
              </h3>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-100 dark:bg-[#1a1a1a] px-2 py-1 rounded flex-1 truncate text-gray-600 dark:text-zinc-400">
                  /student/{selectedStudent.linkToken}
                </code>
                <Button variant="secondary" size="sm" onClick={copyPortalLink}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Lesson history */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
                Lesson History ({studentLogs.length})
              </h3>
              {studentLogs.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500">No lessons recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {studentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-[#1a1a1a]/50 rounded"
                    >
                      <div>
                        <p className="text-gray-900 dark:text-zinc-100">{log.date}</p>
                        <p className="text-xs text-gray-500 dark:text-zinc-400">
                          {formatTimeDisplay(log.startTime)} – {formatTimeDisplay(log.endTime)} &middot; {log.locationName}
                        </p>
                      </div>
                      {log.price > 0 && (
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          RM {log.price}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

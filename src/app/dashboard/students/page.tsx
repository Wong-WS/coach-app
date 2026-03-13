'use client';

import { useState, useMemo } from 'react';
import { collection, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useStudents, useLessonLogs, useLocations, useBookings } from '@/hooks/useCoachData';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Student, LessonLog, DayOfWeek } from '@/types';
import { formatTimeDisplay } from '@/lib/availability-engine';
import { findOrCreateStudent } from '@/lib/students';

export default function StudentsPage() {
  const { coach } = useAuth();
  const { students, loading } = useStudents(coach?.id);
  const { lessonLogs: allLogs } = useLessonLogs(coach?.id);
  const { locations } = useLocations(coach?.id);
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const { showToast } = useToast();

  const [syncing, setSyncing] = useState(false);

  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState<DayOfWeek | 'all'>('all');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Add Lesson form state
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonDate, setLessonDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [lessonLocationName, setLessonLocationName] = useState('');
  const [lessonStartTime, setLessonStartTime] = useState('09:00');
  const [lessonEndTime, setLessonEndTime] = useState('10:00');
  const [lessonPrice, setLessonPrice] = useState(0);
  const [lessonNote, setLessonNote] = useState('');
  const [addingLesson, setAddingLesson] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  // Editable prepaid state
  const [editingPrepaid, setEditingPrepaid] = useState(false);
  const [editPrepaidTotal, setEditPrepaidTotal] = useState(0);
  const [editPrepaidUsed, setEditPrepaidUsed] = useState(0);
  const [savingPrepaid, setSavingPrepaid] = useState(false);

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

  // Map students to their booking days, tracking earliest startTime and locationName per day
  const { dayToStudents, activeDays } = useMemo(() => {
    const dayMap = new Map<DayOfWeek, Map<string, { startTime: string; endTime: string; locationName: string }>>();

    for (const booking of bookings) {
      if (!booking.clientName) continue;
      const matched = students.find(
        (s) =>
          s.clientName === booking.clientName &&
          s.clientPhone === (booking.clientPhone || '')
      );
      if (!matched) continue;

      if (!dayMap.has(booking.dayOfWeek)) dayMap.set(booking.dayOfWeek, new Map());
      const dayStudents = dayMap.get(booking.dayOfWeek)!;
      const existing = dayStudents.get(matched.id);
      if (!existing || booking.startTime < existing.startTime) {
        dayStudents.set(matched.id, { startTime: booking.startTime, endTime: booking.endTime, locationName: booking.locationName });
      }
    }

    const allDays: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const active = allDays.filter((d) => dayMap.has(d));

    return { dayToStudents: dayMap, activeDays: active };
  }, [bookings, students]);

  const filtered = useMemo(() => {
    let result = students;

    if (dayFilter !== 'all') {
      const dayStudents = dayToStudents.get(dayFilter);
      result = dayStudents ? result.filter((s) => dayStudents.has(s.id)) : [];
      // Sort by earliest class time on this day
      result = [...result].sort((a, b) => {
        const aTime = dayStudents?.get(a.id)?.startTime || '';
        const bTime = dayStudents?.get(b.id)?.startTime || '';
        return aTime.localeCompare(bTime);
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.clientName.toLowerCase().includes(q) ||
          s.clientPhone.toLowerCase().includes(q)
      );
    }

    return result;
  }, [students, search, dayFilter, dayToStudents]);

  const openDetail = (student: Student) => {
    setSelectedStudent(student);
    setEditName(student.clientName);
    setEditPhone(student.clientPhone);
    setEditNotes(student.notes);
    setShowAddLesson(false);
    setEditingPrepaid(false);

    // Auto-fill lesson form from student's earliest booking
    const studentBooking = bookings.find(
      (b) => b.clientName === student.clientName && b.clientPhone === (student.clientPhone || '')
    );
    if (studentBooking) {
      setLessonLocationName(studentBooking.locationName);
      setLessonStartTime(studentBooking.startTime);
      setLessonEndTime(studentBooking.endTime);
      setLessonPrice(studentBooking.price || 0);
    } else {
      setLessonLocationName('');
      setLessonStartTime('09:00');
      setLessonEndTime('10:00');
      setLessonPrice(0);
    }

    // If no price from booking, use most recent lesson log price
    if (!studentBooking?.price) {
      const lastLog = allLogs
        .filter((l) => l.studentId === student.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (lastLog?.price) setLessonPrice(lastLog.price);
    }
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
    const packageFinished = selectedStudent.prepaidUsed >= selectedStudent.prepaidTotal && selectedStudent.prepaidTotal > 0;
    // Optimistic update — update UI immediately
    const prevStudent = { ...selectedStudent };
    setSelectedStudent((prev) =>
      prev
        ? {
            ...prev,
            prepaidTotal: packageFinished ? amount : prev.prepaidTotal + amount,
            prepaidUsed: packageFinished ? 0 : prev.prepaidUsed,
          }
        : null
    );
    showToast(`Added ${amount} prepaid lessons!`, 'success');
    try {
      const updateData: Record<string, unknown> = {
        prepaidTotal: packageFinished ? amount : increment(amount),
        updatedAt: serverTimestamp(),
      };
      if (packageFinished) {
        updateData.prepaidUsed = 0;
      }
      await updateDoc(
        doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
        updateData
      );
    } catch (error) {
      console.error('Error adding prepaid:', error);
      // Revert on failure
      setSelectedStudent(prevStudent);
      showToast('Failed to add prepaid lessons', 'error');
    }
  };

  const handleAddLesson = async () => {
    if (!coach || !db || !selectedStudent || !lessonLocationName) return;
    setAddingLesson(true);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);
      const logRef = doc(collection(firestore, 'coaches', coach.id, 'lessonLogs'));
      const logData: Record<string, unknown> = {
        date: lessonDate,
        studentId: selectedStudent.id,
        studentName: selectedStudent.clientName,
        locationName: lessonLocationName,
        startTime: lessonStartTime,
        endTime: lessonEndTime,
        price: lessonPrice,
        createdAt: serverTimestamp(),
      };
      if (lessonNote.trim()) {
        logData.note = lessonNote.trim();
      }
      batch.set(logRef, logData);
      const studentRef = doc(firestore, 'coaches', coach.id, 'students', selectedStudent.id);
      const updateData: Record<string, unknown> = {
        prepaidUsed: increment(1),
        updatedAt: serverTimestamp(),
      };

      // Pay-per-lesson: add price to pendingPayment
      if (selectedStudent.payPerLesson && lessonPrice > 0) {
        updateData.pendingPayment = increment(lessonPrice);
      }

      // Calculate credit: find booking price for this student and compare
      const studentBooking = bookings.find((b) => b.clientName === selectedStudent.clientName);
      const bookingPrice = studentBooking?.price ?? 0;
      const creditDiff = bookingPrice > 0 && lessonPrice < bookingPrice ? bookingPrice - lessonPrice : 0;
      if (creditDiff > 0) {
        updateData.credit = increment(creditDiff);
      }

      batch.update(studentRef, updateData);
      await batch.commit();
      // Update local state
      const pendingAdd = selectedStudent.payPerLesson ? lessonPrice : 0;
      setSelectedStudent((prev) =>
        prev ? { ...prev, prepaidUsed: prev.prepaidUsed + 1, credit: (prev.credit ?? 0) + creditDiff, pendingPayment: prev.pendingPayment + pendingAdd } : null
      );
      setShowAddLesson(false);
      setLessonNote('');
      setLessonPrice(bookingPrice || lessonPrice);
      showToast('Lesson added!', 'success');
    } catch (error) {
      console.error('Error adding lesson:', error);
      showToast('Failed to add lesson', 'error');
    } finally {
      setAddingLesson(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!coach || !db || !selectedStudent) return;
    setDeletingLogId(logId);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'coaches', coach.id, 'lessonLogs', logId));
      batch.update(doc(firestore, 'coaches', coach.id, 'students', selectedStudent.id), {
        prepaidUsed: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setSelectedStudent((prev) =>
        prev ? { ...prev, prepaidUsed: Math.max(0, prev.prepaidUsed - 1) } : null
      );
      showToast('Lesson deleted', 'success');
    } catch (error) {
      console.error('Error deleting lesson:', error);
      showToast('Failed to delete lesson', 'error');
    } finally {
      setDeletingLogId(null);
    }
  };

  const handleSavePrepaid = async () => {
    if (!coach || !db || !selectedStudent) return;
    setSavingPrepaid(true);
    try {
      await updateDoc(
        doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
        {
          prepaidTotal: editPrepaidTotal,
          prepaidUsed: editPrepaidUsed,
          updatedAt: serverTimestamp(),
        }
      );
      setSelectedStudent((prev) =>
        prev ? { ...prev, prepaidTotal: editPrepaidTotal, prepaidUsed: editPrepaidUsed } : null
      );
      setEditingPrepaid(false);
      showToast('Prepaid package updated!', 'success');
    } catch (error) {
      console.error('Error updating prepaid:', error);
      showToast('Failed to update prepaid', 'error');
    } finally {
      setSavingPrepaid(false);
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

  const handleSyncStudents = async () => {
    if (!coach || !db) return;
    setSyncing(true);
    try {
      const uniqueClients = new Map<string, { name: string; phone: string }>();
      for (const booking of bookings) {
        if (!booking.clientName) continue;
        const key = `${booking.clientName}::${booking.clientPhone || ''}`;
        if (!uniqueClients.has(key)) {
          uniqueClients.set(key, { name: booking.clientName, phone: booking.clientPhone || '' });
        }
      }
      let created = 0;
      for (const client of uniqueClients.values()) {
        await findOrCreateStudent(db as Firestore, coach.id, client.name, client.phone);
        created++;
      }
      showToast(`Synced ${created} client${created !== 1 ? 's' : ''} from bookings!`, 'success');
    } catch (error) {
      console.error('Error syncing students:', error);
      showToast('Failed to sync students', 'error');
    } finally {
      setSyncing(false);
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Students</h1>
          <p className="text-gray-600 dark:text-zinc-400 mt-1">
            {students.length} student{students.length !== 1 ? 's' : ''}
          </p>
        </div>
        {bookings.length > 0 && (
          <Button variant="secondary" size="sm" onClick={handleSyncStudents} loading={syncing}>
            Sync from Bookings
          </Button>
        )}
      </div>

      {/* Search */}
      <Input
        id="search"
        placeholder="Search by name or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Day filter tabs */}
      {activeDays.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setDayFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dayFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-[#1f1f1f] text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
            }`}
          >
            All
          </button>
          {activeDays.map((day) => (
            <button
              key={day}
              onClick={() => setDayFilter(day)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dayFilter === day
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-[#1f1f1f] text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
              }`}
            >
              {day.charAt(0).toUpperCase() + day.slice(1, 3)}
            </button>
          ))}
        </div>
      )}

      {/* Student cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
          {students.length === 0 ? (
            <div className="space-y-3">
              <p>No students yet.</p>
              {bookings.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={handleSyncStudents} loading={syncing}>
                  Sync {bookings.length} booking{bookings.length !== 1 ? 's' : ''} into students
                </Button>
              ) : (
                <p className="text-sm">Students are created automatically when you add bookings or mark classes as done.</p>
              )}
            </div>
          ) : (
            'No students match your search.'
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((student) => {
            const count = lessonCounts[student.id] || 0;
            const hasPrepaid = student.prepaidTotal > 0;
            const prepaidRemaining = student.prepaidTotal - student.prepaidUsed;
            const expired = hasPrepaid && prepaidRemaining <= 0;
            const dayInfo = dayFilter !== 'all' ? dayToStudents.get(dayFilter)?.get(student.id) : null;

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
                    {dayInfo && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {formatTimeDisplay(dayInfo.startTime)} - {formatTimeDisplay(dayInfo.endTime)} &middot; {dayInfo.locationName}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                      {count} lesson{count !== 1 ? 's' : ''}
                    </p>
                    {student.pendingPayment > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        RM {student.pendingPayment} due
                      </span>
                    )}
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
                    ) : student.payPerLesson ? (
                      <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        Pay per lesson
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

            {/* Payment due banner */}
            {selectedStudent.pendingPayment > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Payment due: RM {selectedStudent.pendingPayment}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!coach || !db || !selectedStudent) return;
                    try {
                      await updateDoc(
                        doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
                        {
                          pendingPayment: 0,
                          credit: 0,
                          updatedAt: serverTimestamp(),
                        }
                      );
                      setSelectedStudent((prev) =>
                        prev ? { ...prev, pendingPayment: 0, credit: 0 } : null
                      );
                      showToast('Payment marked as received!', 'success');
                    } catch (error) {
                      console.error('Error marking paid:', error);
                      showToast('Failed to mark as paid', 'error');
                    }
                  }}
                >
                  Mark as Paid
                </Button>
              </div>
            )}

            {/* Payment mode section */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  {selectedStudent.payPerLesson ? 'Pay per Lesson' : 'Prepaid Package'}
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      if (!coach || !db || !selectedStudent) return;
                      const newVal = !selectedStudent.payPerLesson;
                      try {
                        await updateDoc(
                          doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
                          { payPerLesson: newVal, updatedAt: serverTimestamp() }
                        );
                        setSelectedStudent((prev) => prev ? { ...prev, payPerLesson: newVal } : null);
                        showToast(newVal ? 'Switched to pay per lesson' : 'Switched to package mode', 'success');
                      } catch {
                        showToast('Failed to update payment mode', 'error');
                      }
                    }}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    {selectedStudent.payPerLesson ? 'Switch to Package' : 'Pay per Lesson'}
                  </button>
                  {!selectedStudent.payPerLesson && !editingPrepaid && (
                    <button
                      onClick={() => {
                        setEditPrepaidTotal(selectedStudent.prepaidTotal);
                        setEditPrepaidUsed(selectedStudent.prepaidUsed);
                        setEditingPrepaid(true);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {selectedStudent.payPerLesson ? (
                <p className="text-sm text-gray-500 dark:text-zinc-400">
                  Payment is tracked per lesson. Unpaid lessons accumulate as pending payment.
                </p>
              ) : editingPrepaid ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      id="editPrepaidTotal"
                      label="Total Lessons"
                      type="number"
                      value={String(editPrepaidTotal)}
                      onChange={(e) => setEditPrepaidTotal(Math.max(0, Number(e.target.value) || 0))}
                    />
                    <Input
                      id="editPrepaidUsed"
                      label="Used Lessons"
                      type="number"
                      value={String(editPrepaidUsed)}
                      onChange={(e) => setEditPrepaidUsed(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSavePrepaid} loading={savingPrepaid}>
                      Save
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditingPrepaid(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
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
                      {(selectedStudent.credit ?? 0) > 0 && (
                        <div className="flex items-center justify-between text-sm mt-2">
                          <span className="text-gray-600 dark:text-zinc-400">Credit Balance</span>
                          <span className="font-medium text-green-600 dark:text-green-400">RM {selectedStudent.credit}</span>
                        </div>
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
                </>
              )}
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
                        <p className="text-gray-900 dark:text-zinc-100">{log.date.split('-').reverse().join('-')}</p>
                        <p className="text-xs text-gray-500 dark:text-zinc-400">
                          {formatTimeDisplay(log.startTime)} – {formatTimeDisplay(log.endTime)} &middot; {log.locationName}
                        </p>
                        {log.note && (
                          <p className="text-xs text-gray-400 dark:text-zinc-500 italic">{log.note}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {log.price > 0 && (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            RM {log.price}
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          disabled={deletingLogId === log.id}
                          className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 disabled:opacity-50 p-0.5"
                          title="Delete lesson"
                        >
                          {deletingLogId === log.id ? (
                            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Lesson */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              <button
                onClick={() => setShowAddLesson(!showAddLesson)}
                className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <svg className={`w-4 h-4 transition-transform ${showAddLesson ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Add Lesson
              </button>
              {showAddLesson && (
                <div className="mt-3 space-y-3">
                  <Input
                    id="lessonDate"
                    label="Date"
                    type="date"
                    value={lessonDate}
                    onChange={(e) => setLessonDate(e.target.value)}
                  />
                  <div>
                    <label htmlFor="lessonLocation" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                      Location
                    </label>
                    <select
                      id="lessonLocation"
                      value={lessonLocationName}
                      onChange={(e) => setLessonLocationName(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
                    >
                      <option value="">Select location</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.name}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      id="lessonStart"
                      label="Start Time"
                      type="time"
                      value={lessonStartTime}
                      onChange={(e) => setLessonStartTime(e.target.value)}
                    />
                    <Input
                      id="lessonEnd"
                      label="End Time"
                      type="time"
                      value={lessonEndTime}
                      onChange={(e) => setLessonEndTime(e.target.value)}
                    />
                  </div>
                  <Input
                    id="lessonPrice"
                    label="Price (RM)"
                    type="number"
                    value={String(lessonPrice)}
                    onChange={(e) => setLessonPrice(Number(e.target.value) || 0)}
                  />
                  <Input
                    id="lessonNote"
                    label="Note (optional)"
                    value={lessonNote}
                    onChange={(e) => setLessonNote(e.target.value)}
                    placeholder="e.g. Aaron only"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddLesson}
                    loading={addingLesson}
                    disabled={!lessonLocationName || !lessonDate}
                  >
                    Add Lesson
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

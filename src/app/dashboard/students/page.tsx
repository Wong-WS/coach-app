'use client';

import { useState, useMemo } from 'react';
import { collection, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment, Timestamp, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useStudents, useLessonLogs, useLocations, useBookings, usePayments } from '@/hooks/useCoachData';
import { Button, Input, Modal, PhoneInput } from '@/components/ui';
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
  const { payments } = usePayments(coach?.id);
  const { showToast } = useToast();

  const [syncing, setSyncing] = useState(false);

  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState<DayOfWeek | 'all' | 'no-booking' | 'payment-due'>('all');
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(false);
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

  // Record Payment state
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [recordPaymentAmount, setRecordPaymentAmount] = useState(0);
  const [recordPaymentDate, setRecordPaymentDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Edit payment state
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editPaymentAmount, setEditPaymentAmount] = useState(0);
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  // Linked student state
  const [unlinking, setUnlinking] = useState(false);

  // Editable prepaid state
  const [editingPrepaid, setEditingPrepaid] = useState(false);
  const [editPrepaidTotal, setEditPrepaidTotal] = useState(0);
  const [editPrepaidUsed, setEditPrepaidUsed] = useState(0);
  const [editLessonRate, setEditLessonRate] = useState(0);
  const [savingPrepaid, setSavingPrepaid] = useState(false);

  // Renew package after payment modal
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewAmount, setRenewAmount] = useState(0);
  const [renewingPackage, setRenewingPackage] = useState(false);

  // Student's lesson history
  const studentLogs = useMemo(() => {
    if (!selectedStudent) return [];
    return allLogs
      .filter((l) => l.studentId === selectedStudent.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allLogs, selectedStudent]);

  // Student's payment history
  const studentPayments = useMemo(() => {
    if (!selectedStudent) return [];
    return payments
      .filter((p) => p.studentId === selectedStudent.id)
      .sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime());
  }, [payments, selectedStudent]);

  // Linked students for the selected student
  const linkedStudents = useMemo(() => {
    if (!selectedStudent) return [];
    // If this is a primary student, find all students linked TO them
    return students.filter((s) => s.linkedToStudentId === selectedStudent.id);
  }, [students, selectedStudent]);

  // If selected student is a secondary, find their primary
  const primaryStudent = useMemo(() => {
    if (!selectedStudent?.linkedToStudentId) return null;
    return students.find((s) => s.id === selectedStudent.linkedToStudentId) ?? null;
  }, [students, selectedStudent]);

  // Map students to their booking days, tracking earliest startTime and locationName per day
  const { dayToStudents, activeDays } = useMemo(() => {
    const dayMap = new Map<DayOfWeek, Map<string, { startTime: string; endTime: string; locationName: string }>>();

    for (const booking of bookings) {
      if (!booking.clientName || booking.endDate) continue;
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

  // Set of all student IDs that appear in any booking (including linked students)
  const studentsWithBookings = useMemo(() => {
    const ids = new Set<string>();
    for (const dayStudents of dayToStudents.values()) {
      for (const id of dayStudents.keys()) {
        ids.add(id);
      }
    }
    // Also include linked students from recurring bookings
    for (const booking of bookings) {
      if (booking.linkedStudentIds && !booking.endDate) {
        for (const id of booking.linkedStudentIds) {
          ids.add(id);
        }
      }
    }
    return ids;
  }, [dayToStudents, bookings]);

  const filtered = useMemo(() => {
    let result = students;

    if (dayFilter === 'payment-due') {
      result = result.filter((s) => Math.max(0, s.pendingPayment - (s.credit ?? 0)) > 0);
    } else if (dayFilter === 'no-booking') {
      result = result.filter((s) => !studentsWithBookings.has(s.id));
    } else if (dayFilter !== 'all') {
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
  }, [students, search, dayFilter, dayToStudents, studentsWithBookings]);

  const getStudentBookings = (student: Student) => {
    return bookings.filter(
      (b) =>
        b.status === 'confirmed' &&
        !b.endDate &&
        b.clientName === student.clientName &&
        b.clientPhone === (student.clientPhone || '')
    );
  };

  const handleDeleteStudent = async (student: Student) => {
    if (!coach || !db) return;
    setDeletingStudent(true);
    try {
      const firestore = db as Firestore;
      const studentBookings = getStudentBookings(student);
      const batch = writeBatch(firestore);

      // Delete the student document
      batch.delete(doc(firestore, 'coaches', coach.id, 'students', student.id));

      // Cancel all active recurring bookings for this student
      for (const booking of studentBookings) {
        batch.update(doc(firestore, 'coaches', coach.id, 'bookings', booking.id), {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
        });
      }

      await batch.commit();

      // Try to delete their portal token (may fail due to security rules)
      if (student.linkToken) {
        try {
          await deleteDoc(doc(firestore, 'studentTokens', student.linkToken));
        } catch {
          // Token cleanup is best-effort
        }
      }
      setSelectedStudent(null);
      setConfirmDeleteStudent(false);
      const msg = studentBookings.length > 0
        ? `Student deleted and ${studentBookings.length} booking${studentBookings.length > 1 ? 's' : ''} cancelled`
        : 'Student deleted';
      showToast(msg, 'success');
    } catch (error) {
      console.error('Error deleting student:', error);
      showToast('Failed to delete student', 'error');
    } finally {
      setDeletingStudent(false);
    }
  };

  const handleUnlinkStudent = async (secondaryStudentId: string, primaryStudentId: string) => {
    if (!coach || !db) return;
    setUnlinking(true);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      // Clear linkedToStudentId on the secondary student
      batch.update(doc(firestore, 'coaches', coach.id, 'students', secondaryStudentId), {
        linkedToStudentId: null,
        updatedAt: serverTimestamp(),
      });

      // Remove from linkedStudentIds on all bookings for the primary student
      const primary = students.find((s) => s.id === primaryStudentId);
      if (primary) {
        for (const booking of bookings) {
          if (
            booking.clientName === primary.clientName &&
            booking.clientPhone === (primary.clientPhone || '') &&
            booking.linkedStudentIds?.includes(secondaryStudentId)
          ) {
            batch.update(doc(firestore, 'coaches', coach.id, 'bookings', booking.id), {
              linkedStudentIds: booking.linkedStudentIds.filter((id) => id !== secondaryStudentId),
            });
          }
        }
      }

      await batch.commit();
      showToast('Student unlinked!', 'success');
    } catch (error) {
      console.error('Error unlinking student:', error);
      showToast('Failed to unlink student', 'error');
    } finally {
      setUnlinking(false);
    }
  };

  const openDetail = (student: Student) => {
    setSelectedStudent(student);
    setEditName(student.clientName);
    setEditPhone(student.clientPhone);
    setEditNotes(student.notes);
    setShowAddLesson(false);
    setEditingPrepaid(false);

    // Auto-fill lesson form from student's booking
    // Check: primary on booking, or linked student on booking
    const studentBooking = bookings.find(
      (b) =>
        (b.clientName === student.clientName && b.clientPhone === (student.clientPhone || '')) ||
        b.linkedStudentIds?.includes(student.id) ||
        (b.studentPrices && student.id in b.studentPrices)
    );
    if (studentBooking) {
      setLessonLocationName(studentBooking.locationName);
      setLessonStartTime(studentBooking.startTime);
      setLessonEndTime(studentBooking.endTime);
      // Use per-student price if available, then lessonRate, then total booking price
      const perStudentPrice = studentBooking.studentPrices?.[student.id];
      setLessonPrice(perStudentPrice ?? student.lessonRate ?? studentBooking.price ?? 0);
    } else {
      setLessonLocationName('');
      setLessonStartTime('09:00');
      setLessonEndTime('10:00');
      // Fall back to lessonRate or most recent lesson log price
      const lastLog = allLogs
        .filter((l) => l.studentId === student.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      setLessonPrice(student.lessonRate ?? lastLog?.price ?? 0);
    }

    // Auto-backfill lessonRate from booking data if not set
    if (!student.lessonRate && coach && db) {
      let rate = 0;
      // Check studentPrices first (split payment — per-student price)
      for (const b of bookings) {
        if (b.studentPrices?.[student.id]) {
          rate = b.studentPrices[student.id];
          break;
        }
      }
      // Fallback: non-split booking matched by name+phone
      if (!rate && studentBooking?.price) {
        rate = studentBooking.price;
      }
      if (rate > 0) {
        updateDoc(
          doc(db as Firestore, 'coaches', coach.id, 'students', student.id),
          { lessonRate: rate, updatedAt: serverTimestamp() }
        ).catch(() => {});
        setSelectedStudent((prev) => prev ? { ...prev, lessonRate: rate } : null);
      }
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
    const overflow = packageFinished ? Math.max(0, selectedStudent.prepaidUsed - selectedStudent.prepaidTotal) : 0;
    // Optimistic update — update UI immediately
    const prevStudent = { ...selectedStudent };
    setSelectedStudent((prev) =>
      prev
        ? {
            ...prev,
            prepaidTotal: packageFinished ? amount : prev.prepaidTotal + amount,
            prepaidUsed: packageFinished ? overflow : prev.prepaidUsed,
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
        updateData.prepaidUsed = overflow;
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

      // Calculate credit: compare against student's lessonRate
      const basePrice = selectedStudent.lessonRate ?? 0;
      const creditDiff = basePrice > 0 && lessonPrice < basePrice ? basePrice - lessonPrice : 0;
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
      setLessonPrice(basePrice || lessonPrice);
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

      const log = studentLogs.find((l) => l.id === logId);
      const updateData: Record<string, unknown> = {
        prepaidUsed: increment(-1),
        updatedAt: serverTimestamp(),
      };

      // Reverse credit if price was below lessonRate
      const basePrice = selectedStudent.lessonRate ?? 0;
      if (log && log.price < basePrice && basePrice > 0) {
        updateData.credit = increment(-(basePrice - log.price));
      }

      // Reverse pendingPayment for pay-per-lesson
      if (selectedStudent.payPerLesson && log && log.price > 0) {
        updateData.pendingPayment = increment(-log.price);
      }

      // If package was exhausted and this deletion un-exhausts it, clear pendingPayment
      const wasExhausted = selectedStudent.prepaidTotal > 0 && selectedStudent.prepaidUsed >= selectedStudent.prepaidTotal;
      const willBeAfter = selectedStudent.prepaidUsed - 1;
      if (wasExhausted && willBeAfter < selectedStudent.prepaidTotal) {
        updateData.pendingPayment = 0;
        // Don't zero out credit here — the specific lesson's credit was already
        // reversed above (lines 467-471). Zeroing it would lose credit accumulated
        // from other cheaper lessons in the package.
      }

      // If deleting the last lesson log, clear any leftover credit
      if (studentLogs.length <= 1) {
        updateData.credit = 0;
      }

      batch.update(doc(firestore, 'coaches', coach.id, 'students', selectedStudent.id), updateData);
      await batch.commit();

      let newPending = selectedStudent.pendingPayment;
      let newCredit = selectedStudent.credit ?? 0;
      if (wasExhausted && willBeAfter < selectedStudent.prepaidTotal) {
        newPending = 0;
        // Only reverse credit for the specific deleted lesson, not all credit
        if (log && log.price < basePrice && basePrice > 0) {
          newCredit = Math.max(0, newCredit - (basePrice - log.price));
        }
      } else if (studentLogs.length <= 1) {
        newCredit = 0;
      } else {
        if (selectedStudent.payPerLesson && log && log.price > 0) {
          newPending = Math.max(0, newPending - log.price);
        }
        if (log && log.price < basePrice && basePrice > 0) {
          newCredit = Math.max(0, newCredit - (basePrice - log.price));
        }
      }

      setSelectedStudent((prev) =>
        prev ? { ...prev, prepaidUsed: Math.max(0, prev.prepaidUsed - 1), pendingPayment: newPending, credit: newCredit } : null
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
      const updatePayload: Record<string, unknown> = {
        prepaidTotal: editPrepaidTotal,
        prepaidUsed: editPrepaidUsed,
        lessonRate: editLessonRate,
        updatedAt: serverTimestamp(),
      };

      // Recalculate pendingPayment (gross) if package is exhausted and rate changed
      let newPending = selectedStudent.pendingPayment;
      const isExhausted = editPrepaidUsed >= editPrepaidTotal && editPrepaidTotal > 0;
      if (isExhausted && editLessonRate !== (selectedStudent.lessonRate ?? 0)) {
        newPending = editLessonRate * editPrepaidTotal;
        updatePayload.pendingPayment = newPending;
      }

      await updateDoc(
        doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
        updatePayload
      );
      setSelectedStudent((prev) =>
        prev ? { ...prev, prepaidTotal: editPrepaidTotal, prepaidUsed: editPrepaidUsed, lessonRate: editLessonRate, pendingPayment: newPending } : null
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
          <button
            onClick={() => setDayFilter('no-booking')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dayFilter === 'no-booking'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 dark:bg-[#1f1f1f] text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
            }`}
          >
            No Booking
          </button>
          <button
            onClick={() => setDayFilter('payment-due')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dayFilter === 'payment-due'
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 dark:bg-[#1f1f1f] text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
            }`}
          >
            Payment Due
          </button>
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
            const hasPrepaid = student.prepaidTotal > 0;
            const prepaidRemaining = student.prepaidTotal - student.prepaidUsed;
            const expired = hasPrepaid && prepaidRemaining <= 0;
            const dayInfo = dayFilter !== 'all' && dayFilter !== 'no-booking' && dayFilter !== 'payment-due' ? dayToStudents.get(dayFilter)?.get(student.id) : null;

            return (
              <button
                key={student.id}
                onClick={() => openDetail(student)}
                className="text-left bg-white dark:bg-[#1f1f1f] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-[#333333] hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-zinc-100">
                      {(() => {
                        const linked = students.filter((s) => s.linkedToStudentId === student.id);
                        if (linked.length === 0) return student.clientName;
                        const names = [student.clientName, ...linked.map((s) => s.clientName)];
                        return names.length <= 2
                          ? names.join(' and ')
                          : names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
                      })()}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
                      {student.clientPhone}
                    </p>
                    {dayInfo && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {formatTimeDisplay(dayInfo.startTime)} - {formatTimeDisplay(dayInfo.endTime)} &middot; {dayInfo.locationName}
                      </p>
                    )}
                    {student.linkedToStudentId && (() => {
                      const primary = students.find((s) => s.id === student.linkedToStudentId);
                      return primary ? (
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                          Linked to {primary.clientName}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {Math.max(0, student.pendingPayment - (student.credit ?? 0)) > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        RM {Math.max(0, student.pendingPayment - (student.credit ?? 0))} unpaid
                      </span>
                    )}
                    {hasPrepaid ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          expired
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}
                      >
                        {student.prepaidUsed}/{student.prepaidTotal}
                      </span>
                    ) : student.payPerLesson ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        Pay per lesson
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-zinc-500">
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
              <PhoneInput
                id="editPhone"
                label="Phone"
                value={editPhone}
                onChange={(val) => setEditPhone(val)}
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
            {Math.max(0, selectedStudent.pendingPayment - (selectedStudent.credit ?? 0)) > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Unpaid: RM {Math.max(0, selectedStudent.pendingPayment - (selectedStudent.credit ?? 0))}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!coach || !db || !selectedStudent) return;
                    const firestore = db as Firestore;
                    const amount = Math.max(0, selectedStudent.pendingPayment - (selectedStudent.credit ?? 0));
                    try {
                      const batch = writeBatch(firestore);
                      batch.update(
                        doc(firestore, 'coaches', coach.id, 'students', selectedStudent.id),
                        {
                          pendingPayment: 0,
                          credit: 0,
                          updatedAt: serverTimestamp(),
                        }
                      );
                      if (amount > 0) {
                        const paymentRef = doc(collection(firestore, 'coaches', coach.id, 'payments'));
                        batch.set(paymentRef, {
                          studentId: selectedStudent.id,
                          studentName: selectedStudent.clientName,
                          amount,
                          collectedAt: serverTimestamp(),
                          createdAt: serverTimestamp(),
                        });
                      }
                      await batch.commit();
                      setSelectedStudent((prev) =>
                        prev ? { ...prev, pendingPayment: 0, credit: 0 } : null
                      );
                      showToast('Payment marked as received!', 'success');
                      // If package is exhausted, prompt to renew
                      if (!selectedStudent.payPerLesson && selectedStudent.prepaidTotal > 0 && selectedStudent.prepaidUsed >= selectedStudent.prepaidTotal) {
                        setRenewAmount(selectedStudent.prepaidTotal);
                        setShowRenewModal(true);
                      }
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

            {/* Record Payment (backfill) */}
            {showRecordPayment ? (
              <div className="bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#333333] rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Record a payment</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="recordPaymentAmount"
                    label="Amount (RM)"
                    type="number"
                    value={String(recordPaymentAmount)}
                    onChange={(e) => setRecordPaymentAmount(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <Input
                    id="recordPaymentDate"
                    label="Date Received"
                    type="date"
                    value={recordPaymentDate}
                    onChange={(e) => setRecordPaymentDate(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    loading={recordingPayment}
                    onClick={async () => {
                      if (!coach || !db || !selectedStudent || recordPaymentAmount <= 0 || !recordPaymentDate) return;
                      setRecordingPayment(true);
                      try {
                        const firestore = db as Firestore;
                        const [y, m, d] = recordPaymentDate.split('-').map(Number);
                        const collectedDate = Timestamp.fromDate(new Date(y, m - 1, d));
                        const paymentRef = doc(collection(firestore, 'coaches', coach.id, 'payments'));
                        const batch = writeBatch(firestore);
                        batch.set(paymentRef, {
                          studentId: selectedStudent.id,
                          studentName: selectedStudent.clientName,
                          amount: recordPaymentAmount,
                          collectedAt: collectedDate,
                          createdAt: serverTimestamp(),
                        });
                        await batch.commit();
                        setShowRecordPayment(false);
                        setRecordPaymentAmount(0);
                        showToast(`Recorded RM ${recordPaymentAmount} payment`, 'success');
                      } catch {
                        showToast('Failed to record payment', 'error');
                      } finally {
                        setRecordingPayment(false);
                      }
                    }}
                  >
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setShowRecordPayment(false); setRecordPaymentAmount(0); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  const now = new Date();
                  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                  setRecordPaymentDate(todayStr);
                  const defaultAmount = selectedStudent.payPerLesson
                    ? (selectedStudent.lessonRate ?? 0)
                    : (selectedStudent.lessonRate ?? 0) * selectedStudent.prepaidTotal;
                  setRecordPaymentAmount(defaultAmount);
                  setShowRecordPayment(true);
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Record Payment
              </button>
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
                      const hasPending = Math.max(0, selectedStudent.pendingPayment - (selectedStudent.credit ?? 0)) > 0;
                      // When switching to pay-per-lesson with a pending balance, confirm clearing it
                      if (newVal && hasPending) {
                        const amount = Math.max(0, selectedStudent.pendingPayment - (selectedStudent.credit ?? 0));
                        if (!window.confirm(`Switching to pay per lesson will clear the RM ${amount} unpaid balance (no payment will be recorded). Continue?`)) {
                          return;
                        }
                      }
                      try {
                        const updatePayload: Record<string, unknown> = { payPerLesson: newVal, updatedAt: serverTimestamp() };
                        if (newVal && hasPending) {
                          updatePayload.pendingPayment = 0;
                          updatePayload.credit = 0;
                        }
                        await updateDoc(
                          doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
                          updatePayload
                        );
                        setSelectedStudent((prev) => prev ? {
                          ...prev,
                          payPerLesson: newVal,
                          ...(newVal && hasPending ? { pendingPayment: 0, credit: 0 } : {}),
                        } : null);
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
                        setEditLessonRate(selectedStudent.lessonRate ?? 0);
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
                editingPrepaid ? (
                  <div className="space-y-3">
                    <Input
                      id="editLessonRatePayPerLesson"
                      label="Rate per Lesson (RM)"
                      type="number"
                      value={String(editLessonRate)}
                      onChange={(e) => setEditLessonRate(Math.max(0, Number(e.target.value) || 0))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async () => {
                        if (!coach || !db || !selectedStudent) return;
                        setSavingPrepaid(true);
                        try {
                          const updatePayload: Record<string, unknown> = { lessonRate: editLessonRate, updatedAt: serverTimestamp() };
                          let newPending = selectedStudent.pendingPayment;
                          const isExhausted = selectedStudent.prepaidUsed >= selectedStudent.prepaidTotal && selectedStudent.prepaidTotal > 0;
                          if (isExhausted && editLessonRate !== (selectedStudent.lessonRate ?? 0)) {
                            newPending = editLessonRate * selectedStudent.prepaidTotal;
                            updatePayload.pendingPayment = newPending;
                          }
                          await updateDoc(
                            doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
                            updatePayload
                          );
                          setSelectedStudent((prev) => prev ? { ...prev, lessonRate: editLessonRate, pendingPayment: newPending } : null);
                          setEditingPrepaid(false);
                          showToast('Lesson rate updated!', 'success');
                        } catch {
                          showToast('Failed to update rate', 'error');
                        } finally {
                          setSavingPrepaid(false);
                        }
                      }} loading={savingPrepaid}>
                        Save
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditingPrepaid(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(selectedStudent.lessonRate ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-zinc-400">Rate per lesson</span>
                        <span className="font-medium text-gray-900 dark:text-zinc-100">RM {selectedStudent.lessonRate}</span>
                      </div>
                    )}
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                      Payment is tracked per lesson. Unpaid lessons accumulate as pending payment.
                    </p>
                    <button
                      onClick={() => {
                        setEditLessonRate(selectedStudent.lessonRate ?? 0);
                        setEditingPrepaid(true);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {(selectedStudent.lessonRate ?? 0) > 0 ? 'Edit Rate' : 'Set Rate'}
                    </button>
                  </div>
                )
              ) : editingPrepaid ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
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
                    <Input
                      id="editLessonRate"
                      label="Rate (RM)"
                      type="number"
                      value={String(editLessonRate)}
                      onChange={(e) => setEditLessonRate(Math.max(0, Number(e.target.value) || 0))}
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
                      {(selectedStudent.lessonRate ?? 0) > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-zinc-400">Rate per lesson</span>
                          <span className="font-medium text-gray-900 dark:text-zinc-100">RM {selectedStudent.lessonRate}</span>
                        </div>
                      )}
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-green-600 dark:text-green-400">RM {selectedStudent.credit}</span>
                            <button
                              onClick={async () => {
                                if (!coach || !db || !selectedStudent) return;
                                try {
                                  await updateDoc(
                                    doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
                                    { credit: 0, updatedAt: serverTimestamp() }
                                  );
                                  setSelectedStudent((prev) => prev ? { ...prev, credit: 0 } : null);
                                  showToast('Credit cleared', 'success');
                                } catch {
                                  showToast('Failed to clear credit', 'error');
                                }
                              }}
                              className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300"
                            >
                              Clear
                            </button>
                          </div>
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

            {/* Linked Students */}
            {(linkedStudents.length > 0 || primaryStudent || !selectedStudent.linkedToStudentId) && (
              <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
                {primaryStudent ? (
                  // This is a secondary student — show who they're linked to
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                      Linked To
                    </h3>
                    <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{primaryStudent.clientName}</p>
                        <p className="text-xs text-gray-500 dark:text-zinc-400">{primaryStudent.clientPhone}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openDetail(primaryStudent)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleUnlinkStudent(selectedStudent.id, primaryStudent.id)}
                          disabled={unlinking}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                        >
                          {unlinking ? 'Unlinking...' : 'Unlink'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // This is a primary student (or unlinked) — show linked students + link button
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                      Linked Students {linkedStudents.length > 0 && `(${linkedStudents.length})`}
                    </h3>

                    {linkedStudents.length > 0 ? (
                      <div className="space-y-2">
                        {linkedStudents.map((ls) => (
                          <div
                            key={ls.id}
                            className="flex items-center justify-between bg-gray-50 dark:bg-[#1a1a1a]/50 rounded-lg p-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{ls.clientName}</p>
                              <p className="text-xs text-gray-500 dark:text-zinc-400">{ls.clientPhone}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openDetail(ls)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                View
                              </button>
                              <button
                                onClick={() => handleUnlinkStudent(ls.id, selectedStudent.id)}
                                disabled={unlinking}
                                className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                              >
                                {unlinking ? '...' : 'Unlink'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-zinc-500">
                        No linked students. Link students via split payment when creating a booking.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

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

            {/* Payment history */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
                Payment History ({studentPayments.length})
              </h3>
              {studentPayments.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {studentPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="text-sm p-2 bg-gray-50 dark:bg-[#1a1a1a]/50 rounded"
                    >
                      {editingPaymentId === payment.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={editPaymentDate}
                              onChange={(e) => setEditPaymentDate(e.target.value)}
                              className="px-2 py-1 text-sm border border-gray-300 dark:border-zinc-500 rounded bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-gray-500 dark:text-zinc-400">RM</span>
                              <input
                                type="number"
                                value={editPaymentAmount}
                                onChange={(e) => setEditPaymentAmount(Math.max(0, Number(e.target.value) || 0))}
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-zinc-500 rounded bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled={savingPayment}
                              onClick={async () => {
                                if (!coach || !db || !editPaymentDate || editPaymentAmount <= 0) return;
                                setSavingPayment(true);
                                try {
                                  const [y, m, d] = editPaymentDate.split('-').map(Number);
                                  await updateDoc(
                                    doc(db as Firestore, 'coaches', coach.id, 'payments', payment.id),
                                    {
                                      collectedAt: Timestamp.fromDate(new Date(y, m - 1, d)),
                                      amount: editPaymentAmount,
                                    }
                                  );
                                  setEditingPaymentId(null);
                                  showToast('Payment updated', 'success');
                                } catch {
                                  showToast('Failed to update payment', 'error');
                                } finally {
                                  setSavingPayment(false);
                                }
                              }}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                            >
                              {savingPayment ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingPaymentId(null)}
                              className="text-xs text-gray-500 dark:text-zinc-400 hover:underline"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={deletingPaymentId === payment.id}
                              onClick={async () => {
                                if (!coach || !db) return;
                                setDeletingPaymentId(payment.id);
                                try {
                                  await deleteDoc(doc(db as Firestore, 'coaches', coach.id, 'payments', payment.id));
                                  setEditingPaymentId(null);
                                  showToast('Payment deleted', 'success');
                                } catch {
                                  showToast('Failed to delete payment', 'error');
                                } finally {
                                  setDeletingPaymentId(null);
                                }
                              }}
                              className="text-xs text-red-500 dark:text-red-400 hover:underline disabled:opacity-50 ml-auto"
                            >
                              {deletingPaymentId === payment.id ? '...' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-gray-900 dark:text-zinc-100">
                              {payment.collectedAt.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            <button
                              onClick={() => {
                                const d = payment.collectedAt;
                                setEditPaymentDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                                setEditPaymentAmount(payment.amount);
                                setEditingPaymentId(payment.id);
                              }}
                              className="text-xs text-gray-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              Edit
                            </button>
                          </div>
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            RM {payment.amount}
                          </span>
                        </div>
                      )}
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

            {/* Delete student */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              {confirmDeleteStudent ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Delete <strong>{selectedStudent.clientName}</strong>? This removes the student record and portal link. Lesson history will be lost.
                    {getStudentBookings(selectedStudent).length > 0 && (
                      <> Their {getStudentBookings(selectedStudent).length} active booking{getStudentBookings(selectedStudent).length > 1 ? 's' : ''} will also be cancelled.</>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteStudent(selectedStudent)}
                      loading={deletingStudent}
                    >
                      Delete
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteStudent(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteStudent(true)}
                  className="text-sm text-red-500 dark:text-red-400 hover:underline"
                >
                  Delete Student
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Renew Package Modal */}
      <Modal
        isOpen={showRenewModal}
        onClose={() => setShowRenewModal(false)}
        title="Renew Prepaid Package?"
      >
        <div className="space-y-4">
          <Input
            label="Number of lessons"
            type="number"
            min={1}
            value={String(renewAmount)}
            onChange={(e) => setRenewAmount(Math.max(1, Number(e.target.value) || 1))}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              loading={renewingPackage}
              onClick={async () => {
                if (!coach || !db || !selectedStudent) return;
                setRenewingPackage(true);
                try {
                  const overflow = Math.max(0, selectedStudent.prepaidUsed - selectedStudent.prepaidTotal);
                  await updateDoc(
                    doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id),
                    {
                      prepaidTotal: renewAmount,
                      prepaidUsed: overflow,
                      updatedAt: serverTimestamp(),
                    }
                  );
                  setSelectedStudent((prev) =>
                    prev ? { ...prev, prepaidTotal: renewAmount, prepaidUsed: overflow } : null
                  );
                  showToast(`Package renewed with ${renewAmount} lessons!`, 'success');
                  setShowRenewModal(false);
                } catch (error) {
                  console.error('Error renewing package:', error);
                  showToast('Failed to renew package', 'error');
                } finally {
                  setRenewingPackage(false);
                }
              }}
            >
              Renew
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setShowRenewModal(false)}>
              Skip
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

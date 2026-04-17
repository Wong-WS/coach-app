'use client';

import { useState, useMemo } from 'react';
import { collection, doc, updateDoc, addDoc, deleteDoc, writeBatch, serverTimestamp, increment, Firestore, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useStudents, useLessonLogs, useBookings, useWallets } from '@/hooks/useCoachData';
import { Button, Input, Modal, PhoneInput } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Student, DayOfWeek } from '@/types';
import { formatTimeDisplay } from '@/lib/availability-engine';
import { findOrCreateStudent } from '@/lib/students';
import { formatDateMedium, parseDateString } from '@/lib/date-format';

export default function StudentsPage() {
  const { coach } = useAuth();
  const { students, loading } = useStudents(coach?.id);
  const [logLimit, setLogLimit] = useState(20);
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const { wallets } = useWallets(coach?.id);
  const { showToast } = useToast();

  const [syncing, setSyncing] = useState(false);

  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState<DayOfWeek | 'all' | 'no-booking'>('all');
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);

  // Wallet top-up state
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(0);
  const [topUpDate, setTopUpDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [toppingUp, setToppingUp] = useState(false);

  // Linked student state
  const [unlinking, setUnlinking] = useState(false);

  // Editable lesson rate state (pay-per-lesson)
  const [editingLessonRate, setEditingLessonRate] = useState(false);
  const [editLessonRate, setEditLessonRate] = useState(0);
  const [savingLessonRate, setSavingLessonRate] = useState(false);

  // Student's lesson history (per-student query with limit)
  const { lessonLogs: studentLogs, loading: logsLoading } = useLessonLogs(coach?.id, undefined, selectedStudent?.id, undefined, logLimit);


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

    if (dayFilter === 'no-booking') {
      result = result.filter((s) => !studentsWithBookings.has(s.id));
    } else if (dayFilter !== 'all') {
      const dayStudents = dayToStudents.get(dayFilter as DayOfWeek);
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
    setShowTopUp(false);
    setLogLimit(20);

    // If lessonRate not set on student, derive it from recurring booking for display only (no Firestore write)
    if (!student.lessonRate) {
      const matchingBookings = bookings.filter(
        (b) =>
          (b.clientName === student.clientName && b.clientPhone === (student.clientPhone || '')) ||
          b.linkedStudentIds?.includes(student.id) ||
          (b.studentPrices && student.id in b.studentPrices)
      );
      const recurringBooking = matchingBookings.find((b) => !b.endDate);
      const derivedRate = recurringBooking
        ? (recurringBooking.studentPrices?.[student.id] ?? recurringBooking.price ?? 0)
        : 0;
      if (derivedRate > 0) {
        setSelectedStudent((prev) => prev ? { ...prev, lessonRate: derivedRate } : null);
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

  const handleWalletTopUp = async () => {
    if (!coach || !db || !selectedStudent) return;
    const wallet = wallets.find((w) => w.studentIds.includes(selectedStudent.id));
    if (!wallet || topUpAmount <= 0) return;
    setToppingUp(true);
    try {
      const firestore = db as Firestore;
      const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', wallet.id);
      const txnCol = collection(firestore, 'coaches', coach.id, 'wallets', wallet.id, 'transactions');
      const newBalance = wallet.balance + topUpAmount;
      await addDoc(txnCol, {
        type: 'top-up',
        amount: topUpAmount,
        balanceAfter: newBalance,
        description: `Top up`,
        date: topUpDate,
        createdAt: serverTimestamp(),
      });
      await updateDoc(walletRef, {
        balance: increment(topUpAmount),
        updatedAt: serverTimestamp(),
      });
      showToast(`RM ${topUpAmount} added to ${wallet.name}`, 'success');
      setShowTopUp(false);
      setTopUpAmount(0);
    } catch {
      showToast('Failed to top up wallet', 'error');
    } finally {
      setToppingUp(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!coach || !db || !selectedStudent) return;
    setDeletingLogId(logId);
    try {
      const firestore = db as Firestore;

      // Find and reverse any wallet transaction for this lesson
      for (const walletDoc of wallets) {
        const txnQuery = query(
          collection(firestore, 'coaches', coach.id, 'wallets', walletDoc.id, 'transactions'),
          where('lessonLogId', '==', logId)
        );
        const txnSnap = await getDocs(txnQuery);
        if (!txnSnap.empty) {
          const originalTxn = txnSnap.docs[0].data();
          const refundAmount = Math.abs(originalTxn.amount);
          const newBalance = walletDoc.balance + refundAmount;
          const now = new Date();
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          await addDoc(collection(firestore, 'coaches', coach.id, 'wallets', walletDoc.id, 'transactions'), {
            type: 'refund',
            amount: refundAmount,
            balanceAfter: newBalance,
            description: `Reversed: ${originalTxn.description}`,
            studentId: originalTxn.studentId,
            date: dateStr,
            createdAt: serverTimestamp(),
          });
          await updateDoc(doc(firestore, 'coaches', coach.id, 'wallets', walletDoc.id), {
            balance: increment(refundAmount),
            updatedAt: serverTimestamp(),
          });
          break;
        }
      }

      await deleteDoc(doc(firestore, 'coaches', coach.id, 'lessonLogs', logId));
      showToast('Lesson deleted', 'success');
    } catch (error) {
      console.error('Error deleting lesson:', error);
      showToast('Failed to delete lesson', 'error');
    } finally {
      setDeletingLogId(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Students</h1>
          <p className="text-gray-600 dark:text-zinc-400 mt-1">
            {filtered.length} student{filtered.length !== 1 ? 's' : ''}{dayFilter !== 'all' || search ? ` (of ${students.length})` : ''}
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
            dayFilter === 'no-booking' ? 'All students have bookings.'
            : dayFilter !== 'all' ? `No students with bookings on ${(dayFilter as string).charAt(0).toUpperCase() + (dayFilter as string).slice(1)}.`
            : 'No students match your search.'
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((student) => {
            const dayInfo = dayFilter !== 'all' && dayFilter !== 'no-booking' ? dayToStudents.get(dayFilter as DayOfWeek)?.get(student.id) : null;
            const studentWallet = wallets.find((w) => w.studentIds.includes(student.id));

            return (
              <button
                key={student.id}
                onClick={() => openDetail(student)}
                className="text-left bg-white dark:bg-[#1f1f1f] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-[#333333] hover:border-blue-200 dark:hover:border-blue-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-zinc-100 truncate">
                      {(() => {
                        const linked = students.filter((s) => s.linkedToStudentId === student.id);
                        if (linked.length === 0) return student.clientName;
                        const names = [student.clientName, ...linked.map((s) => s.clientName)];
                        return names.length <= 2
                          ? names.join(' and ')
                          : names.slice(0, -1).join(', ') + ', ' + names[names.length - 1];
                      })()}
                    </p>
                    {dayInfo && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                        {formatTimeDisplay(dayInfo.startTime)} - {formatTimeDisplay(dayInfo.endTime)} &middot; {dayInfo.locationName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {student.linkedToStudentId && (() => {
                      const primary = students.find((s) => s.id === student.linkedToStudentId);
                      return primary ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          Linked to {primary.clientName}
                        </span>
                      ) : null;
                    })()}
                    {studentWallet ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        RM {studentWallet.balance.toFixed(0)}
                      </span>
                    ) : student.payPerLesson ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        Pay per lesson
                      </span>
                    ) : null}
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

            {/* Wallet section */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              {(() => {
                const wallet = wallets.find((w) => w.studentIds.includes(selectedStudent.id));
                if (wallet) {
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300">Wallet</h3>
                      </div>
                      <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{wallet.name}</p>
                          <p className={`text-xs font-medium mt-0.5 ${wallet.balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                            RM {wallet.balance.toFixed(2)}
                          </p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => {
                          const now = new Date();
                          setTopUpDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
                          setTopUpAmount(0);
                          setShowTopUp(true);
                        }}>
                          Top Up
                        </Button>
                      </div>
                      {showTopUp && (
                        <div className="bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#333333] rounded-lg p-4 space-y-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Top up wallet</p>
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              id="topUpAmount"
                              label="Amount (RM)"
                              type="number"
                              min={0}
                              value={String(topUpAmount)}
                              onChange={(e) => setTopUpAmount(Math.max(0, Number(e.target.value) || 0))}
                            />
                            <Input
                              id="topUpDate"
                              label="Date"
                              type="date"
                              value={topUpDate}
                              onChange={(e) => setTopUpDate(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" loading={toppingUp} onClick={handleWalletTopUp} disabled={topUpAmount <= 0}>
                              Confirm
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => { setShowTopUp(false); setTopUpAmount(0); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Wallet</h3>
                    <p className="text-sm text-gray-400 dark:text-zinc-500">
                      No wallet linked.{' '}
                      <span className="text-gray-500 dark:text-zinc-400">Create a wallet in the Payments tab and add this student.</span>
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Lesson rate (pay-per-lesson) */}
            {selectedStudent.payPerLesson && (
              <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300">Pay per Lesson</h3>
                  {!editingLessonRate && (
                    <button
                      onClick={() => { setEditLessonRate(selectedStudent.lessonRate ?? 0); setEditingLessonRate(true); }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {(selectedStudent.lessonRate ?? 0) > 0 ? 'Edit Rate' : 'Set Rate'}
                    </button>
                  )}
                </div>
                {editingLessonRate ? (
                  <div className="space-y-3">
                    <Input
                      id="editLessonRate"
                      label="Rate per Lesson (RM)"
                      type="number"
                      value={String(editLessonRate)}
                      onChange={(e) => setEditLessonRate(Math.max(0, Number(e.target.value) || 0))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" loading={savingLessonRate} onClick={async () => {
                        if (!coach || !db || !selectedStudent) return;
                        setSavingLessonRate(true);
                        try {
                          await updateDoc(doc(db as Firestore, 'coaches', coach.id, 'students', selectedStudent.id), {
                            lessonRate: editLessonRate,
                            updatedAt: serverTimestamp(),
                          });
                          setSelectedStudent((prev) => prev ? { ...prev, lessonRate: editLessonRate } : null);
                          setEditingLessonRate(false);
                          showToast('Lesson rate updated!', 'success');
                        } catch {
                          showToast('Failed to update rate', 'error');
                        } finally {
                          setSavingLessonRate(false);
                        }
                      }}>
                        Save
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditingLessonRate(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (selectedStudent.lessonRate ?? 0) > 0 ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-zinc-400">Rate per lesson</span>
                    <span className="font-medium text-gray-900 dark:text-zinc-100">RM {selectedStudent.lessonRate}</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-zinc-500">No rate set.</p>
                )}
              </div>
            )}

            {/* Portal link */}
            <div className="border-t border-gray-100 dark:border-[#333333] pt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Student Portal Link
              </h3>
              <Button variant="secondary" size="sm" onClick={copyPortalLink}>
                {copied ? 'Copied!' : 'Copy Portal Link'}
              </Button>
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
                Lesson History {!logsLoading && `(${studentLogs.length})`}
              </h3>
              {logsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : studentLogs.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500">No lessons recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {studentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-[#1a1a1a]/50 rounded"
                    >
                      <div>
                        <p className="text-gray-900 dark:text-zinc-100">{formatDateMedium(parseDateString(log.date))}</p>
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
                          onClick={() => setConfirmDeleteLogId(log.id)}
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
                  {studentLogs.length >= logLimit && (
                  <button
                    onClick={() => setLogLimit(logLimit + 20)}
                    className="w-full text-center py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Load more
                  </button>
                  )}
                </div>
              )}
            </div>

            {/* Delete lesson confirmation modal */}
            <Modal
              isOpen={!!confirmDeleteLogId}
              onClose={() => setConfirmDeleteLogId(null)}
              title="Delete Lesson"
            >
              <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4">
                Are you sure? This will delete the lesson log and refund the wallet charge if applicable.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setConfirmDeleteLogId(null)}>Cancel</Button>
                <Button
                  variant="danger"
                  loading={!!deletingLogId}
                  onClick={async () => {
                    if (confirmDeleteLogId) {
                      await handleDeleteLog(confirmDeleteLogId);
                      setConfirmDeleteLogId(null);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </Modal>

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

    </div>
  );
}

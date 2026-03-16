'use client';

import { useState, useMemo } from 'react';
import { collection, doc, writeBatch, serverTimestamp, increment, getDoc, updateDoc, deleteDoc, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings, useLessonLogs, useClassExceptions, useStudents } from '@/hooks/useCoachData';
import { Button, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Booking, Student } from '@/types';
import { formatTimeDisplay } from '@/lib/availability-engine';
import { findOrCreateStudent } from '@/lib/students';
import { getClassesForDate, isRescheduledToDate, getCancelledClassesForDate } from '@/lib/class-schedule';

function getDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getWeekDates(referenceDate: Date): Date[] {
  const day = referenceDate.getDay();
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() - (day === 0 ? 6 : day - 1));
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DashboardPage() {
  const { coach } = useAuth();
  const { locations } = useLocations(coach?.id);
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const { classExceptions } = useClassExceptions(coach?.id);
  const { students } = useStudents(coach?.id);
  const { showToast } = useToast();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState('');
  const [rescheduleEndTime, setRescheduleEndTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [undoingCancel, setUndoingCancel] = useState<string | null>(null);
  const [markDoneBooking, setMarkDoneBooking] = useState<Booking | null>(null);
  const [markDonePrice, setMarkDonePrice] = useState(0);
  const [markDoneNote, setMarkDoneNote] = useState('');
  const [markDoneAttendees, setMarkDoneAttendees] = useState<Array<{
    studentId: string;
    studentName: string;
    attended: boolean;
    price: number;
    isPrimary: boolean;
  }>>([]);
  const [packageWarning, setPackageWarning] = useState<{
    studentName: string;
    remaining: number;
    total: number;
    lastPrice: number;
    credit: number;
  } | null>(null);

  // Add Class modal state
  const [showAddClass, setShowAddClass] = useState(false);
  const [addClassDate, setAddClassDate] = useState('');
  const [addClassLocationId, setAddClassLocationId] = useState('');
  const [addClassStartTime, setAddClassStartTime] = useState('');
  const [addClassEndTime, setAddClassEndTime] = useState('');
  const [addClassNote, setAddClassNote] = useState('');
  const [addClassSearch, setAddClassSearch] = useState('');
  const [addClassSelectedStudents, setAddClassSelectedStudents] = useState<Array<{
    studentId: string;
    displayName: string;
    price: number;
  }>>([]);
  const [addingClass, setAddingClass] = useState(false);

  const selectedDateStr = getDateString(selectedDate);
  const todayStr = getDateString(new Date());
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const { lessonLogs } = useLessonLogs(coach?.id, selectedDateStr);

  const dayClasses = useMemo(() => {
    return getClassesForDate(selectedDateStr, bookings, classExceptions);
  }, [selectedDateStr, bookings, classExceptions]);

  const cancelledClasses = useMemo(() => {
    return getCancelledClassesForDate(selectedDateStr, bookings, classExceptions);
  }, [selectedDateStr, bookings, classExceptions]);

  const doneBookingIds = useMemo(() => {
    return new Set(lessonLogs.map((l) => l.bookingId));
  }, [lessonLogs]);

  // Ad-hoc lesson logs (no bookingId) for display
  const adHocLogs = useMemo(() => {
    return lessonLogs.filter((l) => !l.bookingId);
  }, [lessonLogs]);

  // Group ad-hoc logs by time+location for display as cards
  const adHocGroups = useMemo(() => {
    const groups: Record<string, typeof adHocLogs> = {};
    for (const log of adHocLogs) {
      const key = `${log.startTime}-${log.endTime}-${log.locationName}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    }
    return Object.values(groups);
  }, [adHocLogs]);

  // Build selectable student list for Add Class (all students individually)
  const selectableStudentList = useMemo(() => {
    return students.map((s) => ({
      studentId: s.id,
      displayName: s.clientName,
      clientName: s.clientName,
    }));
  }, [students]);

  const filteredStudentList = useMemo(() => {
    if (!addClassSearch.trim()) return selectableStudentList;
    const q = addClassSearch.toLowerCase();
    return selectableStudentList.filter((s) => s.displayName.toLowerCase().includes(q));
  }, [selectableStudentList, addClassSearch]);

  const openMarkDone = (booking: Booking) => {
    setMarkDoneBooking(booking);
    setMarkDonePrice(booking.price ?? 0);
    setMarkDoneNote('');
    setMenuOpen(null);

    // Build attendees list: primary + linked students
    const attendees: typeof markDoneAttendees = [];
    // Primary student (from booking client info)
    const primaryStudent = students.find(
      (s) => s.clientName === booking.clientName && s.clientPhone === (booking.clientPhone || '')
    );
    if (primaryStudent) {
      const studentPrice = booking.studentPrices?.[primaryStudent.id] ?? booking.price ?? 0;
      attendees.push({
        studentId: primaryStudent.id,
        studentName: primaryStudent.clientName,
        attended: true,
        price: studentPrice,
        isPrimary: true,
      });
    }
    // Linked students
    if (booking.linkedStudentIds?.length) {
      for (const linkedId of booking.linkedStudentIds) {
        const ls = students.find((s) => s.id === linkedId);
        if (ls) {
          const studentPrice = booking.studentPrices?.[ls.id] ?? 0;
          attendees.push({
            studentId: ls.id,
            studentName: ls.clientName,
            attended: true,
            price: studentPrice,
            isPrimary: false,
          });
        }
      }
    }
    setMarkDoneAttendees(attendees);
  };

  const handleConfirmMarkDone = async () => {
    const booking = markDoneBooking;
    if (!coach || !db || !booking) return;
    setMarking(booking.id);
    try {
      const firestore = db as Firestore;
      const hasLinkedStudents = markDoneAttendees.length > 1;

      // Determine which students to process
      const attendeesToProcess = hasLinkedStudents
        ? markDoneAttendees.filter((a) => a.attended)
        : [{ studentId: '', studentName: booking.clientName, attended: true, price: markDonePrice, isPrimary: true }];

      const batch = writeBatch(firestore);
      const processedStudents: Array<{ studentId: string; studentName: string; price: number }> = [];

      for (const attendee of attendeesToProcess) {
        // Resolve student ID
        const studentId = attendee.studentId || await findOrCreateStudent(
          firestore, coach.id, booking.clientName, booking.clientPhone
        );
        const price = hasLinkedStudents ? attendee.price : markDonePrice;

        const logRef = doc(collection(firestore, 'coaches', coach.id, 'lessonLogs'));
        const logData: Record<string, unknown> = {
          date: selectedDateStr,
          bookingId: booking.id,
          studentId,
          studentName: attendee.studentName,
          locationName: booking.locationName,
          startTime: booking.startTime,
          endTime: booking.endTime,
          price,
          createdAt: serverTimestamp(),
        };
        if (markDoneNote.trim()) {
          logData.note = markDoneNote.trim();
        }
        batch.set(logRef, logData);

        const studentRef = doc(firestore, 'coaches', coach.id, 'students', studentId);
        const updateData: Record<string, unknown> = {
          prepaidUsed: increment(1),
          updatedAt: serverTimestamp(),
        };

        // For split payment, compare against the student's own price, not the total
        const studentBasePrice = (hasLinkedStudents && booking.studentPrices?.[studentId] != null)
          ? booking.studentPrices[studentId]
          : (booking.price ?? 0);
        if (price < studentBasePrice && studentBasePrice > 0) {
          updateData.credit = increment(studentBasePrice - price);
        }

        const studentRecord = students.find((s) => s.id === studentId);
        if (studentRecord?.payPerLesson && price > 0) {
          updateData.pendingPayment = increment(price);
        }

        batch.update(studentRef, updateData);
        processedStudents.push({ studentId, studentName: attendee.studentName, price });
      }

      await batch.commit();
      setMarkDoneBooking(null);
      showToast('Class marked as done!', 'success');

      // Check package status for each processed student
      for (const { studentId, studentName, price } of processedStudents) {
        const student = students.find((s) => s.id === studentId);
        if (student && student.prepaidTotal > 0) {
          const remainingAfter = student.prepaidTotal - (student.prepaidUsed + 1);
          if (remainingAfter <= 0) {
            const perLessonPrice = (booking.studentPrices?.[studentId] != null)
              ? booking.studentPrices[studentId]
              : (booking.price ?? 0);
            const packagePrice = perLessonPrice * student.prepaidTotal;
            const currentCredit = (student.credit ?? 0) + (price < perLessonPrice ? perLessonPrice - price : 0);

            const paymentAmount = Math.max(0, packagePrice - currentCredit);
            if (paymentAmount > 0) {
              const studentPayRef = doc(firestore, 'coaches', coach.id, 'students', studentId);
              await updateDoc(studentPayRef, {
                pendingPayment: paymentAmount,
                credit: 0,
                updatedAt: serverTimestamp(),
              });
            }

            setPackageWarning({
              studentName,
              remaining: remainingAfter,
              total: student.prepaidTotal,
              lastPrice: packagePrice,
              credit: currentCredit,
            });
            break; // show one warning at a time
          }
        }
      }
    } catch (error) {
      console.error('Error marking class done:', error);
      showToast('Failed to mark class as done', 'error');
    } finally {
      setMarking(null);
    }
  };

  const handleCancel = async (booking: Booking) => {
    if (!coach || !db) return;
    setCancelling(booking.id);
    try {
      const firestore = db as Firestore;
      const exRef = doc(collection(firestore, 'coaches', coach.id, 'classExceptions'));
      const batch = writeBatch(firestore);
      batch.set(exRef, {
        bookingId: booking.id,
        originalDate: selectedDateStr,
        type: 'cancelled',
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      showToast('Class cancelled for this date', 'success');
    } catch (error) {
      console.error('Error cancelling class:', error);
      showToast('Failed to cancel class', 'error');
    } finally {
      setCancelling(null);
      setMenuOpen(null);
    }
  };

  const handleReschedule = async () => {
    if (!coach || !db || !rescheduleBooking || !rescheduleDate) return;
    if (rescheduleDate === selectedDateStr && rescheduleStartTime === rescheduleBooking.startTime && rescheduleEndTime === rescheduleBooking.endTime) {
      showToast('Must change date or time', 'error');
      return;
    }
    setRescheduling(true);
    try {
      const firestore = db as Firestore;
      const exRef = doc(collection(firestore, 'coaches', coach.id, 'classExceptions'));
      const batch = writeBatch(firestore);
      const exData: Record<string, unknown> = {
        bookingId: rescheduleBooking.id,
        originalDate: selectedDateStr,
        type: 'rescheduled',
        newDate: rescheduleDate,
        createdAt: serverTimestamp(),
      };
      if (rescheduleStartTime !== rescheduleBooking.startTime || rescheduleEndTime !== rescheduleBooking.endTime) {
        exData.newStartTime = rescheduleStartTime;
        exData.newEndTime = rescheduleEndTime;
      }
      batch.set(exRef, exData);
      await batch.commit();
      showToast('Class rescheduled!', 'success');
      setRescheduleBooking(null);
      setRescheduleDate('');
    } catch (error) {
      console.error('Error rescheduling class:', error);
      showToast('Failed to reschedule class', 'error');
    } finally {
      setRescheduling(false);
    }
  };

  const handleUndoCancel = async (exceptionId: string) => {
    if (!coach || !db) return;
    setUndoingCancel(exceptionId);
    try {
      const firestore = db as Firestore;
      await deleteDoc(doc(firestore, 'coaches', coach.id, 'classExceptions', exceptionId));
      showToast('Cancellation undone', 'success');
    } catch (error) {
      console.error('Error undoing cancel:', error);
      showToast('Failed to undo cancellation', 'error');
    } finally {
      setUndoingCancel(null);
    }
  };

  const handleRescheduleInstead = async (exceptionId: string, booking: Booking) => {
    if (!coach || !db) return;
    setUndoingCancel(exceptionId);
    try {
      const firestore = db as Firestore;
      await deleteDoc(doc(firestore, 'coaches', coach.id, 'classExceptions', exceptionId));
      // Open reschedule modal pre-filled
      setRescheduleBooking(booking);
      setRescheduleDate(selectedDateStr);
      setRescheduleStartTime(booking.startTime);
      setRescheduleEndTime(booking.endTime);
    } catch (error) {
      console.error('Error removing cancellation:', error);
      showToast('Failed to undo cancellation', 'error');
    } finally {
      setUndoingCancel(null);
    }
  };

  const openAddClass = () => {
    setAddClassDate(selectedDateStr);
    setAddClassLocationId(locations[0]?.id || '');
    setAddClassStartTime('');
    setAddClassEndTime('');
    setAddClassNote('');
    setAddClassSearch('');
    setAddClassSelectedStudents([]);
    setShowAddClass(true);
  };

  const toggleAddClassStudent = (student: { studentId: string; displayName: string }) => {
    setAddClassSelectedStudents((prev) => {
      const exists = prev.find((s) => s.studentId === student.studentId);
      if (exists) return prev.filter((s) => s.studentId !== student.studentId);
      return [...prev, { studentId: student.studentId, displayName: student.displayName, price: 0 }];
    });
  };

  const handleAddClass = async () => {
    if (!coach || !db || !addClassLocationId || addClassSelectedStudents.length === 0) return;
    setAddingClass(true);
    try {
      const firestore = db as Firestore;
      const location = locations.find((l) => l.id === addClassLocationId);
      const locationName = location?.name || '';
      const batch = writeBatch(firestore);
      const processedStudents: Array<{ studentId: string; studentName: string; price: number }> = [];

      for (const selected of addClassSelectedStudents) {
        const logRef = doc(collection(firestore, 'coaches', coach.id, 'lessonLogs'));
        const primaryStudent = students.find((s) => s.id === selected.studentId);
        const studentName = primaryStudent?.clientName || selected.displayName;

        const logData: Record<string, unknown> = {
          date: addClassDate,
          studentId: selected.studentId,
          studentName,
          locationName,
          startTime: addClassStartTime,
          endTime: addClassEndTime,
          price: selected.price,
          createdAt: serverTimestamp(),
        };
        if (addClassNote.trim()) {
          logData.note = addClassNote.trim();
        }
        batch.set(logRef, logData);

        const studentRef = doc(firestore, 'coaches', coach.id, 'students', selected.studentId);
        const updateData: Record<string, unknown> = {
          prepaidUsed: increment(1),
          updatedAt: serverTimestamp(),
        };

        // Credit calculation: if price is lower than student's standard rate
        const studentBasePrice = primaryStudent?.lessonRate ?? 0;
        if (selected.price < studentBasePrice && studentBasePrice > 0) {
          updateData.credit = increment(studentBasePrice - selected.price);
        }

        if (primaryStudent?.payPerLesson && selected.price > 0) {
          updateData.pendingPayment = increment(selected.price);
        }
        batch.update(studentRef, updateData);
        processedStudents.push({ studentId: selected.studentId, studentName, price: selected.price });
      }

      await batch.commit();
      setShowAddClass(false);
      showToast('Ad-hoc class logged!', 'success');

      // Check package exhaustion
      for (const { studentId, studentName, price } of processedStudents) {
        const student = students.find((s) => s.id === studentId);
        if (student && student.prepaidTotal > 0) {
          const remainingAfter = student.prepaidTotal - (student.prepaidUsed + 1);
          if (remainingAfter <= 0) {
            const perLessonPrice = price;
            const packagePrice = perLessonPrice * student.prepaidTotal;
            const currentCredit = student.credit ?? 0;

            setPackageWarning({
              studentName,
              remaining: remainingAfter,
              total: student.prepaidTotal,
              lastPrice: packagePrice,
              credit: currentCredit,
            });
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error adding ad-hoc class:', error);
      showToast('Failed to add class', 'error');
    } finally {
      setAddingClass(false);
    }
  };

  const navigateWeek = (direction: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + direction * 7);
    setSelectedDate(d);
  };

  const publicUrl = coach ? `${window.location.origin}/${coach.slug}` : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      showToast('Link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy link', 'error');
    }
  };

  if (!coach) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const formattedDate = selectedDate.toLocaleDateString('en-MY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Week navigation */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigateWeek(-1)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setSelectedDate(new Date())}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Today
          </button>
          <button
            onClick={() => navigateWeek(1)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDates.map((date, i) => {
            const dateStr = getDateString(date);
            const isSelected = dateStr === selectedDateStr;
            const isToday = dateStr === todayStr;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center py-2 px-1 rounded-lg text-sm transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isToday
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-[#2a2a2a]'
                }`}
              >
                <span className="text-xs font-medium">{SHORT_DAYS[i]}</span>
                <span className={`text-lg font-semibold ${isSelected ? '' : ''}`}>
                  {date.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">{formattedDate}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            {dayClasses.length} class{dayClasses.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={openAddClass}>
          + Add Class
        </Button>
      </div>

      {/* Classes list */}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
        {dayClasses.length === 0 ? (
          <div className="p-6 text-center text-gray-400 dark:text-zinc-500">
            No classes scheduled for this date.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#333333]">
            {dayClasses.map((booking) => {
              const isDone = doneBookingIds.has(booking.id);
              const isRescheduled = isRescheduledToDate(booking.id, selectedDateStr, classExceptions);

              return (
                <div
                  key={booking.id}
                  className={`flex items-center gap-3 p-4 sm:p-5 ${isDone ? 'opacity-50' : ''}`}
                >
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    {isDone ? (
                      <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-zinc-100">
                        {formatTimeDisplay(booking.startTime)} – {formatTimeDisplay(booking.endTime)}
                      </span>
                      {isDone && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          Done
                        </span>
                      )}
                      {isRescheduled && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          Rescheduled
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mt-0.5">
                      {booking.linkedStudentIds?.length
                        ? (() => {
                            const names = [booking.clientName, ...booking.linkedStudentIds.map((id) => students.find((s) => s.id === id)?.clientName).filter(Boolean) as string[]];
                            return names.length <= 2
                              ? names.join(' and ')
                              : names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
                          })()
                        : booking.clientName}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">{booking.locationName}</p>
                  </div>

                  {/* Price + type */}
                  <div className="text-right flex-shrink-0">
                    {(booking.price ?? 0) > 0 && (
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        RM {booking.price}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                      {booking.lessonType === 'group' ? `Group (${booking.groupSize})` : 'Private'}
                    </p>
                  </div>

                  {/* Actions menu */}
                  {!isDone && (
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setMenuOpen(menuOpen === booking.id ? null : booking.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-[#2a2a2a]"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </svg>
                      </button>

                      {menuOpen === booking.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                          <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-gray-200 dark:border-[#444] py-1">
                            <button
                              onClick={() => openMarkDone(booking)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#333]"
                            >
                              Mark Done
                            </button>
                            <button
                              onClick={() => {
                                setRescheduleBooking(booking);
                                setRescheduleDate(selectedDateStr);
                                setRescheduleStartTime(booking.startTime);
                                setRescheduleEndTime(booking.endTime);
                                setMenuOpen(null);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#333]"
                            >
                              Reschedule
                            </button>
                            <button
                              onClick={() => handleCancel(booking)}
                              disabled={cancelling === booking.id}
                              className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-[#333] disabled:opacity-50"
                            >
                              {cancelling === booking.id ? 'Cancelling...' : 'Cancel This Date'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancelled classes */}
      {cancelledClasses.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
            Cancelled
          </p>
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] opacity-60">
            <div className="divide-y divide-gray-100 dark:divide-[#333333]">
              {cancelledClasses.map(({ booking, exceptionId }) => (
                <div key={exceptionId} className="flex items-center gap-3 p-4 sm:p-5">
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-zinc-100">
                        {formatTimeDisplay(booking.startTime)} – {formatTimeDisplay(booking.endTime)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        Cancelled
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mt-0.5">{booking.clientName}</p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">{booking.locationName}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleUndoCancel(exceptionId)}
                      disabled={undoingCancel === exceptionId}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                    >
                      {undoingCancel === exceptionId ? 'Undoing...' : 'Undo'}
                    </button>
                    <button
                      onClick={() => handleRescheduleInstead(exceptionId, booking)}
                      disabled={undoingCancel === exceptionId}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ad-hoc classes */}
      {adHocGroups.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
            Ad-hoc Classes
          </p>
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
            <div className="divide-y divide-gray-100 dark:divide-[#333333]">
              {adHocGroups.map((group, i) => (
                <div key={i} className="flex items-center gap-3 p-4 sm:p-5 opacity-50">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-zinc-100">
                        {group[0].startTime && group[0].endTime
                          ? `${formatTimeDisplay(group[0].startTime)} – ${formatTimeDisplay(group[0].endTime)}`
                          : 'No time set'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        Done
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        Ad-hoc
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mt-0.5">
                      {group.map((l) => l.studentName).join(', ')}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">{group[0].locationName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {group.reduce((sum, l) => sum + l.price, 0) > 0 && (
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        RM {group.reduce((sum, l) => sum + l.price, 0)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-[#333333]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-zinc-400">Active Bookings</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{bookings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-[#333333]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-zinc-400">Locations</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{locations.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl p-6 shadow-sm border border-gray-100 dark:border-[#333333]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-zinc-400">Public Link</p>
              <Button variant="ghost" size="sm" onClick={copyLink} className="-ml-3">
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      {locations.length === 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-xl p-6">
          <h3 className="font-medium text-yellow-800 dark:text-yellow-300 mb-2">Get Started</h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-4">
            Add your first location to start accepting bookings.
          </p>
          <Button onClick={() => (window.location.href = '/dashboard/locations')}>
            Add Location
          </Button>
        </div>
      )}

      {/* Reschedule modal */}
      <Modal
        isOpen={rescheduleBooking !== null}
        onClose={() => setRescheduleBooking(null)}
        title="Reschedule Class"
      >
        {rescheduleBooking && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-3">
              <p className="font-medium text-gray-900 dark:text-zinc-100">
                {rescheduleBooking.clientName}
              </p>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                {formatTimeDisplay(rescheduleBooking.startTime)} – {formatTimeDisplay(rescheduleBooking.endTime)} &middot; {rescheduleBooking.locationName}
              </p>
              <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">
                Original date: {selectedDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>

            <Input
              id="rescheduleDate"
              label="New Date"
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="rescheduleStartTime"
                label="Start Time"
                type="time"
                value={rescheduleStartTime}
                onChange={(e) => setRescheduleStartTime(e.target.value)}
              />
              <Input
                id="rescheduleEndTime"
                label="End Time"
                type="time"
                value={rescheduleEndTime}
                onChange={(e) => setRescheduleEndTime(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setRescheduleBooking(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleReschedule}
                loading={rescheduling}
                disabled={!rescheduleDate}
              >
                Reschedule
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Mark Done confirmation modal */}
      <Modal
        isOpen={markDoneBooking !== null}
        onClose={() => setMarkDoneBooking(null)}
        title="Mark Class Done"
      >
        {markDoneBooking && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-3">
              <p className="font-medium text-gray-900 dark:text-zinc-100">
                {markDoneBooking.clientName}
              </p>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                {formatTimeDisplay(markDoneBooking.startTime)} – {formatTimeDisplay(markDoneBooking.endTime)} &middot; {markDoneBooking.locationName}
              </p>
            </div>

            {markDoneAttendees.length > 1 ? (
              // Per-student attendance for group with linked students
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Attendance & Pricing</p>
                {markDoneAttendees.map((attendee, idx) => (
                  <div key={attendee.studentId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#1a1a1a] rounded-lg">
                    <input
                      type="checkbox"
                      checked={attendee.attended}
                      onChange={(e) => {
                        const updated = [...markDoneAttendees];
                        updated[idx] = { ...updated[idx], attended: e.target.checked };
                        setMarkDoneAttendees(updated);
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-zinc-100">
                        {attendee.studentName}
                        {!attendee.isPrimary && (
                          <span className="text-xs text-purple-600 dark:text-purple-400 ml-1">(linked)</span>
                        )}
                      </p>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        value={attendee.price}
                        onChange={(e) => {
                          const updated = [...markDoneAttendees];
                          updated[idx] = { ...updated[idx], price: parseFloat(e.target.value) || 0 };
                          setMarkDoneAttendees(updated);
                        }}
                        disabled={!attendee.attended}
                        className="block w-full px-2 py-1 text-sm border border-gray-300 dark:border-zinc-500 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 disabled:opacity-40"
                        placeholder="RM"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Single student — original price input
              <>
                <Input
                  id="markDonePrice"
                  type="number"
                  label="Price (RM)"
                  value={markDonePrice.toString()}
                  onChange={(e) => setMarkDonePrice(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />

                {markDonePrice < (markDoneBooking.price ?? 0) && (markDoneBooking.price ?? 0) > 0 && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    RM {((markDoneBooking.price ?? 0) - markDonePrice).toFixed(0)} will be added as credit
                  </p>
                )}
              </>
            )}

            <div>
              <label htmlFor="markDoneNote" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Note (optional)
              </label>
              <input
                id="markDoneNote"
                value={markDoneNote}
                onChange={(e) => setMarkDoneNote(e.target.value)}
                placeholder="e.g. Aaron only"
                className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-sm"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setMarkDoneBooking(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmMarkDone}
                loading={marking === markDoneBooking.id}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Class modal */}
      <Modal
        isOpen={showAddClass}
        onClose={() => setShowAddClass(false)}
        title="Add Class"
      >
        <div className="space-y-4">
          <Input
            id="addClassDate"
            label="Date"
            type="date"
            value={addClassDate}
            onChange={(e) => setAddClassDate(e.target.value)}
          />

          <Select
            id="addClassLocation"
            label="Location"
            value={addClassLocationId}
            onChange={(e) => setAddClassLocationId(e.target.value)}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="addClassStartTime"
              label="Start Time"
              type="time"
              value={addClassStartTime}
              onChange={(e) => setAddClassStartTime(e.target.value)}
            />
            <Input
              id="addClassEndTime"
              label="End Time"
              type="time"
              value={addClassEndTime}
              onChange={(e) => setAddClassEndTime(e.target.value)}
            />
          </div>

          {/* Student selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Students
            </label>
            <input
              value={addClassSearch}
              onChange={(e) => setAddClassSearch(e.target.value)}
              placeholder="Search students..."
              className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-sm"
            />
            <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-zinc-600 rounded-lg divide-y divide-gray-100 dark:divide-[#333]">
              {filteredStudentList.length === 0 ? (
                <p className="p-3 text-sm text-gray-400 dark:text-zinc-500 text-center">No students found</p>
              ) : (
                filteredStudentList.map((student) => {
                  const isSelected = addClassSelectedStudents.some((s) => s.studentId === student.studentId);
                  return (
                    <label
                      key={student.studentId}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAddClassStudent(student)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-zinc-100">{student.displayName}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected students with prices */}
          {addClassSelectedStudents.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Pricing</p>
              {addClassSelectedStudents.map((selected, idx) => (
                <div key={selected.studentId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#1a1a1a] rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-zinc-100">{selected.displayName}</p>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      value={selected.price}
                      onChange={(e) => {
                        const updated = [...addClassSelectedStudents];
                        updated[idx] = { ...updated[idx], price: parseFloat(e.target.value) || 0 };
                        setAddClassSelectedStudents(updated);
                      }}
                      className="block w-full px-2 py-1 text-sm border border-gray-300 dark:border-zinc-500 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
                      placeholder="RM"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <label htmlFor="addClassNote" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Note (optional)
            </label>
            <input
              id="addClassNote"
              value={addClassNote}
              onChange={(e) => setAddClassNote(e.target.value)}
              placeholder="e.g. Combined group session"
              className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowAddClass(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddClass}
              loading={addingClass}
              disabled={!addClassLocationId || addClassSelectedStudents.length === 0}
            >
              Add Class
            </Button>
          </div>
        </div>
      </Modal>

      {/* Package warning modal */}
      <Modal
        isOpen={packageWarning !== null}
        onClose={() => setPackageWarning(null)}
        title="Package Finished"
      >
        {packageWarning && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-medium">{packageWarning.studentName}</span>
                {packageWarning.remaining === 0
                  ? ' has used all lessons in their package.'
                  : ` is ${Math.abs(packageWarning.remaining)} lesson${Math.abs(packageWarning.remaining) !== 1 ? 's' : ''} over their package.`}
              </p>
            </div>
            {packageWarning.lastPrice > 0 && (
              <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-4">
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Next payment</p>
                {packageWarning.credit > 0 ? (
                  <>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 line-through">
                      RM {packageWarning.lastPrice}
                    </p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
                      RM {packageWarning.lastPrice - packageWarning.credit}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      RM {packageWarning.credit} credit applied
                    </p>
                  </>
                ) : (
                  <p className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
                    RM {packageWarning.lastPrice}
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                  Based on {packageWarning.total} lessons at RM {(packageWarning.lastPrice / packageWarning.total).toFixed(0)}/lesson
                </p>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setPackageWarning(null)}>
                Got it
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

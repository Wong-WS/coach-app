'use client';

import { useState, useMemo } from 'react';
import { collection, doc, writeBatch, serverTimestamp, increment, updateDoc, deleteDoc, addDoc, getDoc, Firestore, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings, useLessonLogs, useClassExceptions, useStudents, useWallets } from '@/hooks/useCoachData';
import { Button, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Booking } from '@/types';
import { formatTimeDisplay } from '@/lib/availability-engine';
import { findOrCreateStudent } from '@/lib/students';
import { getClassesForDate, isRescheduledToDate, getCancelledClassesForDate } from '@/lib/class-schedule';
import { formatDateFull, formatDateShort } from '@/lib/date-format';

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
  const { students } = useStudents(coach?.id);
  const { wallets } = useWallets(coach?.id);
  const { showToast } = useToast();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
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
  const [deletingAdHocGroup, setDeletingAdHocGroup] = useState<number | null>(null);

  // Unified Add Lesson form state
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonType, setLessonType] = useState<'one-time' | 'recurring'>('one-time');
  const [lessonMode, setLessonMode] = useState<'private' | 'group'>('private');
  const [lessonDate, setLessonDate] = useState('');
  const [lessonDayOfWeek, setLessonDayOfWeek] = useState<string>('monday');
  const [lessonLocationId, setLessonLocationId] = useState('');
  const [lessonStartTime, setLessonStartTime] = useState('09:00');
  const [lessonEndTime, setLessonEndTime] = useState('10:00');
  const [lessonNote, setLessonNote] = useState('');
  const [addingLesson, setAddingLesson] = useState(false);

  // Student rows for the unified form
  interface StudentRow {
    studentId: string;
    displayName: string;
    phone: string;
    isNew: boolean;
    walletOption: 'none' | 'existing' | 'create';
    existingWalletId: string;
    newWalletName: string;
    price: number;
  }
  const [studentRows, setStudentRows] = useState<StudentRow[]>([{
    studentId: '', displayName: '', phone: '', isNew: true,
    walletOption: 'none', existingWalletId: '', newWalletName: '', price: 0,
  }]);
  const [studentSearch, setStudentSearch] = useState('');

  // Overlap warning
  const [overlapWarning, setOverlapWarning] = useState('');

  // Edit booking modal state
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editLocationId, setEditLocationId] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editNote, setEditNote] = useState('');
  const [showEditSaveOptions, setShowEditSaveOptions] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const selectedDateStr = getDateString(selectedDate);
  const todayStr = getDateString(new Date());
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const { classExceptions } = useClassExceptions(coach?.id, selectedDateStr);
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
    if (!studentSearch.trim()) return selectableStudentList;
    const q = studentSearch.toLowerCase();
    return selectableStudentList.filter((s) => s.displayName.toLowerCase().includes(q));
  }, [selectableStudentList, studentSearch]);

  const generateTimeOptions = () => {
    const options: string[] = [];
    for (let h = 6; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return options;
  };

  const updateStudentRow = (index: number, updates: Partial<StudentRow>) => {
    setStudentRows(rows => rows.map((r, i) => i === index ? { ...r, ...updates } : r));
  };

  const resetLessonForm = () => {
    setLessonType('one-time');
    setLessonMode('private');
    setLessonDate(getDateString(selectedDate));
    setLessonDayOfWeek('monday');
    setLessonLocationId(locations[0]?.id || '');
    setLessonStartTime('09:00');
    setLessonEndTime('10:00');
    setLessonNote('');
    setStudentRows([{
      studentId: '', displayName: '', phone: '', isNew: true,
      walletOption: 'none', existingWalletId: '', newWalletName: '', price: 0,
    }]);
    setStudentSearch('');
    setOverlapWarning('');
  };

  const handleCreateLesson = async () => {
    if (!coach || !db || studentRows.length === 0 || !studentRows[0].displayName) return;
    setAddingLesson(true);
    try {
      const firestore = db as Firestore;
      const primaryRow = studentRows[0];

      // Resolve primary student
      const primaryStudentId = await findOrCreateStudent(
        firestore, coach.id, primaryRow.displayName, primaryRow.phone
      );

      // Create new wallet if needed, or link to existing
      let walletId: string | undefined;
      if (primaryRow.walletOption === 'create' && primaryRow.newWalletName && primaryStudentId) {
        const walletRef = await addDoc(collection(firestore, 'coaches', coach.id, 'wallets'), {
          name: primaryRow.newWalletName,
          balance: 0,
          studentIds: [primaryStudentId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        walletId = walletRef.id;
      } else if (primaryRow.walletOption === 'existing' && primaryRow.existingWalletId && primaryStudentId) {
        walletId = primaryRow.existingWalletId;
        const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', walletId);
        const walletSnap = await getDoc(walletRef);
        const currentIds: string[] = walletSnap.data()?.studentIds || [];
        if (!currentIds.includes(primaryStudentId)) {
          await updateDoc(walletRef, {
            studentIds: [...currentIds, primaryStudentId],
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Build booking data
      const dayOfWeek = lessonType === 'recurring'
        ? lessonDayOfWeek
        : ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(lessonDate).getDay()];

      const bookingData: Record<string, unknown> = {
        locationId: lessonLocationId,
        locationName: locations.find(l => l.id === lessonLocationId)?.name || '',
        dayOfWeek,
        startTime: lessonStartTime,
        endTime: lessonEndTime,
        status: 'confirmed',
        clientName: primaryRow.displayName,
        clientPhone: primaryRow.phone,
        lessonType: lessonMode,
        groupSize: lessonMode === 'group' ? studentRows.length : 1,
        notes: lessonNote,
        price: primaryRow.price,
        createdAt: serverTimestamp(),
      };

      // One-time: set startDate === endDate
      if (lessonType === 'one-time') {
        bookingData.startDate = lessonDate;
        bookingData.endDate = lessonDate;
      }

      // Attach wallet to booking if one was selected/created
      if (walletId) {
        bookingData.walletId = walletId;
      }

      await addDoc(collection(firestore, 'coaches', coach.id, 'bookings'), bookingData);

      // Touch the student record
      if (primaryStudentId) {
        await updateDoc(doc(firestore, 'coaches', coach.id, 'students', primaryStudentId), {
          updatedAt: serverTimestamp(),
        });
      }

      showToast('Lesson created!', 'success');
      setShowAddLesson(false);
      resetLessonForm();
    } catch (error) {
      console.error('Error creating lesson:', error);
      showToast('Failed to create lesson', 'error');
    } finally {
      setAddingLesson(false);
    }
  };

  const openMarkDone = (booking: Booking) => {
    setMarkDoneBooking(booking);
    setMarkDonePrice(booking.price ?? 0);
    setMarkDoneNote(booking.notes || '');
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

    const firestore = db as Firestore;
    const hasLinkedStudents = markDoneAttendees.length > 1;
    const noteText = markDoneNote.trim();
    const price = markDonePrice;

    // Close modal immediately (optimistic UI)
    setMarkDoneBooking(null);
    showToast('Class marked as done!', 'success');

    try {
      // Determine which students to process
      const attendeesToProcess = hasLinkedStudents
        ? markDoneAttendees.filter((a) => a.attended)
        : [{ studentId: markDoneAttendees[0]?.studentId || '', studentName: booking.clientName, attended: true, price, isPrimary: true }];

      // Resolve student IDs first (requires async lookup)
      const resolvedAttendees = await Promise.all(
        attendeesToProcess.map(async (attendee) => ({
          ...attendee,
          studentId: attendee.studentId || await findOrCreateStudent(
            firestore, coach.id, booking.clientName, booking.clientPhone
          ),
          price: hasLinkedStudents ? attendee.price : price,
        }))
      );

      const batch = writeBatch(firestore);

      for (const attendee of resolvedAttendees) {
        const logRef = doc(collection(firestore, 'coaches', coach.id, 'lessonLogs'));
        const logData: Record<string, unknown> = {
          date: selectedDateStr,
          bookingId: booking.id,
          studentId: attendee.studentId,
          studentName: attendee.studentName,
          locationName: booking.locationName,
          startTime: booking.startTime,
          endTime: booking.endTime,
          price: attendee.price,
          createdAt: serverTimestamp(),
        };
        if (noteText) {
          logData.note = noteText;
        }
        batch.set(logRef, logData);

        const studentRef = doc(firestore, 'coaches', coach.id, 'students', attendee.studentId);

        // Find wallet for this attendee
        const walletId = booking.studentWallets?.[attendee.studentId]
          || booking.walletId
          || wallets.find((w) => w.studentIds.includes(attendee.studentId))?.id;

        if (walletId && attendee.price > 0) {
          const wallet = wallets.find((w) => w.id === walletId);
          if (wallet) {
            const newBalance = wallet.balance - attendee.price;
            const txnRef = doc(collection(firestore, 'coaches', coach.id, 'wallets', walletId, 'transactions'));
            batch.set(txnRef, {
              type: 'charge',
              amount: -attendee.price,
              balanceAfter: newBalance,
              description: `Lesson — ${attendee.studentName} (${booking.startTime})`,
              studentId: attendee.studentId,
              lessonLogId: logRef.id,
              date: selectedDateStr,
              createdAt: serverTimestamp(),
            });
            const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', walletId);
            batch.update(walletRef, {
              balance: increment(-attendee.price),
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Still update student updatedAt timestamp
        batch.update(studentRef, { updatedAt: serverTimestamp() });
      }

      await batch.commit();

      // Post-commit: show wallet balance notification
      for (const attendee of resolvedAttendees) {
        const walletId = booking.studentWallets?.[attendee.studentId]
          || booking.walletId
          || wallets.find((w) => w.studentIds.includes(attendee.studentId))?.id;
        if (walletId) {
          const wallet = wallets.find((w) => w.id === walletId);
          if (wallet && wallet.balance - attendee.price < 0) {
            showToast(`${wallet.name} balance is now negative`, 'info');
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error marking class done:', error);
      showToast('Failed to mark class as done — please try again', 'error');
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

  const openEditBooking = (booking: Booking) => {
    setEditBooking(booking);
    setEditLocationId(booking.locationId);
    setEditStartTime(booking.startTime);
    setEditEndTime(booking.endTime);
    setEditPrice(booking.price ?? 0);
    setEditNote(booking.notes || '');
    setShowEditSaveOptions(false);
    setMenuOpen(null);
  };

  const hasEditChanges = () => {
    if (!editBooking) return false;
    return editLocationId !== editBooking.locationId ||
      editStartTime !== editBooking.startTime ||
      editEndTime !== editBooking.endTime ||
      editPrice !== (editBooking.price ?? 0) ||
      editNote !== (editBooking.notes || '');
  };

  const handleEditSave = async (mode: 'this' | 'all' | 'future') => {
    if (!coach || !db || !editBooking) return;
    if (!hasEditChanges()) {
      showToast('No changes to save', 'error');
      return;
    }
    setEditSaving(true);
    try {
      const firestore = db as Firestore;
      const newLocation = locations.find((l) => l.id === editLocationId);
      const newLocationName = newLocation?.name || editBooking.locationName;

      if (mode === 'this') {
        // Create a rescheduled exception for this date only
        const batch = writeBatch(firestore);
        // Cancel original on this date
        const exRef = doc(collection(firestore, 'coaches', coach.id, 'classExceptions'));
        batch.set(exRef, {
          bookingId: editBooking.id,
          originalDate: selectedDateStr,
          type: 'rescheduled',
          newDate: selectedDateStr,
          newStartTime: editStartTime,
          newEndTime: editEndTime,
          newLocationId: editLocationId,
          newLocationName: newLocationName,
          newPrice: editPrice,
          newNote: editNote,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        showToast('Updated for this date', 'success');
      } else if (mode === 'all') {
        // Update the booking directly
        await updateDoc(doc(firestore, 'coaches', coach.id, 'bookings', editBooking.id), {
          locationId: editLocationId,
          locationName: newLocationName,
          startTime: editStartTime,
          endTime: editEndTime,
          price: editPrice,
          notes: editNote,
          updatedAt: serverTimestamp(),
        });
        showToast('All events updated', 'success');
      } else if (mode === 'future') {
        const batch = writeBatch(firestore);
        // End old booking the day before the selected date
        const oldBookingRef = doc(firestore, 'coaches', coach.id, 'bookings', editBooking.id);
        const prevDay = new Date(selectedDate);
        prevDay.setDate(prevDay.getDate() - 1);
        batch.update(oldBookingRef, {
          endDate: getDateString(prevDay),
          updatedAt: serverTimestamp(),
        });
        // Create new booking starting from selected date
        const newBookingRef = doc(collection(firestore, 'coaches', coach.id, 'bookings'));
        batch.set(newBookingRef, {
          locationId: editLocationId,
          locationName: newLocationName,
          dayOfWeek: editBooking.dayOfWeek,
          startTime: editStartTime,
          endTime: editEndTime,
          status: 'confirmed',
          clientName: editBooking.clientName,
          clientPhone: editBooking.clientPhone,
          lessonType: editBooking.lessonType,
          groupSize: editBooking.groupSize,
          notes: editNote,
          price: editPrice,
          linkedStudentIds: editBooking.linkedStudentIds ?? null,
          studentPrices: editBooking.studentPrices ?? null,
          startDate: selectedDateStr,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        showToast('Future events updated', 'success');
      }
      setEditBooking(null);
      setShowEditSaveOptions(false);
    } catch (error) {
      console.error('Error editing booking:', error);
      showToast('Failed to update', 'error');
    } finally {
      setEditSaving(false);
    }
  };


  const handleDeleteAdHocGroup = async (group: typeof adHocLogs, groupIndex: number) => {
    if (!coach || !db) return;
    setDeletingAdHocGroup(groupIndex);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      for (const log of group) {
        // Delete the lesson log
        batch.delete(doc(firestore, 'coaches', coach.id, 'lessonLogs', log.id));

        // Find and reverse any wallet transaction for this lesson
        for (const walletDoc of wallets) {
          const txnQuery = query(
            collection(firestore, 'coaches', coach.id, 'wallets', walletDoc.id, 'transactions'),
            where('lessonLogId', '==', log.id)
          );
          const txnSnap = await getDocs(txnQuery);
          if (!txnSnap.empty) {
            const originalTxn = txnSnap.docs[0].data();
            const refundAmount = Math.abs(originalTxn.amount);
            const newBalance = walletDoc.balance + refundAmount;
            await addDoc(collection(firestore, 'coaches', coach.id, 'wallets', walletDoc.id, 'transactions'), {
              type: 'refund',
              amount: refundAmount,
              balanceAfter: newBalance,
              description: `Reversed: ${originalTxn.description}`,
              studentId: originalTxn.studentId,
              date: getDateString(new Date()),
              createdAt: serverTimestamp(),
            });
            await updateDoc(doc(firestore, 'coaches', coach.id, 'wallets', walletDoc.id), {
              balance: increment(refundAmount),
              updatedAt: serverTimestamp(),
            });
            break;
          }
        }

        // Update student timestamp only
        if (students.find((s) => s.id === log.studentId)) {
          batch.update(doc(firestore, 'coaches', coach.id, 'students', log.studentId), {
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      showToast('Ad-hoc class deleted', 'success');
    } catch (error) {
      console.error('Error deleting ad-hoc class:', error);
      showToast('Failed to delete class', 'error');
    } finally {
      setDeletingAdHocGroup(null);
    }
  };

  const navigateWeek = (direction: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + direction * 7);
    setSelectedDate(d);
  };

  if (!coach) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const formattedDate = formatDateFull(selectedDate);

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
        <Button variant="secondary" size="sm" onClick={() => { resetLessonForm(); setShowAddLesson(true); }}>
          + Add Lesson
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
                      <div className="flex items-center gap-1.5">
                        {!(booking.startDate && booking.startDate === booking.endDate) && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0">
                            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-9.624-2.848a5.5 5.5 0 019.201-2.466l.312.311H12.768a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V3.537a.75.75 0 00-1.5 0v2.033l-.312-.311A7 7 0 003.628 8.397a.75.75 0 001.449.39z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span className="font-medium text-gray-900 dark:text-zinc-100">
                          {formatTimeDisplay(booking.startTime)} – {formatTimeDisplay(booking.endTime)}
                        </span>
                      </div>
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
                    <p className="text-xs text-gray-400 dark:text-zinc-500 truncate">
                      {booking.locationName}{booking.notes ? <span className="text-amber-500 dark:text-amber-400"> · {booking.notes}</span> : null}
                    </p>
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

                  {/* Duplicate button for done bookings */}
                  {isDone && (
                    <button
                      onClick={() => {
                        const primaryStudent = students.find(
                          (s) => s.clientName === booking.clientName && s.clientPhone === (booking.clientPhone || '')
                        );
                        resetLessonForm();
                        setLessonType('one-time');
                        setLessonDate(selectedDateStr);
                        setLessonLocationId(booking.locationId || locations[0]?.id || '');
                        setLessonStartTime(booking.startTime || '09:00');
                        setLessonEndTime(booking.endTime || '10:00');
                        setLessonNote(booking.notes || '');
                        setStudentRows([{
                          studentId: primaryStudent?.id || '',
                          displayName: booking.clientName,
                          phone: booking.clientPhone || '',
                          isNew: !primaryStudent,
                          walletOption: 'none',
                          existingWalletId: '',
                          newWalletName: '',
                          price: booking.studentPrices?.[primaryStudent?.id || ''] ?? booking.price ?? 0,
                        }]);
                        setShowAddLesson(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-500 dark:text-zinc-500 dark:hover:text-blue-400 transition-colors flex-shrink-0"
                      title="Duplicate as ad-hoc class"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  )}

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
                              onClick={() => selectedDateStr <= todayStr && openMarkDone(booking)}
                              disabled={selectedDateStr > todayStr}
                              className={`w-full text-left px-3 py-2 text-sm ${
                                selectedDateStr > todayStr
                                  ? 'text-gray-400 dark:text-zinc-600 cursor-not-allowed'
                                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#333]'
                              }`}
                            >
                              Mark Done
                              {selectedDateStr > todayStr && (
                                <span className="block text-xs text-gray-400 dark:text-zinc-600">(future date)</span>
                              )}
                            </button>
                            <button
                              onClick={() => openEditBooking(booking)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#333]"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                const primaryStudent = students.find(
                                  (s) => s.clientName === booking.clientName && s.clientPhone === (booking.clientPhone || '')
                                );
                                resetLessonForm();
                                setLessonType('one-time');
                                setLessonDate(selectedDateStr);
                                setLessonLocationId(booking.locationId || locations[0]?.id || '');
                                setLessonStartTime(booking.startTime || '09:00');
                                setLessonEndTime(booking.endTime || '10:00');
                                setLessonNote(booking.notes || '');
                                setStudentRows([{
                                  studentId: primaryStudent?.id || '',
                                  displayName: booking.clientName,
                                  phone: booking.clientPhone || '',
                                  isNew: !primaryStudent,
                                  walletOption: 'none',
                                  existingWalletId: '',
                                  newWalletName: '',
                                  price: booking.studentPrices?.[primaryStudent?.id || ''] ?? booking.price ?? 0,
                                }]);
                                setShowAddLesson(true);
                                setMenuOpen(null);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#333]"
                            >
                              Duplicate
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
                    <p className="text-xs text-gray-400 dark:text-zinc-500 truncate">
                      {group[0].locationName}{group[0].note ? <span className="text-amber-500 dark:text-amber-400"> · {group[0].note}</span> : null}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    {group.reduce((sum, l) => sum + l.price, 0) > 0 && (
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        RM {group.reduce((sum, l) => sum + l.price, 0)}
                      </p>
                    )}
                    <button
                      onClick={() => {
                        const loc = locations.find((l) => l.name === group[0].locationName);
                        const firstLog = group[0];
                        resetLessonForm();
                        setLessonType('one-time');
                        setLessonDate(selectedDateStr);
                        setLessonLocationId(loc?.id || locations[0]?.id || '');
                        setLessonStartTime(firstLog.startTime || '09:00');
                        setLessonEndTime(firstLog.endTime || '10:00');
                        setLessonNote(firstLog.note || '');
                        setStudentRows([{
                          studentId: firstLog.studentId,
                          displayName: firstLog.studentName,
                          phone: '',
                          isNew: false,
                          walletOption: 'none',
                          existingWalletId: '',
                          newWalletName: '',
                          price: firstLog.price,
                        }]);
                        setShowAddLesson(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-500 dark:text-zinc-500 dark:hover:text-blue-400 transition-colors"
                      title="Duplicate ad-hoc class"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteAdHocGroup(group, i)}
                      disabled={deletingAdHocGroup === i}
                      className="p-1.5 text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                      title="Delete ad-hoc class"
                    >
                      {deletingAdHocGroup === i ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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
                Original date: {formatDateFull(selectedDate)}
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

      {/* Edit Booking modal */}
      <Modal
        isOpen={editBooking !== null}
        onClose={() => { setEditBooking(null); setShowEditSaveOptions(false); }}
        title="Edit Class"
      >
        {editBooking && !showEditSaveOptions && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-3">
              <p className="font-medium text-gray-900 dark:text-zinc-100">
                {editBooking.clientName}
              </p>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                {formatDateFull(selectedDate)}
              </p>
            </div>

            <Select
              id="editLocation"
              label="Location"
              value={editLocationId}
              onChange={(e) => setEditLocationId(e.target.value)}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="editStartTime"
                label="Start Time"
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
              />
              <Input
                id="editEndTime"
                label="End Time"
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
              />
            </div>

            <Input
              id="editPrice"
              label="Price (RM)"
              type="number"
              value={editPrice.toString()}
              onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
              min={0}
            />

            <div>
              <label htmlFor="editNote" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Note (optional)
              </label>
              <input
                id="editNote"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="e.g. Riwoo only"
                className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-sm"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setEditBooking(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => setShowEditSaveOptions(true)}
                disabled={!hasEditChanges()}
              >
                Save
              </Button>
            </div>
          </div>
        )}
        {editBooking && showEditSaveOptions && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              How would you like to apply these changes?
            </p>
            <button
              onClick={() => handleEditSave('this')}
              disabled={editSaving}
              className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] disabled:opacity-50"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">This event only</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">Only change the class on {formatDateShort(selectedDate)}</p>
            </button>
            <button
              onClick={() => handleEditSave('future')}
              disabled={editSaving}
              className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] disabled:opacity-50"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">This and future events</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">Apply from {formatDateShort(selectedDate)} onwards</p>
            </button>
            <button
              onClick={() => handleEditSave('all')}
              disabled={editSaving}
              className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] disabled:opacity-50"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">All events</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">Change all past and future occurrences</p>
            </button>
            <div className="flex justify-end pt-1">
              <Button variant="secondary" size="sm" onClick={() => setShowEditSaveOptions(false)}>
                Back
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
                  <div key={attendee.studentId} className="p-3 bg-gray-50 dark:bg-[#1a1a1a] rounded-lg space-y-2">
                    <div className="flex items-center gap-3">
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

                {(() => {
                  const attendee = markDoneAttendees[0];
                  if (!attendee) return null;
                  const walletId = markDoneBooking?.studentWallets?.[attendee.studentId]
                    || markDoneBooking?.walletId
                    || wallets.find((w) => w.studentIds.includes(attendee.studentId))?.id;
                  const wallet = walletId ? wallets.find((w) => w.id === walletId) : null;
                  if (wallet) {
                    return (
                      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                        {wallet.name}: RM {wallet.balance} → RM {wallet.balance - markDonePrice}
                      </p>
                    );
                  }
                  return <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">No wallet (pay-per-lesson)</p>;
                })()}
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

      {/* Add Lesson modal */}
      <Modal
        isOpen={showAddLesson}
        onClose={() => setShowAddLesson(false)}
        title="Add Lesson"
      >
        <div className="space-y-3">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${lessonType === 'one-time' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}
              onClick={() => setLessonType('one-time')}
            >One-time</button>
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${lessonType === 'recurring' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}
              onClick={() => setLessonType('recurring')}
            >Recurring</button>
          </div>

          {/* Date or Day of Week */}
          {lessonType === 'one-time' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Date</label>
              <input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100" />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Day</label>
              <select value={lessonDayOfWeek} onChange={e => setLessonDayOfWeek(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100">
                {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => (
                  <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Location</label>
            <select value={lessonLocationId} onChange={e => setLessonLocationId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100">
              <option value="">Select location</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          {/* Start / End Time — 5-min increments */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Start Time</label>
              <select value={lessonStartTime} onChange={e => setLessonStartTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100">
                {generateTimeOptions().map(t => <option key={t} value={t}>{formatTimeDisplay(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">End Time</label>
              <select value={lessonEndTime} onChange={e => setLessonEndTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100">
                {generateTimeOptions().map(t => <option key={t} value={t}>{formatTimeDisplay(t)}</option>)}
              </select>
            </div>
          </div>

          {/* Lesson mode toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Lesson Type</label>
            <div className="flex gap-2">
              <button
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${lessonMode === 'private' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}
                onClick={() => { setLessonMode('private'); setStudentRows(rows => [rows[0]]); }}
              >Private</button>
              <button
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${lessonMode === 'group' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}
                onClick={() => setLessonMode('group')}
              >Group</button>
            </div>
          </div>

          {/* Student */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Student</label>
            <div className="relative">
              <input
                type="text"
                value={studentRows[0].displayName}
                onChange={e => {
                  const val = e.target.value;
                  setStudentSearch(val);
                  updateStudentRow(0, {
                    displayName: val,
                    isNew: true,
                    studentId: '',
                    // Auto-default to create wallet for new students
                    walletOption: val.trim() ? 'create' : 'none',
                    newWalletName: val.trim() ? val : '',
                    existingWalletId: '',
                  });
                }}
                placeholder="Search or type new student name"
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
              />
              {studentSearch && (
                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg max-h-40 overflow-y-auto shadow-lg">
                  {filteredStudentList.map(s => (
                    <button
                      key={s.studentId}
                      className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 hover:bg-gray-50 dark:hover:bg-zinc-700"
                      onClick={() => {
                        const studentRecord = students.find(st => st.id === s.studentId);
                        const linkedWallet = wallets.find(w => w.studentIds.includes(s.studentId));
                        updateStudentRow(0, {
                          studentId: s.studentId,
                          displayName: s.displayName,
                          phone: studentRecord?.clientPhone || '',
                          isNew: false,
                          walletOption: linkedWallet ? 'existing' : 'none',
                          existingWalletId: linkedWallet?.id || '',
                        });
                        setStudentSearch('');
                      }}
                    >
                      {s.displayName}
                    </button>
                  ))}
                  {filteredStudentList.length === 0 && (
                    <p className="px-3 py-2 text-sm text-gray-400 dark:text-zinc-500">No students found — will create new</p>
                  )}
                </div>
              )}
            </div>
            <input
              type="tel"
              value={studentRows[0].phone}
              onChange={e => updateStudentRow(0, { phone: e.target.value })}
              placeholder="Phone number"
              className="w-full mt-2 rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
            />

            {/* Wallet selection for student row */}
            <div className="mt-2">
              <label className="block text-xs font-medium mb-1 text-zinc-400">Wallet</label>
              <select
                value={studentRows[0].walletOption === 'existing' ? studentRows[0].existingWalletId : studentRows[0].walletOption}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'none') {
                    updateStudentRow(0, { walletOption: 'none', existingWalletId: '', newWalletName: '' });
                  } else if (val === 'create') {
                    updateStudentRow(0, { walletOption: 'create', existingWalletId: '', newWalletName: studentRows[0].displayName });
                  } else {
                    updateStudentRow(0, { walletOption: 'existing', existingWalletId: val, newWalletName: '' });
                  }
                }}
                className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm"
              >
                <option value="none">No wallet</option>
                {wallets.map(w => (
                  <option key={w.id} value={w.id}>{w.name} (RM {w.balance})</option>
                ))}
                <option value="create">+ Create new wallet</option>
              </select>
            </div>

            {/* Wallet name input — only when creating new */}
            {studentRows[0].walletOption === 'create' && (
              <div className="mt-2">
                <label className="block text-xs font-medium mb-1 text-zinc-400">Wallet Name</label>
                <input
                  type="text"
                  value={studentRows[0].newWalletName}
                  onChange={e => updateStudentRow(0, { newWalletName: e.target.value })}
                  placeholder="e.g. Mrs. Wong"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="mt-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Price (RM)</label>
              <input
                type="number"
                value={studentRows[0].price || ''}
                onChange={e => updateStudentRow(0, { price: Number(e.target.value) })}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Notes (optional)</label>
            <textarea
              value={lessonNote}
              onChange={e => setLessonNote(e.target.value)}
              placeholder="Additional notes..."
              className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
              rows={2}
            />
          </div>

          {/* Overlap warning */}
          {overlapWarning && (
            <p className="text-sm text-amber-600 dark:text-amber-400">{overlapWarning}</p>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => setShowAddLesson(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-zinc-400 hover:underline">Cancel</button>
            <Button onClick={handleCreateLesson} disabled={addingLesson}>
              {addingLesson ? 'Creating...' : lessonType === 'recurring' ? 'Create Booking' : 'Create Lesson'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { collection, doc, writeBatch, serverTimestamp, increment, updateDoc, deleteDoc, addDoc, getDoc, setDoc, Firestore, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings, useLessonLogs, useClassExceptions, useStudents, useWallets } from '@/hooks/useCoachData';
import { Button, DatePicker, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Booking, ClassException, DayOfWeek } from '@/types';
import { formatTimeDisplay } from '@/lib/time-format';
import { findOrCreateStudent } from '@/lib/students';
import { resolveWallet } from '@/lib/wallets';
import { computeCancelFuture } from '@/lib/cancel-scope';
import { getClassesForDate, isRescheduledToDate, getCancelledClassesForDate } from '@/lib/class-schedule';
import { formatDateFull, formatDateShort, parseDateString } from '@/lib/date-format';

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
  const [cancelScopeBooking, setCancelScopeBooking] = useState<Booking | null>(null);
  const [cancelScope, setCancelScope] = useState<'this' | 'future'>('this');
  const [oneTimeCancelBooking, setOneTimeCancelBooking] = useState<Booking | null>(null);
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
  const [lessonClassName, setLessonClassName] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [lessonRepeatWeekly, setLessonRepeatWeekly] = useState(false);
  const [lessonLocationId, setLessonLocationId] = useState('');
  const [lessonNewLocationName, setLessonNewLocationName] = useState('');
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
  const [studentSearches, setStudentSearches] = useState<string[]>(['']);
  const [focusedStudentRow, setFocusedStudentRow] = useState<number | null>(null);
  const [expandedStudentRows, setExpandedStudentRows] = useState<Set<number>>(new Set());

  const toggleStudentRowExpanded = (index: number) => {
    setExpandedStudentRows(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Overlap warning
  const [overlapWarning, setOverlapWarning] = useState('');

  const checkOverlap = useCallback((dayOfWeek: string, startTime: string, endTime: string): string => {
    const recurringOnDay = bookings.filter(
      b => b.dayOfWeek === dayOfWeek && b.status === 'confirmed' && !(b.startDate && b.startDate === b.endDate)
    );
    for (const b of recurringOnDay) {
      if (startTime < b.endTime && endTime > b.startTime) {
        return `This overlaps with ${b.className} (${formatTimeDisplay(b.startTime)}–${formatTimeDisplay(b.endTime)})`;
      }
    }
    return '';
  }, [bookings]);

  // Derive day-of-week from the picked lesson date (local time)
  const lessonDayOfWeek: DayOfWeek | '' = useMemo(() => {
    if (!lessonDate) return '';
    const d = new Date(lessonDate + 'T00:00:00');
    return (['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const)[d.getDay()];
  }, [lessonDate]);

  const lessonDayName = useMemo(() => {
    if (!lessonDate) return '';
    return new Date(lessonDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  }, [lessonDate]);

  // Check for overlaps when repeat-weekly toggle or time fields change
  useEffect(() => {
    if (!showAddLesson || !lessonRepeatWeekly || !lessonDayOfWeek) {
      setOverlapWarning('');
      return;
    }
    setOverlapWarning(checkOverlap(lessonDayOfWeek, lessonStartTime, lessonEndTime));
  }, [showAddLesson, lessonRepeatWeekly, lessonDayOfWeek, lessonStartTime, lessonEndTime, checkOverlap]);

  // Edit booking modal state
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [editLocationId, setEditLocationId] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editStudentIds, setEditStudentIds] = useState<string[]>([]);
  const [editStudentPrices, setEditStudentPrices] = useState<Record<string, number>>({});
  const [editStudentWallets, setEditStudentWallets] = useState<Record<string, string>>({});
  const [editAddStudentOpen, setEditAddStudentOpen] = useState(false);
  const [editAddStudentSearch, setEditAddStudentSearch] = useState('');
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

  const findWalletForStudent = useCallback(
    (studentId: string) => resolveWallet(markDoneBooking, studentId, wallets),
    [markDoneBooking, wallets],
  );

  const canConfirmMarkDone = useMemo(() => {
    if (!markDoneBooking || markDoneAttendees.length === 0) return false;
    const attending = markDoneAttendees.length > 1
      ? markDoneAttendees.filter((a) => a.attended)
      : markDoneAttendees;
    return attending.every((a) => findWalletForStudent(a.studentId));
  }, [markDoneBooking, markDoneAttendees, findWalletForStudent]);

  const getFilteredStudentsForRow = (rowIndex: number) => {
    const search = studentSearches[rowIndex] ?? '';
    if (!search.trim()) return selectableStudentList;
    const q = search.toLowerCase();
    return selectableStudentList.filter((s) => s.displayName.toLowerCase().includes(q));
  };

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

  const getStudentRowSummary = (row: StudentRow): string => {
    if (!row.displayName.trim()) return '';
    const parts: string[] = [];
    if (row.isNew) parts.push('New student');
    if (row.walletOption === 'create' && row.newWalletName) {
      parts.push(`New wallet "${row.newWalletName}"`);
    } else if (row.walletOption === 'existing') {
      if (row.existingWalletId.startsWith('pending:')) {
        const refIdx = parseInt(row.existingWalletId.split(':')[1]);
        const refRow = studentRows[refIdx];
        if (refRow?.newWalletName) parts.push(`Shared wallet "${refRow.newWalletName}"`);
      } else {
        const w = wallets.find(w => w.id === row.existingWalletId);
        if (w) parts.push(`Wallet "${w.name}" · RM ${w.balance}`);
      }
    } else {
      parts.push('No wallet');
    }
    return parts.join(' · ');
  };

  const resetLessonForm = () => {
    setLessonClassName('');
    setLessonDate(getDateString(selectedDate));
    setLessonRepeatWeekly(false);
    setLessonLocationId(locations[0]?.id || '');
    setLessonNewLocationName('');
    setLessonStartTime('09:00');
    setLessonEndTime('10:00');
    setLessonNote('');
    setStudentRows([{
      studentId: '', displayName: '', phone: '', isNew: true,
      walletOption: 'none', existingWalletId: '', newWalletName: '', price: 0,
    }]);
    setStudentSearches(['']);
    setExpandedStudentRows(new Set());
    setOverlapWarning('');
  };

  const handleCreateLesson = async () => {
    if (!coach || !db || studentRows.length === 0 || !studentRows[0].displayName) return;
    if (!lessonClassName.trim()) {
      showToast('Please enter a class name', 'error');
      return;
    }
    if (!lessonDate) {
      showToast('Please select a date', 'error');
      return;
    }
    if (!lessonLocationId) {
      showToast('Please select a location', 'error');
      return;
    }
    if (lessonLocationId === 'create' && !lessonNewLocationName.trim()) {
      showToast('Please enter a location name', 'error');
      return;
    }
    setAddingLesson(true);
    try {
      const firestore = db as Firestore;
      const primaryRow = studentRows[0];

      // If creating a new location, save it first and use its ID going forward
      let resolvedLocationId = lessonLocationId;
      let resolvedLocationName = locations.find(l => l.id === lessonLocationId)?.name || '';
      if (lessonLocationId === 'create') {
        const trimmed = lessonNewLocationName.trim();
        const locRef = await addDoc(collection(firestore, 'coaches', coach.id, 'locations'), {
          name: trimmed,
          address: '',
          notes: '',
          createdAt: serverTimestamp(),
        });
        resolvedLocationId = locRef.id;
        resolvedLocationName = trimmed;
      }

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

      // Build booking data — day of week is always derived from the picked date
      const dayOfWeek = (['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const)[new Date(lessonDate + 'T00:00:00').getDay()];

      const groupSize = studentRows.length;
      const bookingData: Record<string, unknown> = {
        locationId: resolvedLocationId,
        locationName: resolvedLocationName,
        dayOfWeek,
        startTime: lessonStartTime,
        endTime: lessonEndTime,
        status: 'confirmed',
        className: lessonClassName.trim(),
        clientName: primaryRow.displayName,
        clientPhone: primaryRow.phone,
        lessonType: groupSize > 1 ? 'group' : 'private',
        groupSize,
        notes: lessonNote,
        price: groupSize > 1 ? studentRows.reduce((sum, r) => sum + r.price, 0) : primaryRow.price,
        createdAt: serverTimestamp(),
      };

      // One-time: startDate === endDate. Recurring: only startDate, no endDate.
      bookingData.startDate = lessonDate;
      if (!lessonRepeatWeekly) {
        bookingData.endDate = lessonDate;
      }

      // Attach wallet to booking if one was selected/created
      if (walletId) {
        bookingData.walletId = walletId;
      }

      // Handle group booking — resolve linked students
      if (studentRows.length > 1) {
        const linkedIds: string[] = [];
        const studentPricesMap: Record<string, number> = {};
        const studentWalletsMap: Record<string, string> = {};

        // Primary student
        studentPricesMap[primaryStudentId] = primaryRow.price;
        if (walletId) studentWalletsMap[primaryStudentId] = walletId;

        // Track wallets created per row index (for pending: references)
        const createdWalletsByRow = new Map<number, string>();
        if (walletId) createdWalletsByRow.set(0, walletId);

        // Linked students (rows 1+)
        for (let i = 1; i < studentRows.length; i++) {
          const row = studentRows[i];
          if (!row.displayName) continue;

          const linkedStudentId = await findOrCreateStudent(
            firestore, coach.id, row.displayName, row.phone
          );
          linkedIds.push(linkedStudentId);
          studentPricesMap[linkedStudentId] = row.price;

          // Handle wallet for this linked student
          let linkedWalletId: string | undefined;
          if (row.walletOption === 'create' && row.newWalletName) {
            const wRef = await addDoc(collection(firestore, 'coaches', coach.id, 'wallets'), {
              name: row.newWalletName,
              balance: 0,
              studentIds: [linkedStudentId],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            linkedWalletId = wRef.id;
            createdWalletsByRow.set(i, linkedWalletId);
          } else if (row.walletOption === 'existing') {
            if (row.existingWalletId.startsWith('pending:')) {
              // References a wallet being created by a prior row
              const refIndex = parseInt(row.existingWalletId.split(':')[1]);
              linkedWalletId = createdWalletsByRow.get(refIndex);
            } else {
              linkedWalletId = row.existingWalletId;
            }

            // Link student to that wallet
            if (linkedWalletId) {
              const wRef = doc(firestore, 'coaches', coach.id, 'wallets', linkedWalletId);
              const wSnap = await getDoc(wRef);
              const ids: string[] = wSnap.data()?.studentIds || [];
              if (!ids.includes(linkedStudentId)) {
                await updateDoc(wRef, {
                  studentIds: [...ids, linkedStudentId],
                  updatedAt: serverTimestamp(),
                });
              }
            }
          }

          if (linkedWalletId) studentWalletsMap[linkedStudentId] = linkedWalletId;
        }

        bookingData.linkedStudentIds = linkedIds;
        bookingData.studentPrices = studentPricesMap;
        if (Object.keys(studentWalletsMap).length > 0) {
          bookingData.studentWallets = studentWalletsMap;
        }
      }

      await addDoc(collection(firestore, 'coaches', coach.id, 'bookings'), bookingData);

      // Close the modal before any Firestore snapshot can arrive with the new
      // booking and trigger a self-overlap warning flash.
      setShowAddLesson(false);
      resetLessonForm();
      showToast('Lesson created!', 'success');

      if (primaryStudentId) {
        updateDoc(doc(firestore, 'coaches', coach.id, 'students', primaryStudentId), {
          updatedAt: serverTimestamp(),
        }).catch(err => console.error('Failed to touch student record:', err));
      }
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

        const wallet = resolveWallet(booking, attendee.studentId, wallets);
        if (wallet && attendee.price > 0) {
          const newBalance = wallet.balance - attendee.price;
          const txnRef = doc(collection(firestore, 'coaches', coach.id, 'wallets', wallet.id, 'transactions'));
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
          const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', wallet.id);
          batch.update(walletRef, {
            balance: increment(-attendee.price),
            updatedAt: serverTimestamp(),
          });
        }

        batch.update(studentRef, { updatedAt: serverTimestamp() });
      }

      await batch.commit();

      for (const attendee of resolvedAttendees) {
        const wallet = resolveWallet(booking, attendee.studentId, wallets);
        if (wallet && wallet.balance - attendee.price < 0) {
          showToast(`${wallet.name} balance is now negative`, 'info');
          break;
        }
      }
    } catch (error) {
      console.error('Error marking class done:', error);
      showToast('Failed to mark class as done — please try again', 'error');
    } finally {
      setMarking(null);
    }
  };

  const handleCancelScoped = async (
    booking: Booking,
    scope: 'this' | 'future',
  ) => {
    if (!coach || !db) return;
    setCancelling(booking.id);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      if (scope === 'this') {
        const exRef = doc(collection(firestore, 'coaches', coach.id, 'classExceptions'));
        batch.set(exRef, {
          bookingId: booking.id,
          originalDate: selectedDateStr,
          type: 'cancelled',
          createdAt: serverTimestamp(),
        });
      } else {
        // Fetch ALL exceptions for this booking — the in-scope `classExceptions`
        // is only a ±2 month window, which may miss orphans we need to clean up.
        const exQuery = query(
          collection(firestore, 'coaches', coach.id, 'classExceptions'),
          where('bookingId', '==', booking.id),
        );
        const exSnapshot = await getDocs(exQuery);
        const allExceptions: ClassException[] = exSnapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ClassException, 'id'>),
        }));

        const result = computeCancelFuture(booking, allExceptions, selectedDateStr);
        if (result.action === 'delete') {
          batch.delete(doc(firestore, 'coaches', coach.id, 'bookings', booking.id));
        } else {
          batch.update(doc(firestore, 'coaches', coach.id, 'bookings', booking.id), {
            endDate: result.newEndDate,
          });
        }
        for (const exId of result.exceptionIdsToDelete) {
          batch.delete(doc(firestore, 'coaches', coach.id, 'classExceptions', exId));
        }
      }

      await batch.commit();
      showToast(
        scope === 'this' ? 'Class cancelled for this date' : 'Recurring series ended',
        'success',
      );
      setCancelScopeBooking(null);
      setOneTimeCancelBooking(null);
    } catch (error) {
      console.error('Error cancelling class:', error);
      showToast('Failed to cancel class', 'error');
    } finally {
      setCancelling(null);
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
    setEditClassName(booking.className || '');
    setEditLocationId(booking.locationId);
    setEditStartTime(booking.startTime);
    setEditEndTime(booking.endTime);
    setEditNote(booking.notes || '');

    // Resolve primary student id by matching clientName + clientPhone
    const primary = students.find(
      (s) => s.clientName === booking.clientName && s.clientPhone === (booking.clientPhone || '')
    );
    const primaryId = primary?.id ?? '';
    const studentIds = [primaryId, ...(booking.linkedStudentIds ?? [])].filter(Boolean);
    setEditStudentIds(studentIds);

    // Seed per-student prices
    const prices: Record<string, number> = {};
    if (booking.studentPrices && Object.keys(booking.studentPrices).length > 0) {
      for (const id of studentIds) prices[id] = booking.studentPrices[id] ?? 0;
    } else if (primaryId) {
      prices[primaryId] = booking.price ?? 0;
    }
    setEditStudentPrices(prices);

    // Seed per-student wallets ('' = auto)
    const sw: Record<string, string> = {};
    for (const id of studentIds) {
      sw[id] = booking.studentWallets?.[id] ?? (id === primaryId ? (booking.walletId ?? '') : '');
    }
    setEditStudentWallets(sw);

    setEditAddStudentOpen(false);
    setEditAddStudentSearch('');
    setShowEditSaveOptions(false);
    setMenuOpen(null);
  };

  const editTotalPrice = editStudentIds.reduce((sum, id) => sum + (editStudentPrices[id] ?? 0), 0);

  const editPrimaryStudentId = editStudentIds[0] ?? '';
  const editLinkedStudentIds = editStudentIds.slice(1);

  const hasEditRosterChange = () => {
    if (!editBooking) return false;
    const origLinked = editBooking.linkedStudentIds ?? [];
    if (editLinkedStudentIds.length !== origLinked.length) return true;
    for (const id of editLinkedStudentIds) if (!origLinked.includes(id)) return true;
    // Compare per-student prices
    for (const id of editStudentIds) {
      const orig = editBooking.studentPrices?.[id];
      const current = editStudentPrices[id] ?? 0;
      if (orig !== undefined && orig !== current) return true;
      if (orig === undefined && id === editPrimaryStudentId && (editBooking.price ?? 0) !== current) return true;
    }
    // Compare per-student wallets
    for (const id of editStudentIds) {
      const origWallet = editBooking.studentWallets?.[id] ?? (id === editPrimaryStudentId ? (editBooking.walletId ?? '') : '');
      if (origWallet !== (editStudentWallets[id] ?? '')) return true;
    }
    return false;
  };

  const hasEditBookingLevelChange = () => {
    if (!editBooking) return false;
    return editClassName !== (editBooking.className || '');
  };

  const hasEditChanges = () => {
    if (!editBooking) return false;
    return editLocationId !== editBooking.locationId ||
      editStartTime !== editBooking.startTime ||
      editEndTime !== editBooking.endTime ||
      editNote !== (editBooking.notes || '') ||
      hasEditBookingLevelChange() ||
      hasEditRosterChange();
  };

  const handleEditSave = async (mode: 'this' | 'future') => {
    if (!coach || !db || !editBooking) return;
    if (!hasEditChanges()) {
      showToast('No changes to save', 'error');
      return;
    }
    if (mode === 'this' && (hasEditRosterChange() || hasEditBookingLevelChange())) {
      showToast('Class name, student, price, and wallet changes must apply to all or future occurrences', 'error');
      return;
    }
    if (!editClassName.trim()) {
      showToast('Class name is required', 'error');
      return;
    }
    setEditSaving(true);
    try {
      const firestore = db as Firestore;
      const newLocation = locations.find((l) => l.id === editLocationId);
      const newLocationName = newLocation?.name || editBooking.locationName;

      // Build booking-level fields shared by the future mode
      const primaryStudent = students.find((s) => s.id === editPrimaryStudentId);
      const primaryWalletId = editStudentWallets[editPrimaryStudentId] || '';
      const studentWalletsOut: Record<string, string> = {};
      for (const id of editStudentIds) {
        const w = editStudentWallets[id];
        if (w) studentWalletsOut[id] = w;
      }
      const studentPricesOut: Record<string, number> = {};
      for (const id of editStudentIds) studentPricesOut[id] = editStudentPrices[id] ?? 0;
      const groupSize = editStudentIds.length;
      const lessonType = groupSize > 1 ? 'group' : 'private';

      if (mode === 'this') {
        const exRef = doc(collection(firestore, 'coaches', coach.id, 'classExceptions'));
        await setDoc(exRef, {
          bookingId: editBooking.id,
          originalDate: selectedDateStr,
          type: 'rescheduled',
          newDate: selectedDateStr,
          newStartTime: editStartTime,
          newEndTime: editEndTime,
          newLocationId: editLocationId,
          newLocationName: newLocationName,
          newPrice: editTotalPrice,
          newNote: editNote,
          createdAt: serverTimestamp(),
        });
        showToast('Updated for this date', 'success');
      } else if (mode === 'future') {
        const batch = writeBatch(firestore);
        const oldBookingRef = doc(firestore, 'coaches', coach.id, 'bookings', editBooking.id);
        const prevDay = new Date(selectedDate);
        prevDay.setDate(prevDay.getDate() - 1);
        batch.update(oldBookingRef, {
          endDate: getDateString(prevDay),
          updatedAt: serverTimestamp(),
        });
        const newBookingRef = doc(collection(firestore, 'coaches', coach.id, 'bookings'));
        const newData: Record<string, unknown> = {
          locationId: editLocationId,
          locationName: newLocationName,
          dayOfWeek: editBooking.dayOfWeek,
          startTime: editStartTime,
          endTime: editEndTime,
          status: 'confirmed',
          className: editClassName.trim(),
          clientName: primaryStudent?.clientName ?? editBooking.clientName,
          clientPhone: primaryStudent?.clientPhone ?? editBooking.clientPhone,
          lessonType,
          groupSize,
          notes: editNote,
          price: editTotalPrice,
          linkedStudentIds: editLinkedStudentIds.length > 0 ? editLinkedStudentIds : null,
          studentPrices: groupSize > 1 ? studentPricesOut : null,
          studentWallets: Object.keys(studentWalletsOut).length > 0 ? studentWalletsOut : null,
          walletId: primaryWalletId || null,
          startDate: selectedDateStr,
          createdAt: serverTimestamp(),
        };
        batch.set(newBookingRef, newData);
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
                  className="flex items-center gap-3 p-4 sm:p-5"
                >
                  {/* Status indicator */}
                  <div className={`flex-shrink-0 ${isDone ? 'opacity-50' : ''}`}>
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
                  <div className={`flex-1 min-w-0 ${isDone ? 'opacity-50' : ''}`}>
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
                      {booking.className}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500 truncate">
                      {booking.locationName}{booking.notes ? <span className="text-amber-500 dark:text-amber-400"> · {booking.notes}</span> : null}
                    </p>
                  </div>

                  {/* Price + type */}
                  <div className={`text-right flex-shrink-0 ${isDone ? 'opacity-50' : ''}`}>
                    {(booking.price ?? 0) > 0 && (
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        RM {booking.price}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                      {booking.groupSize > 1 ? `Group (${booking.groupSize})` : 'Private'}
                    </p>
                  </div>

                  {/* Actions menu */}
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
                            {!isDone && (
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
                            )}
                            <button
                              onClick={() => openEditBooking(booking)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#333]"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                resetLessonForm();
                                setLessonRepeatWeekly(false);
                                setLessonClassName(booking.className || '');
                                setLessonDate(selectedDateStr);
                                setLessonLocationId(booking.locationId || locations[0]?.id || '');
                                setLessonStartTime(booking.startTime || '09:00');
                                setLessonEndTime(booking.endTime || '10:00');
                                setLessonNote(booking.notes || '');
                                const dupRows: StudentRow[] = [];
                                const primaryStudent = students.find(s => s.clientName === booking.clientName);
                                if (primaryStudent) {
                                  dupRows.push({
                                    studentId: primaryStudent.id, displayName: primaryStudent.clientName,
                                    phone: primaryStudent.clientPhone || '', isNew: false,
                                    walletOption: 'none', existingWalletId: '', newWalletName: '',
                                    price: booking.studentPrices?.[primaryStudent.id] ?? booking.price ?? 0,
                                  });
                                }
                                if (booking.linkedStudentIds?.length) {
                                  for (const linkedId of booking.linkedStudentIds) {
                                    const ls = students.find(s => s.id === linkedId);
                                    if (ls) {
                                      dupRows.push({
                                        studentId: ls.id, displayName: ls.clientName,
                                        phone: ls.clientPhone || '', isNew: false,
                                        walletOption: 'none', existingWalletId: '', newWalletName: '',
                                        price: booking.studentPrices?.[ls.id] ?? 0,
                                      });
                                    }
                                  }
                                }
                                setStudentRows(dupRows.length ? dupRows : [{
                                  studentId: '', displayName: '', phone: '', isNew: true,
                                  walletOption: 'none', existingWalletId: '', newWalletName: '', price: 0,
                                }]);
                                setStudentSearches(dupRows.length ? dupRows.map(() => '') : ['']);
                                setShowAddLesson(true);
                                setMenuOpen(null);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#333]"
                            >
                              Duplicate
                            </button>
                            {!isDone && (
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
                            )}
                            {!isDone && (
                            <button
                              onClick={() => {
                                const isOneTime = !!(booking.startDate && booking.endDate && booking.startDate === booking.endDate);
                                if (isOneTime) {
                                  setOneTimeCancelBooking(booking);
                                } else {
                                  setCancelScopeBooking(booking);
                                  setCancelScope('this');
                                }
                                setMenuOpen(null);
                              }}
                              disabled={cancelling === booking.id}
                              className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-[#333] disabled:opacity-50"
                            >
                              {cancelling === booking.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
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
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mt-0.5">{booking.className}</p>
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
                        setLessonRepeatWeekly(false);
                        setLessonDate(selectedDateStr);
                        setLessonLocationId(loc?.id || locations[0]?.id || '');
                        setLessonStartTime(firstLog.startTime || '09:00');
                        setLessonEndTime(firstLog.endTime || '10:00');
                        setLessonNote(firstLog.note || '');
                        setStudentRows(group.map(l => ({
                          studentId: l.studentId || '', displayName: l.studentName,
                          phone: '', isNew: false,
                          walletOption: 'none' as const, existingWalletId: '', newWalletName: '',
                          price: l.price,
                        })));
                        setStudentSearches(group.map(() => ''));
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
                {rescheduleBooking.className}
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

      {/* Cancel scope modal (recurring) */}
      <Modal
        isOpen={!!cancelScopeBooking}
        onClose={() => setCancelScopeBooking(null)}
        title="Cancel recurring lesson?"
      >
        {cancelScopeBooking && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              {cancelScopeBooking.className} — {formatDateShort(parseDateString(selectedDateStr))}
            </p>

            <label className={`flex gap-3 p-3 rounded-lg cursor-pointer border-2 ${cancelScope === 'this' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-[#333]'}`}>
              <input
                type="radio"
                name="cancel-scope"
                value="this"
                checked={cancelScope === 'this'}
                onChange={() => setCancelScope('this')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">This lesson</p>
                <p className="text-xs text-gray-600 dark:text-zinc-400">
                  Only {formatDateShort(parseDateString(selectedDateStr))} — other dates unaffected.
                </p>
              </div>
            </label>

            <label className={`flex gap-3 p-3 rounded-lg cursor-pointer border-2 ${cancelScope === 'future' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-[#333]'}`}>
              <input
                type="radio"
                name="cancel-scope"
                value="future"
                checked={cancelScope === 'future'}
                onChange={() => setCancelScope('future')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">This and future lessons</p>
                <p className="text-xs text-gray-600 dark:text-zinc-400">
                  Ends the recurring series from {formatDateShort(parseDateString(selectedDateStr))} onwards. Past lessons kept.
                </p>
              </div>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setCancelScopeBooking(null)}>
                Back
              </Button>
              <Button
                variant="danger"
                disabled={cancelling === cancelScopeBooking.id}
                onClick={() => handleCancelScoped(cancelScopeBooking, cancelScope)}
              >
                {cancelling === cancelScopeBooking.id ? 'Cancelling...' : 'Cancel lesson'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* One-time cancel confirm modal */}
      <Modal
        isOpen={!!oneTimeCancelBooking}
        onClose={() => setOneTimeCancelBooking(null)}
        title="Cancel this lesson?"
      >
        {oneTimeCancelBooking && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              {oneTimeCancelBooking.className} — {formatDateShort(parseDateString(selectedDateStr))}
            </p>
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              The lesson will be cancelled for this date.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setOneTimeCancelBooking(null)}>
                Back
              </Button>
              <Button
                variant="danger"
                disabled={cancelling === oneTimeCancelBooking.id}
                onClick={() => handleCancelScoped(oneTimeCancelBooking, 'this')}
              >
                {cancelling === oneTimeCancelBooking.id ? 'Cancelling...' : 'Cancel lesson'}
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
                {editClassName || '(unnamed class)'}
              </p>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                {formatDateFull(selectedDate)}
              </p>
            </div>

            <Input
              id="editClassName"
              label="Class Name"
              value={editClassName}
              onChange={(e) => setEditClassName(e.target.value)}
              placeholder="e.g. Tuesday swim squad"
            />

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

            {/* Students section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Students ({editStudentIds.length})
                </label>
                <p className="text-sm text-gray-600 dark:text-zinc-400">Total: RM {editTotalPrice.toFixed(0)}</p>
              </div>

              {editStudentIds.map((sid, idx) => {
                const student = students.find((s) => s.id === sid);
                const isPrimary = idx === 0;
                return (
                  <div key={sid} className="p-3 bg-gray-50 dark:bg-[#1a1a1a] rounded-lg space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
                          {student?.clientName ?? '(unknown)'}
                        </p>
                        {student?.clientPhone && (
                          <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{student.clientPhone}</p>
                        )}
                      </div>
                      {!isPrimary && (
                        <button
                          onClick={() => {
                            setEditStudentIds((ids) => ids.filter((i) => i !== sid));
                            setEditStudentPrices((p) => { const next = { ...p }; delete next[sid]; return next; });
                            setEditStudentWallets((w) => { const next = { ...w }; delete next[sid]; return next; });
                          }}
                          className="text-xs text-red-500 dark:text-red-400 hover:underline shrink-0"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        id={`editPrice-${sid}`}
                        label="Price (RM)"
                        type="number"
                        value={String(editStudentPrices[sid] ?? 0)}
                        onChange={(e) => setEditStudentPrices({ ...editStudentPrices, [sid]: parseFloat(e.target.value) || 0 })}
                        min={0}
                      />
                      <Select
                        id={`editWallet-${sid}`}
                        label="Wallet"
                        value={editStudentWallets[sid] ?? ''}
                        onChange={(e) => setEditStudentWallets({ ...editStudentWallets, [sid]: e.target.value })}
                        options={[
                          { value: '', label: 'Auto (student\u2019s own)' },
                          ...wallets.map((w) => ({ value: w.id, label: `${w.name} (RM ${w.balance.toFixed(0)})` })),
                        ]}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Add student */}
              {editAddStudentOpen ? (
                <div className="p-3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#333] rounded-lg space-y-2">
                  <Input
                    id="editAddStudentSearch"
                    label="Find student"
                    placeholder="Search name or phone"
                    value={editAddStudentSearch}
                    onChange={(e) => setEditAddStudentSearch(e.target.value)}
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {students
                      .filter((s) => !editStudentIds.includes(s.id))
                      .filter((s) => {
                        if (!editAddStudentSearch.trim()) return true;
                        const q = editAddStudentSearch.toLowerCase();
                        return s.clientName.toLowerCase().includes(q) || s.clientPhone.toLowerCase().includes(q);
                      })
                      .slice(0, 8)
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setEditStudentIds([...editStudentIds, s.id]);
                            setEditStudentPrices({ ...editStudentPrices, [s.id]: 0 });
                            setEditStudentWallets({ ...editStudentWallets, [s.id]: '' });
                            setEditAddStudentOpen(false);
                            setEditAddStudentSearch('');
                          }}
                          className="w-full text-left p-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
                        >
                          <span className="text-gray-900 dark:text-zinc-100">{s.clientName}</span>
                          {s.clientPhone && <span className="text-gray-500 dark:text-zinc-400 ml-2">{s.clientPhone}</span>}
                        </button>
                      ))}
                    {students.filter((s) => !editStudentIds.includes(s.id)).length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-zinc-500 p-2">No other students to add.</p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => { setEditAddStudentOpen(false); setEditAddStudentSearch(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditAddStudentOpen(true)}
                  className="w-full text-sm text-blue-600 dark:text-blue-400 hover:underline py-1"
                >
                  + Add student
                </button>
              )}
            </div>

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
                disabled={!hasEditChanges() || editStudentIds.length === 0}
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
            {!hasEditRosterChange() && (
              <button
                onClick={() => handleEditSave('this')}
                disabled={editSaving}
                className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] disabled:opacity-50"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">This event only</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">Only change the class on {formatDateShort(selectedDate)}</p>
              </button>
            )}
            <button
              onClick={() => handleEditSave('future')}
              disabled={editSaving}
              className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] disabled:opacity-50"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">This and future events</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">Apply from {formatDateShort(selectedDate)} onwards</p>
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
                {markDoneBooking.className}
              </p>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                {formatTimeDisplay(markDoneBooking.startTime)} – {formatTimeDisplay(markDoneBooking.endTime)} &middot; {markDoneBooking.locationName}
              </p>
            </div>

            {markDoneAttendees.length > 1 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Attendance & Pricing</p>
                {markDoneAttendees.map((attendee, idx) => {
                  const attendeeWallet = findWalletForStudent(attendee.studentId);
                  return (
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
                    {attendee.attended && (
                      attendeeWallet ? (
                        <p className="text-xs text-gray-400 dark:text-zinc-500 pl-7">
                          {attendeeWallet.name}: RM {attendeeWallet.balance} → RM {attendeeWallet.balance - attendee.price}
                        </p>
                      ) : (
                        <p className="text-xs text-red-600 dark:text-red-400 pl-7">
                          No wallet linked — create one in the Payments tab.
                        </p>
                      )
                    )}
                  </div>
                  );
                })}
              </div>
            ) : (
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
                  const wallet = attendee ? findWalletForStudent(attendee.studentId) : null;
                  if (wallet) {
                    return (
                      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                        {wallet.name}: RM {wallet.balance} → RM {wallet.balance - markDonePrice}
                      </p>
                    );
                  }
                  return (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      No wallet linked — create one in the Payments tab and add this student.
                    </p>
                  );
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
                disabled={!canConfirmMarkDone}
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
        <div className="space-y-5">
          {/* CLASS */}
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500 mb-2">Class</div>
            <input
              type="text"
              value={lessonClassName}
              onChange={e => setLessonClassName(e.target.value)}
              placeholder="Class name (e.g. Tuesday swim squad)"
              className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
            />
          </section>

          {/* WHEN */}
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500 mb-2">When</div>
            <div className="space-y-2">
              <DatePicker value={lessonDate} onChange={setLessonDate} ariaLabel="Lesson date" />
              <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/50 text-sm text-gray-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={lessonRepeatWeekly}
                  onChange={e => setLessonRepeatWeekly(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span>Repeat every {lessonDayName || 'week'}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select value={lessonStartTime} onChange={e => setLessonStartTime(e.target.value)}
                  aria-label="Start time"
                  className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100">
                  {generateTimeOptions().map(t => <option key={t} value={t}>{formatTimeDisplay(t)}</option>)}
                </select>
                <select value={lessonEndTime} onChange={e => setLessonEndTime(e.target.value)}
                  aria-label="End time"
                  className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100">
                  {generateTimeOptions().map(t => <option key={t} value={t}>{formatTimeDisplay(t)}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* WHERE */}
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500 mb-2">Where</div>
            <div className="space-y-2">
              <select value={lessonLocationId} onChange={e => {
                  const val = e.target.value;
                  setLessonLocationId(val);
                  if (val !== 'create') setLessonNewLocationName('');
                }}
                className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100">
                <option value="">Select location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
                <option value="create">+ Create new location</option>
              </select>
              {lessonLocationId === 'create' && (
                <input
                  type="text"
                  value={lessonNewLocationName}
                  onChange={e => setLessonNewLocationName(e.target.value)}
                  placeholder="New location name (e.g. Club A pool)"
                  className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                />
              )}
            </div>
          </section>

          {/* STUDENTS */}
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500 mb-2">
              Students {studentRows.length > 1 && <span className="text-gray-400 dark:text-zinc-500 font-normal normal-case">· {studentRows.length} in group</span>}
            </div>
            <div className="space-y-2">
              {studentRows.map((row, i) => {
                const isExpanded = expandedStudentRows.has(i);
                const summary = getStudentRowSummary(row);
                return (
                  <div key={i} className="rounded-lg border border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#1a1a1a]">
                    {/* Collapsed header — always visible */}
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        {/* Name input + autocomplete */}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={row.displayName}
                            onFocus={() => setFocusedStudentRow(i)}
                            onBlur={() => setTimeout(() => setFocusedStudentRow(prev => (prev === i ? null : prev)), 150)}
                            onChange={e => {
                              const val = e.target.value;
                              setStudentSearches(searches => {
                                const next = [...searches];
                                next[i] = val;
                                return next;
                              });
                              updateStudentRow(i, {
                                displayName: val,
                                isNew: true,
                                studentId: '',
                                walletOption: val.trim() ? 'create' : 'none',
                                newWalletName: val.trim() ? val : '',
                                existingWalletId: '',
                              });
                            }}
                            placeholder="Student name"
                            className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                          />
                          {focusedStudentRow === i && (studentSearches[i]?.trim() ?? '') && (() => {
                            const matches = getFilteredStudentsForRow(i);
                            if (matches.length === 0) return null;
                            return (
                              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg max-h-40 overflow-y-auto shadow-lg">
                                {matches.map(s => (
                                  <button
                                    key={s.studentId}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 hover:bg-gray-50 dark:hover:bg-zinc-700"
                                    onClick={() => {
                                      const studentRecord = students.find(st => st.id === s.studentId);
                                      const linkedWallet = wallets.find(w => w.studentIds.includes(s.studentId));
                                      updateStudentRow(i, {
                                        studentId: s.studentId,
                                        displayName: s.displayName,
                                        phone: studentRecord?.clientPhone || '',
                                        isNew: false,
                                        walletOption: linkedWallet ? 'existing' : 'none',
                                        existingWalletId: linkedWallet?.id || '',
                                        newWalletName: '',
                                      });
                                      setStudentSearches(searches => {
                                        const next = [...searches];
                                        next[i] = '';
                                        return next;
                                      });
                                      setFocusedStudentRow(null);
                                    }}
                                  >
                                    {s.displayName}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Price with RM prefix */}
                        <div className="relative shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-zinc-500 pointer-events-none">RM</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.price || ''}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9.]/g, '');
                              updateStudentRow(i, { price: raw === '' ? 0 : Number(raw) });
                            }}
                            placeholder="0"
                            aria-label="Price"
                            className="w-24 pl-9 pr-2 py-2 rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-zinc-100 text-right"
                          />
                        </div>

                        {/* Expand chevron */}
                        <button
                          type="button"
                          onClick={() => toggleStudentRowExpanded(i)}
                          aria-label={isExpanded ? 'Collapse student details' : 'Expand student details'}
                          aria-expanded={isExpanded}
                          className="shrink-0 p-2 rounded-md text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                      {summary && (
                        <div className="mt-1.5 text-xs text-gray-500 dark:text-zinc-400">
                          {summary}
                        </div>
                      )}
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-[#333] bg-white/60 dark:bg-[#141414] p-3 space-y-3 rounded-b-lg">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Phone (optional)</label>
                          <input
                            type="tel"
                            value={row.phone}
                            onChange={e => updateStudentRow(i, { phone: e.target.value })}
                            placeholder="+60 12 345 6789"
                            className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Wallet</label>
                          <select
                            value={row.walletOption === 'existing' ? row.existingWalletId : row.walletOption}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === 'none') {
                                updateStudentRow(i, { walletOption: 'none', existingWalletId: '', newWalletName: '' });
                              } else if (val === 'create') {
                                updateStudentRow(i, { walletOption: 'create', existingWalletId: '', newWalletName: row.displayName });
                              } else {
                                updateStudentRow(i, { walletOption: 'existing', existingWalletId: val, newWalletName: '' });
                              }
                            }}
                            className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
                          >
                            <option value="none">No wallet</option>
                            {wallets.map(w => (
                              <option key={w.id} value={w.id}>{w.name} (RM {w.balance})</option>
                            ))}
                            {studentRows.flatMap((r, ri) =>
                              ri < i && r.walletOption === 'create' && r.newWalletName.trim()
                                ? [<option key={`pending-${ri}`} value={`pending:${ri}`}>{r.newWalletName} (new, shared)</option>]
                                : []
                            )}
                            <option value="create">+ Create new wallet</option>
                          </select>
                        </div>
                        {row.walletOption === 'create' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Wallet name</label>
                            <input
                              type="text"
                              value={row.newWalletName}
                              onChange={e => updateStudentRow(i, { newWalletName: e.target.value })}
                              placeholder="e.g. Mrs. Wong"
                              className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                            />
                          </div>
                        )}
                        {i > 0 && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setStudentRows(rows => rows.filter((_, ri) => ri !== i));
                                setStudentSearches(searches => searches.filter((_, ri) => ri !== i));
                                setExpandedStudentRows(prev => {
                                  const next = new Set<number>();
                                  prev.forEach(idx => {
                                    if (idx < i) next.add(idx);
                                    else if (idx > i) next.add(idx - 1);
                                  });
                                  return next;
                                });
                              }}
                              className="text-xs text-red-500 dark:text-red-400 hover:underline"
                            >
                              Remove student
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setStudentRows(rows => [...rows, {
                    studentId: '', displayName: '', phone: '', isNew: true,
                    walletOption: 'none', existingWalletId: '', newWalletName: '', price: 0,
                  }]);
                  setStudentSearches(searches => [...searches, '']);
                }}
                className="w-full py-2 rounded-lg border border-dashed border-gray-300 dark:border-zinc-600 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50"
              >
                + Add Student
              </button>
            </div>
          </section>

          {/* NOTES */}
          <section>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-500 mb-2">
              Notes <span className="normal-case text-gray-400 dark:text-zinc-600 font-normal">· optional</span>
            </div>
            <textarea
              value={lessonNote}
              onChange={e => setLessonNote(e.target.value)}
              placeholder="Anything worth remembering about this class..."
              className="w-full rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
              rows={2}
            />
          </section>

          {/* Overlap warning */}
          {overlapWarning && (
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-400 text-sm">
              ⚠ {overlapWarning}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-[#333]">
            <button onClick={() => setShowAddLesson(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-zinc-400 hover:underline">Cancel</button>
            <Button onClick={handleCreateLesson} disabled={addingLesson}>
              {addingLesson ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { collection, doc, writeBatch, serverTimestamp, increment, getDoc, updateDoc, deleteDoc, addDoc, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings, useLessonLogs, useClassExceptions, useStudents } from '@/hooks/useCoachData';
import { Button, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Booking, Student } from '@/types';
import { formatTimeDisplay } from '@/lib/availability-engine';
import { findOrCreateStudent } from '@/lib/students';
import { getClassesForDate, getDayOfWeekForDate, isRescheduledToDate, getCancelledClassesForDate } from '@/lib/class-schedule';
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

  const [deletingAdHocGroup, setDeletingAdHocGroup] = useState<number | null>(null);

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
    isNew?: boolean;
    newPhone?: string;
    payPerLesson?: boolean;
    packageSize?: number;
  }>>([]);
  const [addingClass, setAddingClass] = useState(false);
  const [showNewStudentForm, setShowNewStudentForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentPayPerLesson, setNewStudentPayPerLesson] = useState(true);
  const [newStudentPrice, setNewStudentPrice] = useState(0);
  const [newStudentPackageSize, setNewStudentPackageSize] = useState(5);

  // Edit booking modal state
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editLocationId, setEditLocationId] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [showEditSaveOptions, setShowEditSaveOptions] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

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
        : [{ studentId: '', studentName: booking.clientName, attended: true, price, isPrimary: true }];

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
        const studentRecord = students.find((s) => s.id === attendee.studentId);
        const updateData: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        };
        if ((studentRecord?.prepaidTotal ?? 0) > 0) {
          updateData.prepaidUsed = increment(1);
        }

        let studentBasePrice = 0;
        if (studentRecord?.lessonRate != null && studentRecord.lessonRate > 0) {
          studentBasePrice = studentRecord.lessonRate;
        } else if (hasLinkedStudents && booking.studentPrices?.[attendee.studentId] != null) {
          studentBasePrice = booking.studentPrices[attendee.studentId];
        } else if (!hasLinkedStudents) {
          studentBasePrice = booking.price ?? 0;
        }
        if (studentBasePrice > 0 && attendee.price < studentBasePrice) {
          updateData.credit = increment(studentBasePrice - attendee.price);
        }

        if (studentRecord?.payPerLesson && attendee.price > 0) {
          updateData.pendingPayment = increment(attendee.price);
        }

        // Handle package exhaustion in the same batch
        if (studentRecord && studentRecord.prepaidTotal > 0) {
          const remainingAfter = studentRecord.prepaidTotal - (studentRecord.prepaidUsed + 1);
          if (remainingAfter <= 0) {
            if (studentRecord.nextPrepaidTotal && studentRecord.nextPrepaidTotal > 0) {
              // Auto-rollover into next package
              const overflow = Math.max(0, (studentRecord.prepaidUsed + 1) - studentRecord.prepaidTotal);
              updateData.prepaidTotal = studentRecord.nextPrepaidTotal;
              updateData.prepaidUsed = overflow;
              updateData.nextPrepaidTotal = null;
              updateData.nextPrepaidPaidAt = null;
            } else {
              // Set pending payment for exhausted package
              let perLessonPrice = 0;
              if (studentRecord.lessonRate != null && studentRecord.lessonRate > 0) {
                perLessonPrice = studentRecord.lessonRate;
              } else if (hasLinkedStudents && booking.studentPrices?.[attendee.studentId] != null) {
                perLessonPrice = booking.studentPrices[attendee.studentId];
              } else if (!hasLinkedStudents) {
                perLessonPrice = booking.price ?? 0;
              }
              const packagePrice = perLessonPrice * studentRecord.prepaidTotal;
              if (packagePrice > 0) {
                updateData.pendingPayment = packagePrice;
              }
            }
          }
        }

        batch.update(studentRef, updateData);
      }

      await batch.commit();

      // Show post-commit UI notifications (package warnings, auto-renewals)
      for (const attendee of resolvedAttendees) {
        const studentRecord = students.find((s) => s.id === attendee.studentId);
        if (studentRecord && studentRecord.prepaidTotal > 0) {
          const remainingAfter = studentRecord.prepaidTotal - (studentRecord.prepaidUsed + 1);
          if (remainingAfter <= 0) {
            if (studentRecord.nextPrepaidTotal && studentRecord.nextPrepaidTotal > 0) {
              showToast(`${attendee.studentName}'s package auto-renewed (${studentRecord.nextPrepaidTotal} lessons)!`, 'success');
            } else {
              let perLessonPrice = 0;
              if (studentRecord.lessonRate != null && studentRecord.lessonRate > 0) {
                perLessonPrice = studentRecord.lessonRate;
              } else if (hasLinkedStudents && booking.studentPrices?.[attendee.studentId] != null) {
                perLessonPrice = booking.studentPrices[attendee.studentId];
              } else if (!hasLinkedStudents) {
                perLessonPrice = booking.price ?? 0;
              }
              const packagePrice = perLessonPrice * studentRecord.prepaidTotal;
              const currentCredit = (studentRecord.credit ?? 0) + (attendee.price < perLessonPrice ? perLessonPrice - attendee.price : 0);

              setPackageWarning({
                studentName: attendee.studentName,
                remaining: remainingAfter,
                total: studentRecord.prepaidTotal,
                lastPrice: packagePrice,
                credit: currentCredit,
              });
              break;
            }
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
    setShowEditSaveOptions(false);
    setMenuOpen(null);
  };

  const hasEditChanges = () => {
    if (!editBooking) return false;
    return editLocationId !== editBooking.locationId ||
      editStartTime !== editBooking.startTime ||
      editEndTime !== editBooking.endTime ||
      editPrice !== (editBooking.price ?? 0);
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
          notes: editBooking.notes,
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

  const openAddClass = () => {
    setAddClassDate(selectedDateStr);
    setAddClassLocationId(locations[0]?.id || '');
    setAddClassStartTime('');
    setAddClassEndTime('');
    setAddClassNote('');
    setAddClassSearch('');
    setAddClassSelectedStudents([]);
    setShowNewStudentForm(false);
    setNewStudentName('');
    setNewStudentPhone('');
    setNewStudentPayPerLesson(true);
    setNewStudentPrice(0);
    setNewStudentPackageSize(5);
    setShowAddClass(true);
  };

  const toggleAddClassStudent = (student: { studentId: string; displayName: string }) => {
    setAddClassSelectedStudents((prev) => {
      const exists = prev.find((s) => s.studentId === student.studentId);
      if (exists) return prev.filter((s) => s.studentId !== student.studentId);
      // Auto-fill price from student's lessonRate, or their booking price
      const studentRecord = students.find((s) => s.id === student.studentId);
      let autoPrice = studentRecord?.lessonRate ?? 0;
      if (!autoPrice) {
        const studentBooking = bookings.find((b) => {
          if (b.studentPrices?.[student.studentId] != null) return true;
          return b.clientName === studentRecord?.clientName && b.clientPhone === studentRecord?.clientPhone && (b.price ?? 0) > 0;
        });
        autoPrice = studentBooking?.studentPrices?.[student.studentId] ?? studentBooking?.price ?? 0;
      }
      return [...prev, { studentId: student.studentId, displayName: student.displayName, price: autoPrice }];
    });
  };

  const handleAddClass = async () => {
    if (!coach || !db || !addClassLocationId || addClassSelectedStudents.length === 0 || !addClassStartTime || !addClassEndTime) return;
    setAddingClass(true);
    try {
      const firestore = db as Firestore;
      const location = locations.find((l) => l.id === addClassLocationId);
      const locationName = location?.name || '';
      const dayOfWeek = getDayOfWeekForDate(addClassDate);

      // Create new students first (outside batch, since findOrCreateStudent does its own writes)
      const resolvedStudents: typeof addClassSelectedStudents = [];
      for (const selected of addClassSelectedStudents) {
        if (selected.isNew) {
          const studentId = await findOrCreateStudent(firestore, coach.id, selected.displayName, selected.newPhone || '');
          const studentUpdateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
          if (selected.payPerLesson) studentUpdateData.payPerLesson = true;
          if (selected.price > 0) studentUpdateData.lessonRate = selected.price;
          if (!selected.payPerLesson && selected.packageSize && selected.packageSize > 0) {
            studentUpdateData.prepaidTotal = selected.packageSize;
            studentUpdateData.prepaidUsed = 0;
          }
          await updateDoc(doc(firestore, 'coaches', coach.id, 'students', studentId), studentUpdateData);
          resolvedStudents.push({ ...selected, studentId, isNew: false });
        } else {
          resolvedStudents.push(selected);
        }
      }

      // Determine primary student (first selected)
      const primary = resolvedStudents[0];
      const primaryStudent = students.find((s) => s.id === primary.studentId);
      const primaryName = primaryStudent?.clientName || primary.displayName;
      const primaryPhone = primaryStudent?.clientPhone || primary.newPhone || '';
      const totalPrice = resolvedStudents.reduce((sum, s) => sum + s.price, 0);

      // Build booking payload
      const bookingData: Record<string, unknown> = {
        locationId: addClassLocationId,
        locationName,
        dayOfWeek,
        startTime: addClassStartTime,
        endTime: addClassEndTime,
        clientName: primaryName,
        clientPhone: primaryPhone,
        lessonType: resolvedStudents.length > 1 ? 'group' : 'private',
        groupSize: resolvedStudents.length,
        notes: addClassNote.trim(),
        price: totalPrice,
        startDate: addClassDate,
        endDate: addClassDate, // One-time class
        status: 'confirmed',
        createdAt: serverTimestamp(),
      };

      // Handle multiple students (linked students + split prices)
      if (resolvedStudents.length > 1) {
        const linkedStudentIds: string[] = [];
        const studentPrices: Record<string, number> = {};
        studentPrices[primary.studentId] = primary.price;
        for (let i = 1; i < resolvedStudents.length; i++) {
          linkedStudentIds.push(resolvedStudents[i].studentId);
          studentPrices[resolvedStudents[i].studentId] = resolvedStudents[i].price;
        }
        bookingData.linkedStudentIds = linkedStudentIds;
        bookingData.studentPrices = studentPrices;
      }

      await addDoc(collection(firestore, 'coaches', coach.id, 'bookings'), bookingData);
      setShowAddClass(false);
      showToast('Class added!', 'success');
    } catch (error) {
      console.error('Error adding class:', error);
      showToast('Failed to add class', 'error');
    } finally {
      setAddingClass(false);
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

        // Reverse student updates: decrement prepaidUsed, reverse credit
        const student = students.find((s) => s.id === log.studentId);
        if (student) {
          const updateData: Record<string, unknown> = {
            prepaidUsed: increment(-1),
            updatedAt: serverTimestamp(),
          };
          // Reverse credit if price was below lessonRate
          const basePrice = student.lessonRate ?? 0;
          if (log.price < basePrice && basePrice > 0) {
            updateData.credit = increment(-(basePrice - log.price));
          }
          // Reverse pendingPayment for pay-per-lesson
          if (student.payPerLesson && log.price > 0) {
            updateData.pendingPayment = increment(-log.price);
          }
          batch.update(doc(firestore, 'coaches', coach.id, 'students', log.studentId), updateData);
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
                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    {group.reduce((sum, l) => sum + l.price, 0) > 0 && (
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        RM {group.reduce((sum, l) => sum + l.price, 0)}
                      </p>
                    )}
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

          {/* Add new student */}
          {!showNewStudentForm ? (
            <button
              type="button"
              onClick={() => setShowNewStudentForm(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              + Add new student
            </button>
          ) : (
            <div className="border border-blue-200 dark:border-blue-700 rounded-lg p-3 space-y-3 bg-blue-50/50 dark:bg-blue-900/10">
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">New Student</p>
              <input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="Name"
                className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-500 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
              />
              <input
                value={newStudentPhone}
                onChange={(e) => setNewStudentPhone(e.target.value)}
                placeholder="Phone number"
                className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-500 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={newStudentPrice}
                  onChange={(e) => setNewStudentPrice(parseFloat(e.target.value) || 0)}
                  placeholder="Price (RM)"
                  min={0}
                  className="w-28 px-3 py-2 text-sm border border-gray-300 dark:border-zinc-500 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newStudentPayPerLesson}
                    onChange={(e) => setNewStudentPayPerLesson(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-zinc-300">Pay per lesson</span>
                </label>
              </div>
              {!newStudentPayPerLesson && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-zinc-400">Package size:</span>
                  <div className="flex gap-2">
                    {[5, 10].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setNewStudentPackageSize(size)}
                        className={`px-3 py-1 text-sm rounded-lg border ${newStudentPackageSize === size
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 dark:border-zinc-500 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-[#2a2a2a]'
                        }`}
                      >
                        {size} lessons
                      </button>
                    ))}
                    <input
                      type="number"
                      value={newStudentPackageSize}
                      onChange={(e) => setNewStudentPackageSize(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-zinc-500 rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-center"
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!newStudentName.trim()}
                  onClick={() => {
                    const tempId = `new_${Date.now()}`;
                    setAddClassSelectedStudents((prev) => [
                      ...prev,
                      {
                        studentId: tempId,
                        displayName: newStudentName.trim(),
                        price: newStudentPrice,
                        isNew: true,
                        newPhone: newStudentPhone.trim(),
                        payPerLesson: newStudentPayPerLesson,
                        packageSize: newStudentPayPerLesson ? undefined : newStudentPackageSize,
                      },
                    ]);
                    setShowNewStudentForm(false);
                    setNewStudentName('');
                    setNewStudentPhone('');
                    setNewStudentPayPerLesson(true);
                    setNewStudentPrice(0);
                    setNewStudentPackageSize(5);
                  }}
                >
                  Add
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowNewStudentForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Selected students with prices */}
          {addClassSelectedStudents.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Pricing</p>
              {addClassSelectedStudents.map((selected, idx) => (
                <div key={selected.studentId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#1a1a1a] rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-zinc-100">
                      {selected.displayName}
                      {selected.isNew && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">New</span>
                      )}
                      {selected.payPerLesson && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-zinc-500">Pay per lesson</span>
                      )}
                      {selected.isNew && !selected.payPerLesson && selected.packageSize && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-zinc-500">{selected.packageSize}-lesson package</span>
                      )}
                    </p>
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

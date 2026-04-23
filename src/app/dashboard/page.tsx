'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  increment,
  deleteDoc,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  setDoc,
  Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import {
  useBookings,
  useLessonLogs,
  useClassExceptions,
  useStudents,
  useWallets,
  useLocations,
} from '@/hooks/useCoachData';
import { useToast } from '@/components/ui/Toast';
import type { Booking, Student, Wallet, Location } from '@/types';
import {
  getClassesForDate,
  getBookingTotal,
  getBackingException,
  getCancelledClassesForDate,
  getDayOfWeekForDate,
} from '@/lib/class-schedule';
import { resolveWallet } from '@/lib/wallets';
import { findOrCreateStudent } from '@/lib/students';
import { isLowBalance } from '@/lib/wallet-alerts';
import { formatTimeDisplay } from '@/lib/time-format';
import { formatDateFull, formatDateShort, parseDateString } from '@/lib/date-format';
import {
  Btn,
  Chip,
  BalancePill,
  Avatar,
  PaperModal,
  IconCheck,
  IconPlus,
  IconPin,
  IconUsers,
  IconUndo,
  IconChevL,
  IconChevR,
  IconArrowUp,
  IconMore,
  IconEdit,
  IconCopy,
  IconTrash,
  IconClose,
  IconSearch,
  IconRepeat,
} from '@/components/paper';

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function weekStartMon(d: Date): Date {
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  return addDays(d, delta);
}

function fmtTimeShort(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'p' : 'a';
  const h12 = hh % 12 || 12;
  if (mm === 0) return `${h12}${period}`;
  return `${h12}:${String(mm).padStart(2, '0')}${period}`;
}

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

export default function DashboardPage() {
  const { coach } = useAuth();
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const { students } = useStudents(coach?.id);
  const { wallets } = useWallets(coach?.id);
  const { locations } = useLocations(coach?.id);
  const { showToast } = useToast();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const selectedDateStr = useMemo(() => ymd(selectedDate), [selectedDate]);
  const todayStr = useMemo(() => ymd(new Date()), []);

  const { classExceptions } = useClassExceptions(coach?.id, selectedDateStr);
  const { lessonLogs } = useLessonLogs(coach?.id, selectedDateStr);

  const todaysClasses = useMemo(
    () => getClassesForDate(selectedDateStr, bookings, classExceptions),
    [selectedDateStr, bookings, classExceptions],
  );

  const cancelledToday = useMemo(
    () => getCancelledClassesForDate(selectedDateStr, bookings, classExceptions),
    [selectedDateStr, bookings, classExceptions],
  );

  const doneByBookingId = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lessonLogs) {
      if (!l.bookingId) continue;
      m.set(l.bookingId, (m.get(l.bookingId) ?? 0) + l.price);
    }
    return m;
  }, [lessonLogs]);

  const doneStudentsByBookingId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of lessonLogs) {
      if (!l.bookingId || !l.studentId) continue;
      const arr = m.get(l.bookingId) ?? [];
      if (!arr.includes(l.studentId)) arr.push(l.studentId);
      m.set(l.bookingId, arr);
    }
    return m;
  }, [lessonLogs]);

  const doneCount = todaysClasses.filter((c) => doneByBookingId.has(c.id)).length;
  const totalCount = todaysClasses.length;
  const todayRevenue = lessonLogs.reduce((s, l) => s + l.price, 0);
  const expectedRevenue =
    todaysClasses.reduce((s, c) => {
      if (doneByBookingId.has(c.id)) return s + (doneByBookingId.get(c.id) ?? 0);
      return s + getBookingTotal(c);
    }, 0) +
    cancelledToday.reduce((s, c) => s + getBookingTotal(c.booking), 0);

  const lowWallets = useMemo(() => {
    return wallets
      .filter((w) => isLowBalance(w, bookings, todayStr))
      .sort((a, b) => a.balance - b.balance);
  }, [wallets, bookings, todayStr]);

  const weekDays = useMemo(() => {
    const start = weekStartMon(selectedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const classesPerDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of weekDays) {
      const k = ymd(d);
      map.set(k, getClassesForDate(k, bookings, classExceptions).length);
    }
    return map;
  }, [weekDays, bookings, classExceptions]);

  const displayName = coach?.displayName || 'Coach';
  const firstName = displayName.split(' ')[0] || 'Coach';
  const isToday = selectedDateStr === todayStr;

  // Mark-done modal state
  const [markDoneBooking, setMarkDoneBooking] = useState<Booking | null>(null);
  const [markDoneAmounts, setMarkDoneAmounts] = useState<Record<string, number>>({});
  const [markDoneAttending, setMarkDoneAttending] = useState<string[]>([]);
  const [markingDone, setMarkingDone] = useState(false);

  const openMarkDone = (c: Booking) => {
    setMarkDoneBooking(c);
    const init: Record<string, number> = {};
    for (const sid of c.studentIds) init[sid] = c.studentPrices[sid] ?? 0;
    setMarkDoneAmounts(init);
    setMarkDoneAttending([...c.studentIds]);
  };

  const closeMarkDone = () => {
    setMarkDoneBooking(null);
    setMarkDoneAmounts({});
    setMarkDoneAttending([]);
  };

  const handleConfirmMarkDone = async () => {
    const booking = markDoneBooking;
    if (!coach || !db || !booking) return;
    if (markDoneAttending.length === 0) return;
    setMarkingDone(true);
    const attendingIds = markDoneAttending;
    closeMarkDone();
    showToast(`Marked ${booking.className || 'class'} done`, 'success');
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      for (const studentId of attendingIds) {
        const price = markDoneAmounts[studentId] ?? booking.studentPrices[studentId] ?? 0;
        const studentName = students.find((s) => s.id === studentId)?.clientName ?? '';

        const logRef = doc(collection(firestore, 'coaches', coach.id, 'lessonLogs'));
        batch.set(logRef, {
          date: selectedDateStr,
          bookingId: booking.id,
          studentId,
          studentName,
          locationName: booking.locationName,
          startTime: booking.startTime,
          endTime: booking.endTime,
          price,
          createdAt: serverTimestamp(),
        });

        const wallet = resolveWallet(booking, studentId, wallets);
        if (wallet && price > 0) {
          const newBalance = wallet.balance - price;
          const txnRef = doc(
            collection(firestore, 'coaches', coach.id, 'wallets', wallet.id, 'transactions'),
          );
          batch.set(txnRef, {
            type: 'charge',
            amount: -price,
            balanceAfter: newBalance,
            description: `Lesson — ${studentName} (${booking.startTime})`,
            studentId,
            lessonLogId: logRef.id,
            date: selectedDateStr,
            createdAt: serverTimestamp(),
          });
          batch.update(doc(firestore, 'coaches', coach.id, 'wallets', wallet.id), {
            balance: increment(-price),
            updatedAt: serverTimestamp(),
          });
        }

        batch.update(doc(firestore, 'coaches', coach.id, 'students', studentId), {
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    } catch (e) {
      console.error(e);
      showToast('Failed to mark class as done', 'error');
    } finally {
      setMarkingDone(false);
    }
  };

  const handleCancelClass = async (c: Booking) => {
    if (!coach || !db) return;
    try {
      const firestore = db as Firestore;
      const backing = getBackingException(c.id, selectedDateStr, classExceptions);
      const isOneTime = !!(c.startDate && c.endDate && c.startDate === c.endDate);

      if (backing) {
        const batch = writeBatch(firestore);
        batch.update(doc(firestore, 'coaches', coach.id, 'classExceptions', backing.id), {
          type: 'cancelled',
        });
        await batch.commit();
      } else if (isOneTime) {
        const batch = writeBatch(firestore);
        batch.delete(doc(firestore, 'coaches', coach.id, 'bookings', c.id));
        const exQuery = query(
          collection(firestore, 'coaches', coach.id, 'classExceptions'),
          where('bookingId', '==', c.id),
        );
        const exSnapshot = await getDocs(exQuery);
        for (const d of exSnapshot.docs) {
          batch.delete(doc(firestore, 'coaches', coach.id, 'classExceptions', d.id));
        }
        await batch.commit();
      } else {
        await addDoc(collection(firestore, 'coaches', coach.id, 'classExceptions'), {
          bookingId: c.id,
          originalDate: selectedDateStr,
          type: 'cancelled',
          createdAt: serverTimestamp(),
        });
      }
      showToast(`Cancelled ${c.className || 'class'}`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to cancel class', 'error');
    }
  };

  const handleUndoMarkDone = async (c: Booking) => {
    if (!coach || !db) return;
    try {
      const firestore = db as Firestore;
      const logs = lessonLogs.filter((l) => l.bookingId === c.id && l.date === selectedDateStr);
      if (logs.length === 0) return;
      const batch = writeBatch(firestore);
      for (const l of logs) {
        batch.delete(doc(firestore, 'coaches', coach.id, 'lessonLogs', l.id));
        const wallet = resolveWallet(c, l.studentId, wallets);
        if (wallet && l.price > 0) {
          const newBalance = wallet.balance + l.price;
          const txnRef = doc(
            collection(firestore, 'coaches', coach.id, 'wallets', wallet.id, 'transactions'),
          );
          batch.set(txnRef, {
            type: 'refund',
            amount: l.price,
            balanceAfter: newBalance,
            description: `Reversed — ${l.studentName}`,
            studentId: l.studentId,
            date: selectedDateStr,
            createdAt: serverTimestamp(),
          });
          batch.update(doc(firestore, 'coaches', coach.id, 'wallets', wallet.id), {
            balance: increment(l.price),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
      showToast('Reopened class', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to undo', 'error');
    }
  };

  const handleUndoCancel = async (exceptionId: string) => {
    if (!coach || !db) return;
    try {
      const firestore = db as Firestore;
      await deleteDoc(doc(firestore, 'coaches', coach.id, 'classExceptions', exceptionId));
      showToast('Cancellation undone', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to undo', 'error');
    }
  };

  const handleDuplicate = async (c: Booking) => {
    if (!coach || !db) return;
    try {
      const firestore = db as Firestore;
      const payload: Record<string, unknown> = {
        locationId: c.locationId,
        locationName: c.locationName,
        dayOfWeek: c.dayOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        status: 'confirmed',
        className: c.className ? `${c.className} (copy)` : '',
        notes: c.notes ?? '',
        studentIds: c.studentIds,
        studentPrices: c.studentPrices,
        studentWallets: c.studentWallets,
        createdAt: serverTimestamp(),
      };
      if (c.startDate) payload.startDate = c.startDate;
      if (c.endDate) payload.endDate = c.endDate;
      await addDoc(collection(firestore, 'coaches', coach.id, 'bookings'), payload);
      showToast('Class duplicated', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to duplicate', 'error');
    }
  };

  // Edit-class modal state
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editBackingExceptionId, setEditBackingExceptionId] = useState<string | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [editLocationId, setEditLocationId] = useState('');
  const [editDate, setEditDate] = useState('');
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

  const openEditBooking = (booking: Booking) => {
    setEditBooking(booking);
    setEditBackingExceptionId(getBackingException(booking.id, selectedDateStr, classExceptions)?.id ?? null);
    setEditClassName(booking.className || '');
    setEditLocationId(booking.locationId);
    setEditDate(selectedDateStr);
    setEditStartTime(booking.startTime);
    setEditEndTime(booking.endTime);
    setEditNote(booking.notes || '');
    setEditStudentIds([...booking.studentIds]);
    setEditStudentPrices({ ...booking.studentPrices });
    setEditStudentWallets({ ...booking.studentWallets });
    setEditAddStudentOpen(false);
    setEditAddStudentSearch('');
    setShowEditSaveOptions(false);
  };

  const closeEditBooking = () => {
    setEditBooking(null);
    setEditBackingExceptionId(null);
    setShowEditSaveOptions(false);
  };

  const getLastPriceForStudent = (studentId: string): number => {
    const sorted = [...bookings].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    for (const b of sorted) {
      const p = b.studentPrices[studentId];
      if (p !== undefined && p > 0) return p;
    }
    return 0;
  };

  const hasEditChanges = () => {
    if (!editBooking) return false;
    if (editClassName !== (editBooking.className || '')) return true;
    if (editLocationId !== editBooking.locationId) return true;
    if (editDate !== selectedDateStr) return true;
    if (editStartTime !== editBooking.startTime) return true;
    if (editEndTime !== editBooking.endTime) return true;
    if (editNote !== (editBooking.notes || '')) return true;
    const origIds = editBooking.studentIds;
    if (editStudentIds.length !== origIds.length) return true;
    for (const id of editStudentIds) if (!origIds.includes(id)) return true;
    for (const id of editStudentIds) {
      if ((editBooking.studentPrices[id] ?? 0) !== (editStudentPrices[id] ?? 0)) return true;
      if ((editBooking.studentWallets[id] ?? '') !== (editStudentWallets[id] ?? '')) return true;
    }
    return false;
  };

  const handleEditSave = async (mode?: 'this' | 'future') => {
    if (!coach || !db || !editBooking) return;
    if (!hasEditChanges()) {
      showToast('No changes to save', 'error');
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

      const studentPricesOut: Record<string, number> = {};
      for (const id of editStudentIds) studentPricesOut[id] = editStudentPrices[id] ?? 0;
      const studentWalletsOut: Record<string, string> = {};
      for (const id of editStudentIds) {
        const w = editStudentWallets[id];
        if (w) studentWalletsOut[id] = w;
      }

      const isOneTime = !!(
        editBooking.startDate &&
        editBooking.endDate &&
        editBooking.startDate === editBooking.endDate
      );
      const effectiveDate = editDate || selectedDateStr;

      if (isOneTime) {
        const update: Record<string, unknown> = {
          className: editClassName.trim(),
          locationId: editLocationId,
          locationName: newLocationName,
          startTime: editStartTime,
          endTime: editEndTime,
          notes: editNote,
          studentIds: editStudentIds,
          studentPrices: studentPricesOut,
          studentWallets: studentWalletsOut,
          updatedAt: serverTimestamp(),
        };
        if (effectiveDate !== selectedDateStr) {
          update.startDate = effectiveDate;
          update.endDate = effectiveDate;
          update.dayOfWeek = getDayOfWeekForDate(effectiveDate);
        }
        await updateDoc(doc(firestore, 'coaches', coach.id, 'bookings', editBooking.id), update);
        showToast('Updated', 'success');
      } else if (editBackingExceptionId) {
        await updateDoc(
          doc(firestore, 'coaches', coach.id, 'classExceptions', editBackingExceptionId),
          {
            newDate: effectiveDate,
            newStartTime: editStartTime,
            newEndTime: editEndTime,
            newLocationId: editLocationId,
            newLocationName: newLocationName,
            newNote: editNote,
            newClassName: editClassName.trim(),
            newStudentIds: editStudentIds,
            newStudentPrices: studentPricesOut,
            newStudentWallets: studentWalletsOut,
          },
        );
        showToast('Updated for this date', 'success');
      } else if (mode === 'this') {
        const exRef = doc(collection(firestore, 'coaches', coach.id, 'classExceptions'));
        await setDoc(exRef, {
          bookingId: editBooking.id,
          originalDate: selectedDateStr,
          type: 'rescheduled',
          newDate: effectiveDate,
          newStartTime: editStartTime,
          newEndTime: editEndTime,
          newLocationId: editLocationId,
          newLocationName: newLocationName,
          newNote: editNote,
          newClassName: editClassName.trim(),
          newStudentIds: editStudentIds,
          newStudentPrices: studentPricesOut,
          newStudentWallets: studentWalletsOut,
          createdAt: serverTimestamp(),
        });
        showToast('Updated for this date', 'success');
      } else if (mode === 'future') {
        const batch = writeBatch(firestore);
        const oldBookingRef = doc(firestore, 'coaches', coach.id, 'bookings', editBooking.id);
        const newDayOfWeek =
          effectiveDate !== selectedDateStr
            ? getDayOfWeekForDate(effectiveDate)
            : editBooking.dayOfWeek;
        const lastOccurrence = new Date(selectedDate);
        lastOccurrence.setDate(lastOccurrence.getDate() - 7);
        const lastOccurrenceStr = ymd(lastOccurrence);
        const startDateStr = editBooking.startDate;
        const hasPriorOccurrences = !startDateStr || lastOccurrenceStr >= startDateStr;

        if (hasPriorOccurrences) {
          batch.update(oldBookingRef, {
            endDate: lastOccurrenceStr,
            updatedAt: serverTimestamp(),
          });
          const newBookingRef = doc(collection(firestore, 'coaches', coach.id, 'bookings'));
          const newData: Record<string, unknown> = {
            locationId: editLocationId,
            locationName: newLocationName,
            dayOfWeek: newDayOfWeek,
            startTime: editStartTime,
            endTime: editEndTime,
            status: 'confirmed',
            className: editClassName.trim(),
            notes: editNote,
            studentIds: editStudentIds,
            studentPrices: studentPricesOut,
            studentWallets: studentWalletsOut,
            startDate: effectiveDate,
            createdAt: serverTimestamp(),
          };
          batch.set(newBookingRef, newData);
        } else {
          batch.update(oldBookingRef, {
            locationId: editLocationId,
            locationName: newLocationName,
            dayOfWeek: newDayOfWeek,
            startTime: editStartTime,
            endTime: editEndTime,
            className: editClassName.trim(),
            notes: editNote,
            studentIds: editStudentIds,
            studentPrices: studentPricesOut,
            studentWallets: studentWalletsOut,
            startDate: effectiveDate,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        showToast('Future events updated', 'success');
      }
      closeEditBooking();
    } catch (e) {
      console.error(e);
      showToast('Failed to update', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const editTotalPrice = editStudentIds.reduce(
    (sum, id) => sum + (editStudentPrices[id] ?? 0),
    0,
  );

  // Add-lesson modal
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden lg:block px-7 py-7 max-w-[1200px] mx-auto">
        <DesktopHero
          selectedDate={selectedDate}
          isToday={isToday}
          firstName={firstName}
          totalCount={totalCount}
          doneCount={doneCount}
          earliest={todaysClasses[0]?.startTime}
          onToday={() => setSelectedDate(new Date())}
          onAdd={() => setShowAdd(true)}
        />

        <WeekStrip
          weekDays={weekDays}
          selectedDateStr={selectedDateStr}
          todayStr={todayStr}
          classesPerDay={classesPerDay}
          onPick={setSelectedDate}
          onWeekShift={(delta) => setSelectedDate(addDays(selectedDate, delta))}
        />

        <div className="grid grid-cols-[1fr_300px] gap-5 items-start">
          <div>
            <SectionHeader
              title="Classes"
              trailing={
                totalCount > 0 && (
                  <div className="text-[12px] tnum" style={{ color: 'var(--ink-3)' }}>
                    {doneCount}/{totalCount} done
                  </div>
                )
              }
            />
            <div className="flex flex-col gap-2.5">
              {totalCount === 0 && (
                <div
                  className="rounded-[14px] border p-7 text-center text-[13px]"
                  style={{
                    background: 'var(--panel)',
                    borderColor: 'var(--line)',
                    color: 'var(--ink-3)',
                  }}
                >
                  Nothing on the schedule.
                </div>
              )}
              {todaysClasses.map((c) => (
                <ClassCard
                  key={c.id}
                  cls={c}
                  students={students}
                  wallets={wallets}
                  bookings={bookings}
                  todayStr={todayStr}
                  isDone={doneByBookingId.has(c.id)}
                  doneTotal={doneByBookingId.get(c.id) ?? 0}
                  attendedIds={doneStudentsByBookingId.get(c.id)}
                  onMarkDone={() => openMarkDone(c)}
                  onCancel={() => handleCancelClass(c)}
                  onUndo={() => handleUndoMarkDone(c)}
                  onEdit={() => openEditBooking(c)}
                  onDuplicate={() => handleDuplicate(c)}
                  compact={false}
                />
              ))}
              {cancelledToday.length > 0 && (
                <CancelledList
                  items={cancelledToday}
                  onUndo={(id) => handleUndoCancel(id)}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            <StatCard
              label={isToday ? 'Earned today' : `Earned ${formatDateShort(selectedDate)}`}
              value={`RM ${Math.round(todayRevenue)}`}
              sub={`of RM ${Math.round(expectedRevenue)} expected`}
            />
            <LowWalletsCard wallets={lowWallets} />
            <QuickActionsCard
              onAdd={() => setShowAdd(true)}
            />
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden px-4 py-4">
        <div className="flex items-center gap-1.5 mb-3.5">
          <div className="text-[15px] font-semibold flex-1">
            {isToday ? 'Today' : formatDateShort(selectedDate)}
          </div>
          <Btn size="sm" variant="outline" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>
            <IconChevL size={14} />
          </Btn>
          <Btn size="sm" variant="outline" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
            <IconChevR size={14} />
          </Btn>
        </div>

        <WeekStrip
          weekDays={weekDays}
          selectedDateStr={selectedDateStr}
          todayStr={todayStr}
          classesPerDay={classesPerDay}
          onPick={setSelectedDate}
          onWeekShift={(delta) => setSelectedDate(addDays(selectedDate, delta))}
          compact
        />

        <SectionHeader
          title="Classes"
          trailing={
            totalCount > 0 && (
              <div className="text-[12px] tnum" style={{ color: 'var(--ink-3)' }}>
                {doneCount}/{totalCount} done
              </div>
            )
          }
        />
        <div className="flex flex-col gap-2.5">
          {totalCount === 0 && (
            <div
              className="rounded-[14px] border p-7 text-center text-[13px]"
              style={{
                background: 'var(--panel)',
                borderColor: 'var(--line)',
                color: 'var(--ink-3)',
              }}
            >
              Nothing on the schedule.
            </div>
          )}
          {todaysClasses.map((c) => (
            <ClassCard
              key={c.id}
              cls={c}
              students={students}
              wallets={wallets}
              bookings={bookings}
              todayStr={todayStr}
              isDone={doneByBookingId.has(c.id)}
              doneTotal={doneByBookingId.get(c.id) ?? 0}
              attendedIds={doneStudentsByBookingId.get(c.id)}
              onMarkDone={() => openMarkDone(c)}
              onCancel={() => handleCancelClass(c)}
              onUndo={() => handleUndoMarkDone(c)}
              onEdit={() => openEditBooking(c)}
              onDuplicate={() => handleDuplicate(c)}
              compact
            />
          ))}
          {cancelledToday.length > 0 && (
            <CancelledList items={cancelledToday} onUndo={(id) => handleUndoCancel(id)} />
          )}
          <Btn variant="outline" full onClick={() => setShowAdd(true)}>
            <IconPlus size={14} /> Add lesson
          </Btn>
        </div>

        {/* mobile stat row */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatCard
            label={isToday ? 'Earned today' : `Earned ${formatDateShort(selectedDate)}`}
            value={`RM ${Math.round(todayRevenue)}`}
            sub={`of RM ${Math.round(expectedRevenue)}`}
          />
          <StatCard
            label="Low wallets"
            value={`${lowWallets.length}`}
            sub={lowWallets.length > 0 ? 'need top-up' : 'all healthy'}
          />
        </div>
      </div>

      <MarkDoneModal
        open={!!markDoneBooking}
        booking={markDoneBooking}
        amounts={markDoneAmounts}
        onAmountsChange={setMarkDoneAmounts}
        attending={markDoneAttending}
        onRemoveAttendee={(sid) =>
          setMarkDoneAttending((prev) => prev.filter((x) => x !== sid))
        }
        onRestoreAttendee={(sid) =>
          setMarkDoneAttending((prev) => (prev.includes(sid) ? prev : [...prev, sid]))
        }
        students={students}
        wallets={wallets}
        busy={markingDone}
        onClose={closeMarkDone}
        onConfirm={handleConfirmMarkDone}
      />

      <AddLessonModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        coachId={coach?.id}
        students={students}
        wallets={wallets}
        locations={locations}
        defaultDate={selectedDateStr}
      />

      <EditClassModal
        open={editBooking !== null}
        booking={editBooking}
        backingExceptionId={editBackingExceptionId}
        selectedDate={selectedDate}
        selectedDateStr={selectedDateStr}
        className={editClassName}
        onClassNameChange={setEditClassName}
        locationId={editLocationId}
        onLocationIdChange={setEditLocationId}
        date={editDate}
        onDateChange={setEditDate}
        startTime={editStartTime}
        onStartTimeChange={(t) => {
          if (editStartTime && editEndTime) {
            setEditEndTime(shiftEndTime(editStartTime, editEndTime, t));
          }
          setEditStartTime(t);
        }}
        endTime={editEndTime}
        onEndTimeChange={setEditEndTime}
        note={editNote}
        onNoteChange={setEditNote}
        studentIds={editStudentIds}
        studentPrices={editStudentPrices}
        studentWallets={editStudentWallets}
        onRemoveStudent={(sid) => {
          setEditStudentIds((ids) => ids.filter((i) => i !== sid));
          setEditStudentPrices((p) => {
            const next = { ...p };
            delete next[sid];
            return next;
          });
          setEditStudentWallets((w) => {
            const next = { ...w };
            delete next[sid];
            return next;
          });
        }}
        onStudentPriceChange={(sid, v) =>
          setEditStudentPrices({ ...editStudentPrices, [sid]: v })
        }
        onStudentWalletChange={(sid, v) =>
          setEditStudentWallets({ ...editStudentWallets, [sid]: v })
        }
        addStudentOpen={editAddStudentOpen}
        onAddStudentOpenChange={setEditAddStudentOpen}
        addStudentSearch={editAddStudentSearch}
        onAddStudentSearchChange={setEditAddStudentSearch}
        onAddStudent={(s) => {
          const lastPrice = getLastPriceForStudent(s.id);
          const linkedWallet = wallets.find((w) => w.studentIds.includes(s.id));
          setEditStudentIds([...editStudentIds, s.id]);
          setEditStudentPrices({ ...editStudentPrices, [s.id]: lastPrice });
          setEditStudentWallets({
            ...editStudentWallets,
            [s.id]: linkedWallet?.id || '',
          });
          setEditAddStudentOpen(false);
          setEditAddStudentSearch('');
        }}
        totalPrice={editTotalPrice}
        students={students}
        wallets={wallets}
        locations={locations}
        showSaveOptions={showEditSaveOptions}
        onShowSaveOptions={setShowEditSaveOptions}
        saving={editSaving}
        canSave={hasEditChanges() && editStudentIds.length > 0}
        onSave={handleEditSave}
        onClose={closeEditBooking}
      />
    </>
  );
}

function shiftEndTime(oldStart: string, oldEnd: string, newStart: string): string {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toStr = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const duration = toMin(oldEnd) - toMin(oldStart);
  if (duration <= 0) return oldEnd;
  const maxMin = 23 * 60 + 55;
  return toStr(Math.min(toMin(newStart) + duration, maxMin));
}

// ────────────────────────────────────────────────────────────────────────────

function DesktopHero({
  selectedDate,
  isToday,
  firstName,
  totalCount,
  doneCount,
  earliest,
  onToday,
  onAdd,
}: {
  selectedDate: Date;
  isToday: boolean;
  firstName: string;
  totalCount: number;
  doneCount: number;
  earliest: string | undefined;
  onToday: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-end justify-between mb-5 gap-5">
      <div>
        <div
          className="text-[11px] font-medium uppercase mb-1.5"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.05em' }}
        >
          {formatDateFull(selectedDate)}
        </div>
        <div
          className="text-[30px] font-semibold leading-[1.1]"
          style={{ color: 'var(--ink)', letterSpacing: '-0.8px' }}
        >
          {isToday ? `Good morning, ${firstName}.` : `Viewing ${formatDateShort(selectedDate)}`}
        </div>
        <div className="text-[14px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
          {totalCount > 0 ? (
            <>
              You have{' '}
              <b style={{ color: 'var(--ink)' }}>
                {totalCount} {totalCount === 1 ? 'class' : 'classes'}
              </b>
              {doneCount > 0 && <> · {doneCount} done</>}
              {earliest && (
                <>
                  . Earliest at <b style={{ color: 'var(--ink)' }}>{formatTimeDisplay(earliest)}</b>.
                </>
              )}
            </>
          ) : (
            <>Nothing scheduled. Enjoy the day.</>
          )}
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <Btn variant="outline" onClick={onToday}>Today</Btn>
        <Btn variant="primary" onClick={onAdd}>
          <IconPlus size={14} /> Add lesson
        </Btn>
      </div>
    </div>
  );
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtWeekRange(weekDays: Date[]): string {
  if (weekDays.length === 0) return '';
  const start = weekDays[0];
  const end = weekDays[weekDays.length - 1];
  const startLbl = `${MONTH_ABBR[start.getMonth()]} ${start.getDate()}`;
  const endLbl =
    start.getMonth() === end.getMonth()
      ? `${end.getDate()}`
      : `${MONTH_ABBR[end.getMonth()]} ${end.getDate()}`;
  return `${startLbl} – ${endLbl}`;
}

function WeekStrip({
  weekDays,
  selectedDateStr,
  todayStr,
  classesPerDay,
  onPick,
  onWeekShift,
  compact = false,
}: {
  weekDays: Date[];
  selectedDateStr: string;
  todayStr: string;
  classesPerDay: Map<string, number>;
  onPick: (d: Date) => void;
  onWeekShift?: (delta: number) => void;
  compact?: boolean;
}) {
  return (
    <div className="mb-5">
      {onWeekShift && (
        <div className="flex items-center justify-between mb-2">
          <div
            className="text-[12px] font-medium tnum"
            style={{ color: 'var(--ink-2)' }}
          >
            {fmtWeekRange(weekDays)}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => onWeekShift(-7)}
              className="p-1 rounded-md border"
              style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
            >
              <IconChevL size={14} />
            </button>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => onWeekShift(7)}
              className="p-1 rounded-md border"
              style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
            >
              <IconChevR size={14} />
            </button>
          </div>
        </div>
      )}
    <div
      className="grid grid-cols-7"
      style={{ gap: compact ? 4 : 8 }}
    >
      {weekDays.map((d, i) => {
        const k = ymd(d);
        const isSel = k === selectedDateStr;
        const isToday = k === todayStr;
        const count = classesPerDay.get(k) ?? 0;
        return (
          <button
            key={i}
            onClick={() => onPick(d)}
            className="rounded-[10px] flex flex-col items-center gap-1 border transition-colors"
            style={{
              borderColor: isSel ? 'var(--ink)' : 'var(--line)',
              background: isSel ? 'var(--ink)' : 'var(--panel)',
              color: isSel ? 'var(--bg)' : 'var(--ink)',
              padding: compact ? '8px 4px' : '10px 8px',
            }}
          >
            <span
              className="text-[10px] font-medium uppercase"
              style={{ opacity: 0.7, letterSpacing: '0.04em' }}
            >
              {SHORT_DAYS[i]}
            </span>
            <span
              className="font-semibold"
              style={{
                fontSize: compact ? 15 : 18,
                letterSpacing: '-0.4px',
              }}
            >
              {d.getDate()}
            </span>
            <span className="flex gap-[2px] h-1">
              {Array.from({ length: Math.min(count, 4) }).map((_, j) => (
                <span
                  key={j}
                  className="w-1 h-1 rounded-sm"
                  style={{
                    background: isSel
                      ? 'var(--bg)'
                      : isToday
                        ? 'var(--accent)'
                        : 'var(--ink-4)',
                    opacity: isSel ? 0.85 : 1,
                  }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
    </div>
  );
}

function SectionHeader({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div
        className="text-[11px] font-semibold uppercase"
        style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
      >
        {title}
      </div>
      {trailing}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      <div
        className="text-[11.5px] font-medium uppercase mb-1.5"
        style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
      >
        {label}
      </div>
      <div
        className="mono tnum text-[26px] font-semibold"
        style={{ color: 'var(--ink)', letterSpacing: '-0.6px' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[12px] mt-1" style={{ color: 'var(--ink-3)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ClassActionsMenu({
  onMarkDone,
  onEdit,
  onDuplicate,
  onCancel,
}: {
  onMarkDone: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
  }[] = [
    { label: 'Mark done', icon: <IconCheck size={14} />, onClick: onMarkDone },
    { label: 'Edit', icon: <IconEdit size={14} />, onClick: onEdit },
    { label: 'Duplicate', icon: <IconCopy size={14} />, onClick: onDuplicate },
    { label: 'Cancel lesson', icon: <IconTrash size={14} />, onClick: onCancel, danger: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Class actions"
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded-md"
        style={{ color: 'var(--ink-3)' }}
      >
        <IconMore size={16} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 min-w-[170px] rounded-[10px] border py-1"
          style={{
            background: 'var(--panel)',
            borderColor: 'var(--line)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left"
              style={{ color: it.danger ? 'var(--bad)' : 'var(--ink-2)' }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClassCard({
  cls,
  students,
  wallets,
  bookings,
  todayStr,
  isDone,
  doneTotal,
  attendedIds,
  onMarkDone,
  onCancel,
  onUndo,
  onEdit,
  onDuplicate,
  compact,
}: {
  cls: Booking;
  students: Student[];
  wallets: Wallet[];
  bookings: Booking[];
  todayStr: string;
  isDone: boolean;
  doneTotal: number;
  attendedIds?: string[];
  onMarkDone: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  compact: boolean;
}) {
  const effectiveIds = isDone && attendedIds ? attendedIds : cls.studentIds;
  const isGroup = effectiveIds.length > 1;
  const total = isDone ? doneTotal : getBookingTotal(cls);
  const attendees = effectiveIds
    .map((sid) => students.find((s) => s.id === sid))
    .filter((s): s is Student => !!s);
  const walletsFor = cls.studentIds
    .map((sid) => resolveWallet(cls, sid, wallets))
    .filter((w): w is Wallet => !!w);
  const anyLow = walletsFor.some((w) => isLowBalance(w, bookings, todayStr));
  const duration = minutesBetween(cls.startTime, cls.endTime);
  const isRecurring = !cls.startDate || !cls.endDate || cls.startDate !== cls.endDate;

  return (
    <div
      className="rounded-[14px] border flex items-stretch relative"
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--line)',
        padding: compact ? 14 : 16,
        gap: compact ? 12 : 16,
        opacity: isDone ? 0.72 : 1,
      }}
    >
      {/* Time column */}
      <div
        className="flex-shrink-0 border-r"
        style={{
          width: compact ? 58 : 66,
          paddingRight: compact ? 12 : 16,
          borderColor: 'var(--line)',
        }}
      >
        <div
          className="mono tnum font-semibold leading-[1.1]"
          style={{
            color: 'var(--ink)',
            fontSize: compact ? 15 : 16,
            letterSpacing: '-0.3px',
          }}
        >
          {fmtTimeShort(cls.startTime)}
        </div>
        <div
          className="mono tnum text-[11.5px] mt-0.5"
          style={{ color: 'var(--ink-3)' }}
        >
          → {fmtTimeShort(cls.endTime)}
        </div>
        <div
          className="text-[10.5px] font-medium uppercase mt-2"
          style={{ color: 'var(--ink-4)', letterSpacing: '0.04em' }}
        >
          {duration} min
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {isRecurring && (
            <span
              className="inline-flex items-center justify-center rounded-md"
              style={{
                color: 'var(--accent)',
                background: 'var(--accent-soft)',
                padding: '2px 4px',
              }}
              title="Recurring weekly"
              aria-label="Recurring weekly"
            >
              <IconRepeat size={12} sw={2} />
            </span>
          )}
          <div
            className="text-[14.5px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
          >
            {cls.className || 'Untitled class'}
          </div>
          {isDone && (
            <Chip tone="good">
              <IconCheck size={11} /> Done
            </Chip>
          )}
          {isGroup && <Chip tone="accent">Group · {effectiveIds.length}</Chip>}
          {anyLow && !isDone && <Chip tone="bad">Low wallet</Chip>}
        </div>
        <div
          className="flex items-center gap-2.5 text-[12.5px] flex-wrap"
          style={{ color: 'var(--ink-3)' }}
        >
          {cls.locationName && (
            <span className="inline-flex items-center gap-1">
              <IconPin size={12} /> {cls.locationName}
            </span>
          )}
          {attendees.length > 0 && (
            <span className="inline-flex items-center gap-1 tnum">
              <IconUsers size={12} />{' '}
              {attendees.map((a) => a.clientName.split(' ')[0]).join(', ')}
            </span>
          )}
        </div>
        {!compact && (
          <div className="flex gap-2 mt-1.5">
            {!isDone ? (
              <Btn size="sm" variant="primary" onClick={onMarkDone}>
                <IconCheck size={13} /> Mark done
              </Btn>
            ) : (
              <Btn size="sm" variant="ghost" onClick={onUndo}>
                <IconUndo size={13} /> Undo
              </Btn>
            )}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex flex-col items-end justify-between gap-2 flex-shrink-0">
        <div
          className="mono tnum font-semibold"
          style={{
            color: 'var(--ink)',
            fontSize: compact ? 14 : 15,
            letterSpacing: '-0.2px',
          }}
        >
          RM {Math.round(total)}
        </div>
        {isDone ? (
          compact ? (
            <Btn size="sm" variant="ghost" onClick={onUndo}>
              <IconUndo size={12} />
            </Btn>
          ) : null
        ) : (
          <ClassActionsMenu
            onMarkDone={onMarkDone}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onCancel={onCancel}
          />
        )}
      </div>
    </div>
  );
}

function CancelledList({
  items,
  onUndo,
}: {
  items: { booking: Booking; exceptionId: string }[];
  onUndo: (id: string) => void;
}) {
  return (
    <div
      className="rounded-[14px] border p-3 flex flex-col gap-2"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      <div
        className="text-[10.5px] font-semibold uppercase px-1"
        style={{ color: 'var(--ink-4)', letterSpacing: '0.06em' }}
      >
        Cancelled for this date
      </div>
      {items.map((c) => (
        <div
          key={c.exceptionId}
          className="flex items-center gap-3 px-1 py-1.5 border-t"
          style={{ borderColor: 'var(--line)' }}
        >
          <div
            className="mono tnum text-[12.5px] flex-shrink-0"
            style={{ color: 'var(--ink-3)' }}
          >
            {fmtTimeShort(c.booking.startTime)}
          </div>
          <div
            className="text-[13px] flex-1 min-w-0 truncate line-through"
            style={{ color: 'var(--ink-3)' }}
          >
            {c.booking.className || 'Untitled class'}
          </div>
          <Btn size="sm" variant="ghost" onClick={() => onUndo(c.exceptionId)}>
            <IconUndo size={13} /> Undo
          </Btn>
        </div>
      ))}
    </div>
  );
}

function LowWalletsCard({ wallets }: { wallets: Wallet[] }) {
  const describe = (w: Wallet) => {
    if (w.balance < 0) return `Owes RM ${Math.abs(w.balance).toFixed(0)}`;
    if (w.balance === 0) return 'Needs top-up';
    return `RM ${w.balance.toFixed(0)}`;
  };

  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
          Wallets running low
        </div>
        <Chip tone={wallets.length > 0 ? 'bad' : 'good'}>{wallets.length}</Chip>
      </div>
      {wallets.length === 0 ? (
        <div className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          All balances healthy.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {wallets.slice(0, 4).map((w) => (
            <div key={w.id} className="flex items-center gap-2.5">
              <Avatar name={w.name} size={28} />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: 'var(--ink)' }}
                >
                  {w.name}
                </div>
                <div className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                  {describe(w)}
                </div>
              </div>
              <BalancePill balance={w.balance} compact />
            </div>
          ))}
        </div>
      )}
      <div className="h-px my-3" style={{ background: 'var(--line)' }} />
      <a
        href="/dashboard/payments"
        className="block text-[12.5px] font-medium text-center rounded-md py-1.5"
        style={{ color: 'var(--ink-2)' }}
      >
        Go to payments →
      </a>
    </div>
  );
}

function QuickActionsCard({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      <div className="text-[13.5px] font-semibold mb-2.5" style={{ color: 'var(--ink)' }}>
        Quick actions
      </div>
      <div className="flex flex-col gap-1.5">
        <Btn variant="outline" full style={{ justifyContent: 'flex-start' }} onClick={onAdd}>
          <IconPlus size={14} /> Add lesson
        </Btn>
        <a href="/dashboard/students" className="block">
          <Btn variant="outline" full style={{ justifyContent: 'flex-start' }}>
            <IconUsers size={14} /> New student
          </Btn>
        </a>
        <a href="/dashboard/payments" className="block">
          <Btn variant="outline" full style={{ justifyContent: 'flex-start' }}>
            <IconArrowUp size={14} /> Record top-up
          </Btn>
        </a>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11.5px] font-semibold uppercase mb-1.5"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
    >
      {children}
    </label>
  );
}

const paperInputClass =
  'w-full px-3 py-2.5 rounded-[10px] border text-[13.5px] outline-none focus:border-[color:var(--accent)]';
const paperInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  borderColor: 'var(--line-2)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
  appearance: 'none',
  minWidth: 0,
};

function EditClassModal({
  open,
  booking,
  backingExceptionId,
  selectedDate,
  selectedDateStr,
  className,
  onClassNameChange,
  locationId,
  onLocationIdChange,
  date,
  onDateChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  note,
  onNoteChange,
  studentIds,
  studentPrices,
  studentWallets,
  onRemoveStudent,
  onStudentPriceChange,
  onStudentWalletChange,
  addStudentOpen,
  onAddStudentOpenChange,
  addStudentSearch,
  onAddStudentSearchChange,
  onAddStudent,
  totalPrice,
  students,
  wallets,
  locations,
  showSaveOptions,
  onShowSaveOptions,
  saving,
  canSave,
  onSave,
  onClose,
}: {
  open: boolean;
  booking: Booking | null;
  backingExceptionId: string | null;
  selectedDate: Date;
  selectedDateStr: string;
  className: string;
  onClassNameChange: (v: string) => void;
  locationId: string;
  onLocationIdChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  startTime: string;
  onStartTimeChange: (v: string) => void;
  endTime: string;
  onEndTimeChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  studentIds: string[];
  studentPrices: Record<string, number>;
  studentWallets: Record<string, string>;
  onRemoveStudent: (sid: string) => void;
  onStudentPriceChange: (sid: string, v: number) => void;
  onStudentWalletChange: (sid: string, v: string) => void;
  addStudentOpen: boolean;
  onAddStudentOpenChange: (v: boolean) => void;
  addStudentSearch: string;
  onAddStudentSearchChange: (v: string) => void;
  onAddStudent: (s: Student) => void;
  totalPrice: number;
  students: Student[];
  wallets: Wallet[];
  locations: Location[];
  showSaveOptions: boolean;
  onShowSaveOptions: (v: boolean) => void;
  saving: boolean;
  canSave: boolean;
  onSave: (mode?: 'this' | 'future') => void;
  onClose: () => void;
}) {
  if (!booking) return null;
  const isOneTime = !!(
    booking.startDate &&
    booking.endDate &&
    booking.startDate === booking.endDate
  );

  return (
    <PaperModal open={open} onClose={onClose} title="Edit class" width={520}>
      {!showSaveOptions ? (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-[10px] border p-3"
            style={{ background: 'var(--bg)', borderColor: 'var(--line-2)' }}
          >
            <div className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
              {className || '(unnamed class)'}
            </div>
            <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {formatDateFull(selectedDate)}
            </div>
          </div>

          <div>
            <FieldLabel>Class name</FieldLabel>
            <input
              type="text"
              value={className}
              onChange={(e) => onClassNameChange(e.target.value)}
              placeholder="e.g. Tuesday swim squad"
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          <div>
            <FieldLabel>Location</FieldLabel>
            <select
              value={locationId}
              onChange={(e) => onLocationIdChange(e.target.value)}
              className={paperInputClass}
              style={paperInputStyle}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className={`${paperInputClass} mono tnum`}
              style={paperInputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Start</FieldLabel>
              <input
                type="time"
                value={startTime}
                onChange={(e) => onStartTimeChange(e.target.value)}
                step={300}
                className={`${paperInputClass} mono tnum`}
                style={paperInputStyle}
              />
            </div>
            <div>
              <FieldLabel>End</FieldLabel>
              <input
                type="time"
                value={endTime}
                onChange={(e) => onEndTimeChange(e.target.value)}
                step={300}
                className={`${paperInputClass} mono tnum`}
                style={paperInputStyle}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className="text-[11.5px] font-semibold uppercase"
                style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
              >
                Students ({studentIds.length})
              </div>
              <div className="mono tnum text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                Total RM {totalPrice.toFixed(0)}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {studentIds.map((sid) => {
                const s = students.find((x) => x.id === sid);
                return (
                  <div
                    key={sid}
                    className="rounded-[10px] border p-3 flex flex-col gap-2"
                    style={{ background: 'var(--bg)', borderColor: 'var(--line-2)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          className="text-[13.5px] font-medium truncate"
                          style={{ color: 'var(--ink)' }}
                        >
                          {s?.clientName ?? '(unknown)'}
                        </div>
                        {s?.clientPhone && (
                          <div
                            className="mono text-[11.5px] truncate"
                            style={{ color: 'var(--ink-3)' }}
                          >
                            {s.clientPhone}
                          </div>
                        )}
                      </div>
                      {studentIds.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveStudent(sid)}
                          className="text-[11.5px] font-medium"
                          style={{ color: 'var(--bad)' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <FieldLabel>Price</FieldLabel>
                        <input
                          type="number"
                          min={0}
                          value={String(studentPrices[sid] ?? 0)}
                          onChange={(e) =>
                            onStudentPriceChange(sid, parseFloat(e.target.value) || 0)
                          }
                          className={`${paperInputClass} mono tnum`}
                          style={paperInputStyle}
                        />
                      </div>
                      <div>
                        <FieldLabel>Wallet</FieldLabel>
                        <select
                          value={studentWallets[sid] ?? ''}
                          onChange={(e) => onStudentWalletChange(sid, e.target.value)}
                          className={paperInputClass}
                          style={paperInputStyle}
                        >
                          <option value="">Auto (student&rsquo;s own)</option>
                          {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} (RM {w.balance.toFixed(0)})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}

              {addStudentOpen ? (
                <div
                  className="rounded-[10px] border p-3 flex flex-col gap-2"
                  style={{ background: 'var(--panel)', borderColor: 'var(--line-2)' }}
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={addStudentSearch}
                      onChange={(e) => onAddStudentSearchChange(e.target.value)}
                      placeholder="Search name or phone"
                      className={`${paperInputClass} pl-8`}
                      style={paperInputStyle}
                    />
                    <div
                      className="absolute left-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--ink-4)' }}
                    >
                      <IconSearch size={14} />
                    </div>
                  </div>
                  <div className="max-h-44 overflow-y-auto flex flex-col gap-1 no-scrollbar">
                    {students
                      .filter((s) => !studentIds.includes(s.id))
                      .filter((s) => {
                        if (!addStudentSearch.trim()) return true;
                        const q = addStudentSearch.toLowerCase();
                        return (
                          s.clientName.toLowerCase().includes(q) ||
                          s.clientPhone.toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 8)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onAddStudent(s)}
                          className="text-left p-2 rounded-md text-[13px]"
                          style={{ color: 'var(--ink)' }}
                        >
                          <div>{s.clientName}</div>
                          {s.clientPhone && (
                            <div
                              className="mono text-[11.5px]"
                              style={{ color: 'var(--ink-3)' }}
                            >
                              {s.clientPhone}
                            </div>
                          )}
                        </button>
                      ))}
                    {students.filter((s) => !studentIds.includes(s.id)).length === 0 && (
                      <div
                        className="text-[12px] p-2"
                        style={{ color: 'var(--ink-4)' }}
                      >
                        No other students to add.
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onAddStudentOpenChange(false);
                        onAddStudentSearchChange('');
                      }}
                    >
                      <IconClose size={12} /> Close
                    </Btn>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddStudentOpenChange(true)}
                  className="text-[13px] font-medium self-start py-1.5"
                  style={{ color: 'var(--accent)' }}
                >
                  + Add student
                </button>
              )}
            </div>
          </div>

          <div>
            <FieldLabel>Note (optional)</FieldLabel>
            <input
              type="text"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. Riwoo only"
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                if (isOneTime || backingExceptionId) {
                  onSave();
                } else {
                  onShowSaveOptions(true);
                }
              }}
              disabled={!canSave || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        </div>
      ) : (
        (() => {
          const editDateObj = date ? parseDateString(date) : selectedDate;
          const dateChanged = date !== selectedDateStr;
          const oldDow = booking.dayOfWeek;
          const newDow = dateChanged ? getDayOfWeekForDate(date) : oldDow;
          const dowChanged = dateChanged && newDow !== oldDow;
          const plural = (dow: string) => dow.charAt(0).toUpperCase() + dow.slice(1) + 's';
          const futureDesc = dowChanged
            ? `Move all future classes from ${plural(oldDow)} to ${plural(newDow)}, starting ${formatDateShort(editDateObj)}`
            : dateChanged
              ? `Apply from ${formatDateShort(editDateObj)} onwards`
              : `Apply from ${formatDateShort(selectedDate)} onwards`;
          const thisDesc = dateChanged
            ? `Move only the ${formatDateShort(selectedDate)} class to ${formatDateShort(editDateObj)}`
            : `Only change the class on ${formatDateShort(selectedDate)}`;
          return (
            <div className="flex flex-col gap-3">
              <div className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                How would you like to apply these changes?
              </div>
              <button
                type="button"
                onClick={() => onSave('this')}
                disabled={saving}
                className="text-left rounded-[10px] border p-3"
                style={{ background: 'var(--bg)', borderColor: 'var(--line-2)' }}
              >
                <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                  This event only
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {thisDesc}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onSave('future')}
                disabled={saving}
                className="text-left rounded-[10px] border p-3"
                style={{ background: 'var(--bg)', borderColor: 'var(--line-2)' }}
              >
                <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                  This and future events
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {futureDesc}
                </div>
              </button>
              <div className="flex justify-end pt-1">
                <Btn size="sm" variant="ghost" onClick={() => onShowSaveOptions(false)}>
                  Back
                </Btn>
              </div>
            </div>
          );
        })()
      )}
    </PaperModal>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function MarkDoneModal({
  open,
  booking,
  amounts,
  onAmountsChange,
  attending,
  onRemoveAttendee,
  onRestoreAttendee,
  students,
  wallets,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  booking: Booking | null;
  amounts: Record<string, number>;
  onAmountsChange: (a: Record<string, number>) => void;
  attending: string[];
  onRemoveAttendee: (sid: string) => void;
  onRestoreAttendee: (sid: string) => void;
  students: Student[];
  wallets: Wallet[];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!booking) return null;
  const attendingSet = new Set(attending);
  const total = booking.studentIds.reduce((s, sid) => {
    if (!attendingSet.has(sid)) return s;
    return s + (Number(amounts[sid]) || 0);
  }, 0);
  const canConfirm = attending.length > 0;

  return (
    <PaperModal open={open} onClose={onClose} title="Mark class as done" width={480}>
      <div
        className="rounded-[10px] border p-3 mb-3"
        style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
      >
        <div className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
          {booking.className || 'Class'}
        </div>
        <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {formatTimeDisplay(booking.startTime)}–{formatTimeDisplay(booking.endTime)} ·{' '}
          {booking.locationName}
        </div>
      </div>
      <div className="flex items-center justify-between mb-2">
        <div
          className="text-[11px] font-semibold uppercase"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Attendees & charges
        </div>
        {booking.studentIds.length > 1 && (
          <div className="text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
            {attending.length}/{booking.studentIds.length} attending
          </div>
        )}
      </div>
      {booking.studentIds.map((sid) => {
        const s = students.find((x) => x.id === sid);
        const w = resolveWallet(booking, sid, wallets);
        const isAttending = attendingSet.has(sid);
        const canRemove = booking.studentIds.length > 1;
        return (
          <div
            key={sid}
            className="flex items-center gap-2.5 py-2.5 border-t"
            style={{
              borderColor: 'var(--line)',
              opacity: isAttending ? 1 : 0.5,
            }}
          >
            <Avatar name={s?.clientName || ''} size={30} />
            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] font-medium truncate"
                style={{
                  color: 'var(--ink)',
                  textDecoration: isAttending ? 'none' : 'line-through',
                }}
              >
                {s?.clientName}
              </div>
              {isAttending ? (
                w && (
                  <div className="text-[11px] mono tnum" style={{ color: 'var(--ink-3)' }}>
                    Wallet: RM {Math.round(w.balance)}
                  </div>
                )
              ) : (
                <div className="text-[11px]" style={{ color: 'var(--ink-4)' }}>
                  Skipped — no charge
                </div>
              )}
            </div>
            {isAttending ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="mono text-[12px]" style={{ color: 'var(--ink-3)' }}>
                    RM
                  </span>
                  <input
                    type="number"
                    value={amounts[sid] ?? 0}
                    onChange={(e) =>
                      onAmountsChange({ ...amounts, [sid]: Number(e.target.value) })
                    }
                    className="mono text-right"
                    style={{
                      width: 72,
                      padding: '6px 8px',
                      border: '1px solid var(--line-2)',
                      borderRadius: 8,
                      background: 'var(--panel)',
                      color: 'var(--ink)',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </div>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttendee(sid)}
                    aria-label="Remove attendee"
                    className="p-1 rounded-md"
                    style={{ color: 'var(--ink-4)' }}
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => onRestoreAttendee(sid)}
                className="text-[12px] font-medium"
                style={{ color: 'var(--accent)' }}
              >
                Undo
              </button>
            )}
          </div>
        );
      })}
      <div
        className="flex justify-between items-center pt-3 mt-1 border-t"
        style={{ borderColor: 'var(--line)' }}
      >
        <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          Will charge wallets
        </span>
        <span
          className="mono tnum text-[16px] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          RM {Math.round(total)}
        </span>
      </div>
      <div className="flex gap-2 mt-4">
        <Btn variant="ghost" full onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
        <Btn variant="primary" full onClick={onConfirm} disabled={busy || !canConfirm}>
          <IconCheck size={14} /> Confirm
        </Btn>
      </div>
    </PaperModal>
  );
}

// ────────────────────────────────────────────────────────────────────────────

type StudentRowState = {
  mode: 'existing' | 'new';
  studentId: string;
  newName: string;
  newPhone: string;
  walletOption: 'none' | 'existing' | 'create';
  existingWalletId: string; // can be wallet id or `pending:<row-index>`
  newWalletName: string;
  price: number;
};

function makeEmptyRow(): StudentRowState {
  return {
    mode: 'new',
    studentId: '',
    newName: '',
    newPhone: '',
    walletOption: 'create',
    existingWalletId: '',
    newWalletName: '',
    price: 0,
  };
}

function AddLessonModal({
  open,
  onClose,
  coachId,
  students,
  wallets,
  locations,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  coachId: string | undefined;
  students: Student[];
  wallets: Wallet[];
  locations: Location[];
  defaultDate: string;
}) {
  const { showToast } = useToast();
  const [className, setClassName] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('17:00');
  const [repeat, setRepeat] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [rows, setRows] = useState<StudentRowState[]>([makeEmptyRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClassName('');
    setDate(defaultDate);
    setStartTime('16:00');
    setEndTime('17:00');
    setRepeat(false);
    setLocationId('__new');
    setNewLocationName('');
    setRows([makeEmptyRow()]);
  }, [open, defaultDate]);

  const updateRow = (i: number, patch: Partial<StudentRowState>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [...rs, makeEmptyRow()]);
  const removeRow = (i: number) =>
    setRows((rs) => rs.filter((_, idx) => idx !== i));

  const total = rows.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const creatingLocation = locationId === '__new';

  const handleSave = async () => {
    if (!coachId || !db) return;
    if (rows.length === 0) return;

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.mode === 'existing' && !r.studentId) {
        showToast(`Student ${i + 1}: pick a student`, 'error');
        return;
      }
      if (r.mode === 'new' && !r.newName.trim()) {
        showToast(`Student ${i + 1}: enter a name`, 'error');
        return;
      }
      if (r.walletOption === 'existing' && !r.existingWalletId) {
        showToast(`Student ${i + 1}: pick a wallet`, 'error');
        return;
      }
      if (r.walletOption === 'create' && !r.newWalletName.trim()) {
        showToast(`Student ${i + 1}: name the new wallet`, 'error');
        return;
      }
    }

    if (creatingLocation && !newLocationName.trim()) {
      showToast('Enter a name for the new location', 'error');
      return;
    }
    if (!creatingLocation && !locationId) {
      showToast('Pick a location', 'error');
      return;
    }

    const dayOfWeek = getDayOfWeekForDate(date);
    if (!dayOfWeek) return;

    setSaving(true);
    try {
      const firestore = db as Firestore;

      // 1. Resolve location.
      let finalLocationId = locationId;
      let finalLocationName = locations.find((l) => l.id === locationId)?.name || '';
      if (creatingLocation) {
        const newLoc = await addDoc(
          collection(firestore, 'coaches', coachId, 'locations'),
          {
            name: newLocationName.trim(),
            address: '',
            notes: '',
            createdAt: serverTimestamp(),
          },
        );
        finalLocationId = newLoc.id;
        finalLocationName = newLocationName.trim();
      }

      // 2. Resolve each row's studentId (create-new as needed).
      const resolvedStudentIds: string[] = [];
      for (const r of rows) {
        if (r.mode === 'existing') {
          resolvedStudentIds.push(r.studentId);
        } else {
          const sid = await findOrCreateStudent(
            firestore,
            coachId,
            r.newName.trim(),
            r.newPhone.trim(),
          );
          resolvedStudentIds.push(sid);
        }
      }

      // 3. Plan wallets: for each row that creates a wallet, aggregate the
      //    studentIds of every row pointing at it via `pending:<index>`.
      const pendingWalletIds: Record<number, string> = {};
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.walletOption !== 'create') continue;
        const sharedStudentIds = [resolvedStudentIds[i]];
        for (let j = i + 1; j < rows.length; j++) {
          const other = rows[j];
          if (
            other.walletOption === 'existing' &&
            other.existingWalletId === `pending:${i}`
          ) {
            sharedStudentIds.push(resolvedStudentIds[j]);
          }
        }
        const walletRef = await addDoc(
          collection(firestore, 'coaches', coachId, 'wallets'),
          {
            name: r.newWalletName.trim(),
            balance: 0,
            studentIds: sharedStudentIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        );
        pendingWalletIds[i] = walletRef.id;
      }

      // 4. Build studentPrices + studentWallets keyed by resolved student id.
      const studentPrices: Record<string, number> = {};
      const studentWallets: Record<string, string> = {};
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const sid = resolvedStudentIds[i];
        studentPrices[sid] = Number(r.price) || 0;
        if (r.walletOption === 'existing') {
          if (r.existingWalletId.startsWith('pending:')) {
            const refIdx = parseInt(r.existingWalletId.split(':')[1], 10);
            const resolved = pendingWalletIds[refIdx];
            if (resolved) studentWallets[sid] = resolved;
          } else {
            studentWallets[sid] = r.existingWalletId;
          }
        } else if (r.walletOption === 'create') {
          const resolved = pendingWalletIds[i];
          if (resolved) studentWallets[sid] = resolved;
        }
      }

      // 5. Write booking.
      const payload: Record<string, unknown> = {
        locationId: finalLocationId,
        locationName: finalLocationName,
        dayOfWeek,
        startTime,
        endTime,
        status: 'confirmed',
        className: className.trim(),
        notes: '',
        studentIds: resolvedStudentIds,
        studentPrices,
        studentWallets,
        startDate: date,
        createdAt: serverTimestamp(),
      };
      if (!repeat) payload.endDate = date;
      await addDoc(collection(firestore, 'coaches', coachId, 'bookings'), payload);

      showToast(repeat ? 'Recurring lesson added' : 'Lesson added', 'success');
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Failed to add lesson', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PaperModal open={open} onClose={onClose} title="Add lesson" width={560}>
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>Class name</FieldLabel>
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="e.g. Aarav private"
            className={paperInputClass}
            style={paperInputStyle}
          />
        </div>

        <div>
          <SectionLabel>When</SectionLabel>
          <div
            className="grid gap-2 grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr]"
          >
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${paperInputClass} mono tnum col-span-2 sm:col-span-1 min-w-0`}
              style={paperInputStyle}
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              step={300}
              className={`${paperInputClass} mono tnum min-w-0`}
              style={paperInputStyle}
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              step={300}
              className={`${paperInputClass} mono tnum min-w-0`}
              style={paperInputStyle}
            />
          </div>
          <label
            className="flex items-center gap-2 text-[12.5px] mt-2 cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
            />
            Repeat weekly on this day
          </label>
        </div>

        <div>
          <SectionLabel>Where</SectionLabel>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className={paperInputClass}
            style={paperInputStyle}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="__new">+ Add new location…</option>
          </select>
          {creatingLocation && (
            <input
              autoFocus
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="New location name (e.g. Subang Tennis Centre)"
              className={`${paperInputClass} mt-2`}
              style={paperInputStyle}
            />
          )}
        </div>

        <div>
          <SectionLabel>Students</SectionLabel>
          <div className="flex flex-col gap-2.5">
            {rows.map((r, i) => (
              <StudentRow
                key={i}
                row={r}
                index={i}
                count={rows.length}
                students={students}
                wallets={wallets}
                rows={rows}
                onChange={(patch) => updateRow(i, patch)}
                onRemove={() => removeRow(i)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="w-full mt-2.5 text-[12.5px] font-medium"
            style={{
              padding: '8px 12px',
              border: '1px dashed var(--line-2)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--ink-2)',
            }}
          >
            + Add another student
          </button>
        </div>

        <div
          className="flex items-center justify-between rounded-[10px] border"
          style={{
            padding: '10px 12px',
            background: 'var(--bg)',
            borderColor: 'var(--line)',
          }}
        >
          <div
            className="text-[12px] font-medium"
            style={{ color: 'var(--ink-3)' }}
          >
            Total per lesson
          </div>
          <div
            className="mono tnum text-[18px] font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            RM {total}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3.5">
        <Btn variant="ghost" full onClick={onClose} disabled={saving}>
          Cancel
        </Btn>
        <Btn variant="primary" full onClick={handleSave} disabled={saving}>
          <IconCheck size={14} /> {saving ? 'Saving…' : 'Add lesson'}
        </Btn>
      </div>
    </PaperModal>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase mb-2"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.05em' }}
    >
      {children}
    </div>
  );
}

function StudentRow({
  row,
  index,
  count,
  students,
  wallets,
  rows,
  onChange,
  onRemove,
}: {
  row: StudentRowState;
  index: number;
  count: number;
  students: Student[];
  wallets: Wallet[];
  rows: StudentRowState[];
  onChange: (patch: Partial<StudentRowState>) => void;
  onRemove: () => void;
}) {
  const pendingAbove = rows
    .slice(0, index)
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.walletOption === 'create' && r.newWalletName.trim());

  return (
    <div
      className="rounded-[10px] border relative"
      style={{
        padding: 12,
        background: 'var(--panel)',
        borderColor: 'var(--line)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="text-[11px] font-semibold uppercase"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
        >
          Student {index + 1}
        </div>
        {count > 1 && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove student"
            className="p-0.5"
            style={{ color: 'var(--ink-3)' }}
          >
            <IconClose size={13} />
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div
        className="flex gap-1 rounded-[8px] border mb-2.5"
        style={{
          padding: 3,
          background: 'var(--bg)',
          borderColor: 'var(--line)',
        }}
      >
        {(
          [
            { k: 'existing', label: 'Existing student' },
            { k: 'new', label: 'New student' },
          ] as const
        ).map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange({ mode: o.k })}
            className="flex-1 rounded-[6px] text-[12px] font-medium"
            style={{
              padding: '6px 10px',
              background: row.mode === o.k ? 'var(--panel)' : 'transparent',
              color: row.mode === o.k ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: row.mode === o.k ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {row.mode === 'existing' ? (
        <select
          value={row.studentId}
          onChange={(e) => onChange({ studentId: e.target.value })}
          className={paperInputClass}
          style={paperInputStyle}
        >
          <option value="">Select student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.clientName}
            </option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Name"
            value={row.newName}
            onChange={(e) => onChange({ newName: e.target.value })}
            className={paperInputClass}
            style={paperInputStyle}
          />
          <input
            placeholder="Phone"
            value={row.newPhone}
            onChange={(e) => onChange({ newPhone: e.target.value })}
            className={`${paperInputClass} mono`}
            style={paperInputStyle}
          />
        </div>
      )}

      {/* Wallet */}
      <div className="mt-2.5">
        <div
          className="text-[11px] font-medium mb-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          Wallet
        </div>
        <div className="flex gap-1 flex-wrap">
          {(
            [
              { k: 'none', label: 'No wallet' },
              { k: 'existing', label: 'Existing' },
              { k: 'create', label: 'Create new' },
            ] as const
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => onChange({ walletOption: o.k })}
              className="text-[11.5px] font-medium"
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                border: `1px solid ${row.walletOption === o.k ? 'var(--ink)' : 'var(--line-2)'}`,
                background: row.walletOption === o.k ? 'var(--ink)' : 'var(--panel)',
                color: row.walletOption === o.k ? 'var(--bg)' : 'var(--ink-2)',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        {row.walletOption === 'existing' && (
          <select
            value={row.existingWalletId}
            onChange={(e) => onChange({ existingWalletId: e.target.value })}
            className={`${paperInputClass} mt-2`}
            style={paperInputStyle}
          >
            <option value="">Select wallet…</option>
            {wallets
              .filter((w) => !w.archived)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — RM {w.balance.toFixed(0)}
                </option>
              ))}
            {pendingAbove.map(({ r, i }) => (
              <option key={`p-${i}`} value={`pending:${i}`}>
                (New) {r.newWalletName} — shared with student {i + 1}
              </option>
            ))}
          </select>
        )}
        {row.walletOption === 'create' && (
          <input
            placeholder="Wallet name (e.g. Suresh family)"
            value={row.newWalletName}
            onChange={(e) => onChange({ newWalletName: e.target.value })}
            className={`${paperInputClass} mt-2`}
            style={paperInputStyle}
          />
        )}
      </div>

      {/* Price */}
      <div
        className="mt-2.5 grid items-center gap-2"
        style={{ gridTemplateColumns: '1fr auto' }}
      >
        <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
          Price for this student
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
            RM
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={row.price === 0 ? '' : row.price}
            placeholder="0"
            onChange={(e) => onChange({ price: e.target.value === '' ? 0 : Number(e.target.value) })}
            className={`${paperInputClass} mono tnum text-right`}
            style={{ ...paperInputStyle, width: 90 }}
          />
        </div>
      </div>
    </div>
  );
}

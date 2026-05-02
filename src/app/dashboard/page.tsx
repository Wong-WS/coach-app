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
import type { Booking, ClassException, LessonLog, Student, Wallet } from '@/types';
import {
  getClassesForDate,
  getBookingTotal,
  getBackingException,
  getCancelledClassesForDate,
  getDayOfWeekForDate,
} from '@/lib/class-schedule';
import { resolveWallet } from '@/lib/wallets';
import { isLowBalance, getNextLessonCost } from '@/lib/wallet-alerts';
import { computeCancelFuture } from '@/lib/cancel-scope';
import { shiftEndTime } from '@/lib/time-input';
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
  IconRepeat,
} from '@/components/paper';
import { EditClassModal } from './_components/EditClassModal';
import { AddLessonModal, type StudentRowState, type AddLessonPrefill } from './_components/AddLessonModal';
import { MarkDoneModal } from './_components/MarkDoneModal';
import { BulkMarkDoneConfirmModal } from './_components/BulkMarkDoneConfirmModal';
import { DepletedWalletAlert, type DepletedAlert } from './_components/DepletedWalletAlert';

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

// Build a completedLogs array that includes synthetic stubs for bookings just
// marked done. The Firestore snapshot hasn't refreshed React state yet, so the
// rate calc would otherwise count those classes as upcoming.
function makeCompletedLogsWithPending(
  existing: LessonLog[],
  pending: { date: string; bookingId: string }[],
): LessonLog[] {
  const stubs: LessonLog[] = pending.map((p, i) => ({
    id: `pending-${i}`,
    date: p.date,
    bookingId: p.bookingId,
    studentId: '',
    studentName: '',
    locationName: '',
    startTime: '',
    endTime: '',
    price: 0,
    createdAt: new Date(),
  }));
  return [...existing, ...stubs];
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

  const { classExceptions, loading: classExceptionsLoading } = useClassExceptions(coach?.id, selectedDateStr);
  const { lessonLogs, loading: lessonLogsLoading } = useLessonLogs(coach?.id, selectedDateStr);
  // Until both date-scoped queries land, doneByBookingId is unreliable and
  // would flash cards as "not done" before flipping to done.
  const doneStateLoading = lessonLogsLoading || classExceptionsLoading;

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
  const remainingClasses = useMemo(
    () => todaysClasses.filter((c) => !doneByBookingId.has(c.id)),
    [todaysClasses, doneByBookingId],
  );
  const todayRevenue = lessonLogs.reduce((s, l) => s + l.price, 0);
  const expectedRevenue =
    todaysClasses.reduce((s, c) => {
      if (doneByBookingId.has(c.id)) return s + (doneByBookingId.get(c.id) ?? 0);
      return s + getBookingTotal(c);
    }, 0) +
    cancelledToday.reduce((s, c) => s + getBookingTotal(c.booking), 0);

  const lowWallets = useMemo(() => {
    return wallets
      .filter((w) => isLowBalance(w, bookings, classExceptions, lessonLogs, todayStr))
      .sort((a, b) => a.balance - b.balance);
  }, [wallets, bookings, classExceptions, lessonLogs, todayStr]);

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

  // Wallet-depletion popup shown when a mark-done charge empties a wallet.
  const [depletedAlert, setDepletedAlert] = useState<DepletedAlert | null>(null);

  // Bulk mark-all-done confirmation popup state.
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  // Cancel-lesson scope picker state.
  const [cancelCtx, setCancelCtx] = useState<
    | {
        booking: Booking;
        dateStr: string;
        backingExceptionId: string | null;
        isOneTime: boolean;
        canScope: boolean;
      }
    | null
  >(null);
  const [cancelScope, setCancelScope] = useState<'this' | 'future'>('this');
  const [cancelling, setCancelling] = useState(false);

  const openCancelFlow = (c: Booking) => {
    const backing = getBackingException(c.id, selectedDateStr, classExceptions);
    const isOneTime = !!(c.startDate && c.endDate && c.startDate === c.endDate);
    const canScope = !backing && !isOneTime;
    setCancelScope('this');
    setCancelCtx({
      booking: c,
      dateStr: selectedDateStr,
      backingExceptionId: backing?.id ?? null,
      isOneTime,
      canScope,
    });
  };

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

    // Track wallet impact so we can alert when this lesson empties a wallet.
    const walletImpacts = new Map<string, { wallet: Wallet; charge: number }>();

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
          const existing = walletImpacts.get(wallet.id);
          if (existing) existing.charge += price;
          else walletImpacts.set(wallet.id, { wallet, charge: price });

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

      // After the commit, collect wallets that just crossed below next-lesson
      // cost. "Can cover next" = balance >= rate (or rate == 0). Skip tab-mode
      // wallets. Show a popup listing any wallets that need attention.
      // Augment lessonLogs with the just-marked-done booking so the rate calc
      // correctly skips it (snapshot hasn't refreshed React state yet).
      const completedWithJustDone = makeCompletedLogsWithPending(
        lessonLogs,
        [{ date: selectedDateStr, bookingId: booking.id }],
      );
      const depleted: Array<{
        name: string;
        newBalance: number;
        status: 'owing' | 'empty';
      }> = [];
      for (const { wallet, charge } of walletImpacts.values()) {
        if (wallet.tabMode) continue;
        const rate = getNextLessonCost(
          wallet,
          bookings,
          classExceptions,
          completedWithJustDone,
          todayStr,
        );
        if (rate <= 0) continue;
        const prevBalance = wallet.balance;
        const newBalance = prevBalance - charge;
        if (prevBalance >= rate && newBalance < rate) {
          depleted.push({
            name: wallet.name,
            newBalance,
            status: newBalance < 0 ? 'owing' : 'empty',
          });
        }
      }
      if (depleted.length > 0) setDepletedAlert({ wallets: depleted });
    } catch (e) {
      console.error(e);
      showToast('Failed to mark class as done', 'error');
    } finally {
      setMarkingDone(false);
    }
  };

  const handleConfirmMarkAllDone = async () => {
    if (!coach || !db) return;
    if (remainingClasses.length === 0) return;
    setBulkRunning(true);

    const walletImpacts = new Map<string, { wallet: Wallet; charge: number }>();
    let lessonsLogged = 0;

    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      for (const booking of remainingClasses) {
        for (const studentId of booking.studentIds) {
          const price = booking.studentPrices[studentId] ?? 0;
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
          lessonsLogged += 1;

          const wallet = resolveWallet(booking, studentId, wallets);
          if (wallet && price > 0) {
            const existing = walletImpacts.get(wallet.id);
            if (existing) existing.charge += price;
            else walletImpacts.set(wallet.id, { wallet, charge: price });

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
      }

      await batch.commit();

      setBulkConfirmOpen(false);
      const classCount = remainingClasses.length;
      showToast(
        `Marked ${classCount} ${classCount === 1 ? 'class' : 'classes'} done (${lessonsLogged} ${
          lessonsLogged === 1 ? 'lesson' : 'lessons'
        })`,
        'success',
      );

      const completedWithJustDone = makeCompletedLogsWithPending(
        lessonLogs,
        remainingClasses.map((b) => ({ date: selectedDateStr, bookingId: b.id })),
      );
      const depleted: Array<{
        name: string;
        newBalance: number;
        status: 'owing' | 'empty';
      }> = [];
      for (const { wallet, charge } of walletImpacts.values()) {
        if (wallet.tabMode) continue;
        const rate = getNextLessonCost(
          wallet,
          bookings,
          classExceptions,
          completedWithJustDone,
          todayStr,
        );
        if (rate <= 0) continue;
        const prevBalance = wallet.balance;
        const newBalance = prevBalance - charge;
        if (prevBalance >= rate && newBalance < rate) {
          depleted.push({
            name: wallet.name,
            newBalance,
            status: newBalance < 0 ? 'owing' : 'empty',
          });
        }
      }
      if (depleted.length > 0) setDepletedAlert({ wallets: depleted });
    } catch (e) {
      console.error(e);
      showToast('Failed to mark classes done', 'error');
    } finally {
      setBulkRunning(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!coach || !db || !cancelCtx) return;
    const { booking, dateStr, backingExceptionId, isOneTime, canScope } = cancelCtx;
    const scope: 'this' | 'future' = canScope ? cancelScope : 'this';
    setCancelling(true);
    try {
      const firestore = db as Firestore;

      if (backingExceptionId) {
        // Rescheduled single occurrence — just mark that exception cancelled.
        await updateDoc(
          doc(firestore, 'coaches', coach.id, 'classExceptions', backingExceptionId),
          { type: 'cancelled' },
        );
      } else if (isOneTime) {
        // One-time booking — delete booking + its exceptions.
        const batch = writeBatch(firestore);
        batch.delete(doc(firestore, 'coaches', coach.id, 'bookings', booking.id));
        const exQuery = query(
          collection(firestore, 'coaches', coach.id, 'classExceptions'),
          where('bookingId', '==', booking.id),
        );
        const exSnapshot = await getDocs(exQuery);
        for (const d of exSnapshot.docs) {
          batch.delete(doc(firestore, 'coaches', coach.id, 'classExceptions', d.id));
        }
        await batch.commit();
      } else if (scope === 'this') {
        // Recurring → cancel this date only.
        await addDoc(collection(firestore, 'coaches', coach.id, 'classExceptions'), {
          bookingId: booking.id,
          originalDate: dateStr,
          type: 'cancelled',
          createdAt: serverTimestamp(),
        });
      } else {
        // Recurring → cancel this and all future occurrences.
        const exQuery = query(
          collection(firestore, 'coaches', coach.id, 'classExceptions'),
          where('bookingId', '==', booking.id),
        );
        const exSnapshot = await getDocs(exQuery);
        const allExceptions: ClassException[] = exSnapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ClassException, 'id'>),
        }));
        const result = computeCancelFuture(booking, allExceptions, dateStr);
        const batch = writeBatch(firestore);
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
        await batch.commit();
      }

      showToast(
        scope === 'future'
          ? 'Recurring lesson ended'
          : `Cancelled ${booking.className || 'class'}`,
        'success',
      );
      setCancelCtx(null);
    } catch (e) {
      console.error(e);
      showToast('Failed to cancel class', 'error');
    } finally {
      setCancelling(false);
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

  const [duplicatePrefill, setDuplicatePrefill] = useState<AddLessonPrefill | null>(null);

  const handleDuplicate = (c: Booking) => {
    const rows: StudentRowState[] = c.studentIds.map((sid) => ({
      mode: 'existing',
      studentId: sid,
      newName: '',
      newPhone: '',
      walletOption: c.studentWallets?.[sid] ? 'existing' : 'none',
      existingWalletId: c.studentWallets?.[sid] ?? '',
      newWalletName: '',
      price: c.studentPrices?.[sid] ?? 0,
    }));
    setDuplicatePrefill({
      className: c.className ?? '',
      date: selectedDateStr,
      startTime: c.startTime,
      endTime: c.endTime,
      locationId: c.locationId,
      rows,
    });
    setShowAdd(true);
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
          doneStateLoading={doneStateLoading}
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
                  <div className="flex items-center gap-3">
                    {!doneStateLoading && (
                      <div className="text-[12px] tnum" style={{ color: 'var(--ink-3)' }}>
                        {doneCount}/{totalCount} done
                      </div>
                    )}
                    {isToday && !doneStateLoading && remainingClasses.length > 0 && (
                      <Btn size="sm" variant="outline" onClick={() => setBulkConfirmOpen(true)}>
                        <IconCheck size={13} /> Mark all done
                      </Btn>
                    )}
                  </div>
                )
              }
            />
            <div key={selectedDateStr} className="flex flex-col gap-2.5 crossfade-in">
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
                  exceptions={classExceptions}
                  completedLogs={lessonLogs}
                  todayStr={todayStr}
                  hasBackingException={
                    !!getBackingException(c.id, selectedDateStr, classExceptions)
                  }
                  isDone={doneByBookingId.has(c.id)}
                  doneLoading={doneStateLoading}
                  doneTotal={doneByBookingId.get(c.id) ?? 0}
                  attendedIds={doneStudentsByBookingId.get(c.id)}
                  onMarkDone={() => openMarkDone(c)}
                  onCancel={() => openCancelFlow(c)}
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
            <div key={selectedDateStr} className="crossfade-in">
            <StatCard
              label={isToday ? 'Earned today' : `Earned ${formatDateShort(selectedDate)}`}
              value={doneStateLoading ? '—' : `RM ${Math.round(todayRevenue)}`}
              sub={doneStateLoading ? ' ' : `of RM ${Math.round(expectedRevenue)} expected`}
            />
            </div>
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
              <div className="flex items-center gap-2.5">
                {!doneStateLoading && (
                  <div className="text-[12px] tnum" style={{ color: 'var(--ink-3)' }}>
                    {doneCount}/{totalCount} done
                  </div>
                )}
                {isToday && !doneStateLoading && remainingClasses.length > 0 && (
                  <Btn size="sm" variant="outline" onClick={() => setBulkConfirmOpen(true)}>
                    <IconCheck size={13} /> Mark all done
                  </Btn>
                )}
              </div>
            )
          }
        />
        <div className="flex flex-col gap-2.5">
          <div key={selectedDateStr} className="flex flex-col gap-2.5 crossfade-in">
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
                exceptions={classExceptions}
                completedLogs={lessonLogs}
                todayStr={todayStr}
                hasBackingException={
                  !!getBackingException(c.id, selectedDateStr, classExceptions)
                }
                isDone={doneByBookingId.has(c.id)}
                doneLoading={doneStateLoading}
                doneTotal={doneByBookingId.get(c.id) ?? 0}
                attendedIds={doneStudentsByBookingId.get(c.id)}
                onMarkDone={() => openMarkDone(c)}
                onCancel={() => openCancelFlow(c)}
                onUndo={() => handleUndoMarkDone(c)}
                onEdit={() => openEditBooking(c)}
                onDuplicate={() => handleDuplicate(c)}
                compact
              />
            ))}
            {cancelledToday.length > 0 && (
              <CancelledList items={cancelledToday} onUndo={(id) => handleUndoCancel(id)} />
            )}
          </div>
          <Btn variant="outline" full onClick={() => setShowAdd(true)}>
            <IconPlus size={14} /> Add lesson
          </Btn>
        </div>

        {/* mobile stat row */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div key={selectedDateStr} className="crossfade-in">
          <StatCard
            label={isToday ? 'Earned today' : `Earned ${formatDateShort(selectedDate)}`}
            value={doneStateLoading ? '—' : `RM ${Math.round(todayRevenue)}`}
            sub={doneStateLoading ? ' ' : `of RM ${Math.round(expectedRevenue)}`}
          />
          </div>
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

      <BulkMarkDoneConfirmModal
        open={bulkConfirmOpen}
        running={bulkRunning}
        classes={remainingClasses}
        onCancel={() => setBulkConfirmOpen(false)}
        onConfirm={handleConfirmMarkAllDone}
      />

      <DepletedWalletAlert
        alert={depletedAlert}
        onClose={() => setDepletedAlert(null)}
      />

      <PaperModal
        open={!!cancelCtx}
        onClose={() => !cancelling && setCancelCtx(null)}
        title="Cancel lesson?"
      >
        {cancelCtx && (
          <CancelScopeBody
            ctx={cancelCtx}
            scope={cancelScope}
            setScope={setCancelScope}
            cancelling={cancelling}
            onKeep={() => setCancelCtx(null)}
            onConfirm={handleConfirmCancel}
          />
        )}
      </PaperModal>

      <AddLessonModal
        open={showAdd}
        onClose={() => {
          setShowAdd(false);
          setDuplicatePrefill(null);
        }}
        coachId={coach?.id}
        students={students}
        wallets={wallets}
        locations={locations}
        bookings={bookings}
        defaultDate={selectedDateStr}
        prefill={duplicatePrefill}
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


// ────────────────────────────────────────────────────────────────────────────

function DesktopHero({
  selectedDate,
  isToday,
  firstName,
  totalCount,
  doneCount,
  doneStateLoading,
  earliest,
  onToday,
  onAdd,
}: {
  selectedDate: Date;
  isToday: boolean;
  firstName: string;
  totalCount: number;
  doneCount: number;
  doneStateLoading: boolean;
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
              {!doneStateLoading && doneCount > 0 && <> · {doneCount} done</>}
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
  exceptions,
  completedLogs,
  todayStr,
  hasBackingException,
  isDone,
  doneLoading = false,
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
  exceptions: ClassException[];
  completedLogs: LessonLog[];
  todayStr: string;
  hasBackingException: boolean;
  isDone: boolean;
  doneLoading?: boolean;
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
  const anyLow = walletsFor.some((w) =>
    isLowBalance(w, bookings, exceptions, completedLogs, todayStr),
  );
  const duration = minutesBetween(cls.startTime, cls.endTime);
  // A "this only" override (rescheduled exception backing this date) is a
  // one-off divergence from the series, so don't paint it as recurring.
  const isRecurring =
    !hasBackingException &&
    (!cls.startDate || !cls.endDate || cls.startDate !== cls.endDate);

  return (
    <div
      className="rounded-[14px] border flex items-stretch relative"
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--line)',
        padding: compact ? 14 : 16,
        gap: compact ? 12 : 16,
        opacity: doneLoading ? 1 : isDone ? 0.72 : 1,
        transition: 'opacity 180ms ease-out',
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
            <span className="fade-in inline-flex">
              <Chip tone="good">
                <IconCheck size={11} /> Done
              </Chip>
            </span>
          )}
          {isGroup && <Chip tone="accent">Group · {effectiveIds.length}</Chip>}
          {anyLow && !isDone && !doneLoading && <Chip tone="warn">Low wallet</Chip>}
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
          <div className="flex gap-2 mt-1.5" style={{ minHeight: 28 }}>
            {doneLoading ? null : !isDone ? (
              <span className="fade-in inline-flex">
                <Btn size="sm" variant="primary" onClick={onMarkDone}>
                  <IconCheck size={13} /> Mark done
                </Btn>
              </span>
            ) : (
              <span className="fade-in inline-flex">
                <Btn size="sm" variant="ghost" onClick={onUndo}>
                  <IconUndo size={13} /> Undo
                </Btn>
              </span>
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
        <div style={{ minHeight: 28, minWidth: 28 }} className="flex items-end">
          {doneLoading ? null : isDone ? (
            compact ? (
              <span className="fade-in inline-flex">
                <Btn size="sm" variant="ghost" onClick={onUndo}>
                  <IconUndo size={12} />
                </Btn>
              </span>
            ) : null
          ) : (
            <span className="fade-in inline-flex">
              <ClassActionsMenu
                onMarkDone={onMarkDone}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onCancel={onCancel}
              />
            </span>
          )}
        </div>
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
// Cancel-lesson scope picker
// ────────────────────────────────────────────────────────────────────────────

function CancelScopeBody({
  ctx,
  scope,
  setScope,
  cancelling,
  onKeep,
  onConfirm,
}: {
  ctx: {
    booking: Booking;
    dateStr: string;
    backingExceptionId: string | null;
    isOneTime: boolean;
    canScope: boolean;
  };
  scope: 'this' | 'future';
  setScope: (s: 'this' | 'future') => void;
  cancelling: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  const { booking, dateStr, canScope } = ctx;
  const dateObj = parseDateString(dateStr);
  const dateLabel = formatDateFull(dateObj);
  const title = booking.className?.trim() || 'Lesson';
  const timeRange = `${formatTimeDisplay(booking.startTime)}–${formatTimeDisplay(booking.endTime)}`;
  const locationName = booking.locationName || '';

  return (
    <div className="space-y-4">
      {/* Class info */}
      <div
        className="rounded-[10px] border p-3"
        style={{ background: 'var(--bad-soft)', borderColor: 'var(--bad-soft)' }}
      >
        <div
          className="text-[13.5px] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {dateLabel} · {timeRange}
          {locationName ? ` · ${locationName}` : ''}
        </div>
      </div>

      {canScope && (
        <>
          <div
            className="text-[10.5px] font-semibold uppercase"
            style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
          >
            This is a recurring weekly lesson
          </div>
          <div className="space-y-2">
            <ScopeOption
              selected={scope === 'this'}
              onClick={() => setScope('this')}
              title="Cancel this date only"
              description={`Only ${dateLabel} will be cancelled. Future weeks stay as-is.`}
            />
            <ScopeOption
              selected={scope === 'future'}
              onClick={() => setScope('future')}
              title="Cancel all future occurrences"
              description={`Ends the weekly lesson starting from ${dateLabel}. Past weeks are unaffected.`}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Btn variant="outline" onClick={onKeep} disabled={cancelling}>
          Keep lesson
        </Btn>
        <button
          onClick={onConfirm}
          disabled={cancelling}
          className="rounded-[8px] py-2 text-[13.5px] font-medium transition-colors disabled:opacity-55 flex items-center justify-center gap-1.5"
          style={{ background: 'var(--bad)', color: '#fff' }}
        >
          <IconTrash size={13} />
          {cancelling ? 'Cancelling…' : 'Cancel lesson'}
        </button>
      </div>
    </div>
  );
}

function ScopeOption({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-[10px] border p-3 transition-colors"
      style={{
        background: selected ? 'var(--bg)' : 'var(--panel)',
        borderColor: selected ? 'var(--ink)' : 'var(--line-2)',
        boxShadow: selected ? 'var(--shadow-sm)' : 'none',
      }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 shrink-0 w-4 h-4 rounded-full border flex items-center justify-center"
          style={{
            borderColor: selected ? 'var(--ink)' : 'var(--line-2)',
            background: 'var(--bg)',
          }}
        >
          {selected && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: 'var(--ink)' }}
            />
          )}
        </span>
        <div className="min-w-0">
          <div
            className="text-[13.5px] font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            {title}
          </div>
          <div
            className="text-[12px] mt-0.5 leading-snug"
            style={{ color: 'var(--ink-3)' }}
          >
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}

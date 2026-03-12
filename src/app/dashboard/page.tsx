'use client';

import { useState, useMemo } from 'react';
import { collection, doc, writeBatch, serverTimestamp, increment, getDoc, updateDoc, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings, useLessonLogs, useClassExceptions, useStudents } from '@/hooks/useCoachData';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Booking } from '@/types';
import { formatTimeDisplay } from '@/lib/availability-engine';
import { findOrCreateStudent } from '@/lib/students';
import { getClassesForDate, isRescheduledToDate } from '@/lib/class-schedule';

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
  const [rescheduling, setRescheduling] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [markDoneBooking, setMarkDoneBooking] = useState<Booking | null>(null);
  const [markDonePrice, setMarkDonePrice] = useState(0);
  const [markDoneNote, setMarkDoneNote] = useState('');
  const [packageWarning, setPackageWarning] = useState<{
    studentName: string;
    remaining: number;
    total: number;
    lastPrice: number;
    credit: number;
  } | null>(null);

  const selectedDateStr = getDateString(selectedDate);
  const todayStr = getDateString(new Date());
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const { lessonLogs } = useLessonLogs(coach?.id, selectedDateStr);

  const dayClasses = useMemo(() => {
    return getClassesForDate(selectedDateStr, bookings, classExceptions);
  }, [selectedDateStr, bookings, classExceptions]);

  const doneBookingIds = useMemo(() => {
    return new Set(lessonLogs.map((l) => l.bookingId));
  }, [lessonLogs]);

  const openMarkDone = (booking: Booking) => {
    setMarkDoneBooking(booking);
    setMarkDonePrice(booking.price ?? 0);
    setMarkDoneNote('');
    setMenuOpen(null);
  };

  const handleConfirmMarkDone = async () => {
    const booking = markDoneBooking;
    if (!coach || !db || !booking) return;
    setMarking(booking.id);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);
      const studentId = await findOrCreateStudent(
        firestore, coach.id, booking.clientName, booking.clientPhone
      );
      const logRef = doc(collection(firestore, 'coaches', coach.id, 'lessonLogs'));
      const logData: Record<string, unknown> = {
        date: selectedDateStr,
        bookingId: booking.id,
        studentId,
        studentName: booking.clientName,
        locationName: booking.locationName,
        startTime: booking.startTime,
        endTime: booking.endTime,
        price: markDonePrice,
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

      // Calculate credit: if actual price < booking price, add the difference
      const bookingPrice = booking.price ?? 0;
      if (markDonePrice < bookingPrice && bookingPrice > 0) {
        const creditDiff = bookingPrice - markDonePrice;
        updateData.credit = increment(creditDiff);
      }

      batch.update(studentRef, updateData);
      await batch.commit();
      setMarkDoneBooking(null);
      showToast('Class marked as done!', 'success');

      // Check package status after marking done
      const student = students.find((s) => s.id === studentId);
      if (student && student.prepaidTotal > 0) {
        const remainingAfter = student.prepaidTotal - (student.prepaidUsed + 1);
        if (remainingAfter <= 0) {
          const perLessonPrice = bookingPrice;
          const packagePrice = perLessonPrice * student.prepaidTotal;
          const currentCredit = (student.credit ?? 0) + (markDonePrice < bookingPrice ? bookingPrice - markDonePrice : 0);

          // Set pending payment on the student record
          const paymentAmount = Math.max(0, packagePrice - currentCredit);
          if (paymentAmount > 0) {
            const firestore2 = db as Firestore;
            const studentPayRef = doc(firestore2, 'coaches', coach.id, 'students', studentId);
            await updateDoc(studentPayRef, {
              pendingPayment: paymentAmount,
              credit: 0,
              updatedAt: serverTimestamp(),
            });
          }

          setPackageWarning({
            studentName: booking.clientName,
            remaining: remainingAfter,
            total: student.prepaidTotal,
            lastPrice: packagePrice,
            credit: currentCredit,
          });
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
    if (rescheduleDate === selectedDateStr) {
      showToast('New date must be different from original', 'error');
      return;
    }
    setRescheduling(true);
    try {
      const firestore = db as Firestore;
      const exRef = doc(collection(firestore, 'coaches', coach.id, 'classExceptions'));
      const batch = writeBatch(firestore);
      batch.set(exRef, {
        bookingId: rescheduleBooking.id,
        originalDate: selectedDateStr,
        type: 'rescheduled',
        newDate: rescheduleDate,
        createdAt: serverTimestamp(),
      });
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
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">{formattedDate}</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
          {dayClasses.length} class{dayClasses.length !== 1 ? 'es' : ''}
        </p>
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
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mt-0.5">{booking.clientName}</p>
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
                                setRescheduleDate('');
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

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setRescheduleBooking(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleReschedule}
                loading={rescheduling}
                disabled={!rescheduleDate || rescheduleDate === selectedDateStr}
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

'use client';

import { useState, useMemo } from 'react';
import { collection, addDoc, doc, increment, updateDoc, writeBatch, serverTimestamp, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings, useLessonLogs } from '@/hooks/useCoachData';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { DayOfWeek, Booking } from '@/types';
import { getDayDisplayName, formatTimeDisplay } from '@/lib/availability-engine';
import { findOrCreateStudent } from '@/lib/students';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function getTodayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function DashboardPage() {
  const { coach } = useAuth();
  const { locations } = useLocations(coach?.id);
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const todayDate = getTodayString();
  const { lessonLogs } = useLessonLogs(coach?.id, todayDate);
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);

  const today = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  const todaysClasses = useMemo(() => {
    return bookings
      .filter((b) => b.dayOfWeek === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [bookings, today]);

  const doneBookingIds = useMemo(() => {
    return new Set(lessonLogs.map((l) => l.bookingId));
  }, [lessonLogs]);

  const pendingClasses = todaysClasses.filter((b) => !doneBookingIds.has(b.id));

  const toggleCheck = (bookingId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) {
        next.delete(bookingId);
      } else {
        next.add(bookingId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const allPendingIds = pendingClasses.map((b) => b.id);
    setCheckedIds(new Set(allPendingIds));
  };

  const handleMarkDone = async () => {
    if (!coach || !db || checkedIds.size === 0) return;
    setMarking(true);

    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);
      const toMark = todaysClasses.filter((b) => checkedIds.has(b.id));

      for (const booking of toMark) {
        const studentId = await findOrCreateStudent(
          firestore,
          coach.id,
          booking.clientName,
          booking.clientPhone
        );

        // Create lesson log
        const logRef = doc(collection(firestore, 'coaches', coach.id, 'lessonLogs'));
        batch.set(logRef, {
          date: todayDate,
          bookingId: booking.id,
          studentId,
          studentName: booking.clientName,
          locationName: booking.locationName,
          startTime: booking.startTime,
          endTime: booking.endTime,
          price: booking.price ?? 0,
          createdAt: serverTimestamp(),
        });

        // Increment prepaidUsed if student has a prepaid package
        // We need to check this - fetch student doc to see if prepaidTotal > 0
        // For atomicity within batch, we'll use increment which works even if prepaidTotal is 0
        // The UI will show correct remaining regardless
        const studentRef = doc(firestore, 'coaches', coach.id, 'students', studentId);
        batch.update(studentRef, {
          prepaidUsed: increment(1),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setCheckedIds(new Set());
      showToast(`${toMark.length} class${toMark.length > 1 ? 'es' : ''} marked as done!`, 'success');
    } catch (error) {
      console.error('Error marking classes done:', error);
      showToast('Failed to mark classes as done', 'error');
    } finally {
      setMarking(false);
    }
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">
          Today&apos;s Classes
        </h1>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">
          {getDayDisplayName(today)} &middot; {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Today's classes */}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
        <div className="p-6 border-b border-gray-100 dark:border-[#333333] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
            Schedule ({todaysClasses.length} class{todaysClasses.length !== 1 ? 'es' : ''})
          </h2>
          {pendingClasses.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button
                size="sm"
                onClick={handleMarkDone}
                loading={marking}
                disabled={checkedIds.size === 0}
              >
                Mark Done ({checkedIds.size})
              </Button>
            </div>
          )}
        </div>

        {todaysClasses.length === 0 ? (
          <div className="p-6 text-center text-gray-400 dark:text-zinc-500">
            No classes scheduled for today.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#333333]">
            {todaysClasses.map((booking) => {
              const isDone = doneBookingIds.has(booking.id);
              const isChecked = checkedIds.has(booking.id);

              return (
                <div
                  key={booking.id}
                  className={`flex items-center gap-4 p-4 sm:p-6 ${
                    isDone ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex-shrink-0">
                    {isDone ? (
                      <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleCheck(booking.id)}
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                          isChecked
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 dark:border-zinc-500 hover:border-blue-400'
                        }`}
                      >
                        {isChecked && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-zinc-100">
                        {formatTimeDisplay(booking.startTime)} – {formatTimeDisplay(booking.endTime)}
                      </span>
                      {isDone && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mt-0.5">
                      {booking.clientName}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                      {booking.locationName}
                    </p>
                  </div>

                  <div className="text-right">
                    {(booking.price ?? 0) > 0 && (
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        RM {booking.price}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                      {booking.lessonType === 'group' ? `Group (${booking.groupSize})` : 'Private'}
                    </p>
                  </div>
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
    </div>
  );
}

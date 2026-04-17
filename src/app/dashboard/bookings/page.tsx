'use client';

import { useAuth } from '@/lib/auth-context';
import { useBookings } from '@/hooks/useCoachData';
import { DayOfWeek, Booking } from '@/types';
import { getDayDisplayName, formatTimeDisplay } from '@/lib/time-format';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function BookingsPage() {
  const { coach } = useAuth();
  const { bookings, loading } = useBookings(coach?.id);

  const confirmedBookings = bookings.filter((b) =>
    b.status === 'confirmed' &&
    !b.endDate // Exclude one-time classes and ended/split bookings
  );

  // Group bookings by day
  const bookingsByDay = DAYS.reduce((acc, day) => {
    acc[day] = confirmedBookings
      .filter((b) => b.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    return acc;
  }, {} as Record<DayOfWeek, Booking[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Schedule</h1>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">Your recurring weekly bookings</p>
      </div>

      {/* Weekly schedule view */}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
        <div className="p-6 border-b border-gray-100 dark:border-[#333333]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Weekly Schedule</h2>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            {DAYS.map((day) => (
              <div key={day} className="border-b border-gray-100 dark:border-[#333333] pb-4 last:border-0 last:pb-0">
                <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
                  {getDayDisplayName(day)}
                </h3>
                {bookingsByDay[day].length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-zinc-500">No bookings</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {bookingsByDay[day].map((booking) => {
                      const rosterSize = booking.studentIds.length;
                      const total = Object.values(booking.studentPrices).reduce((s, p) => s + (p ?? 0), 0);
                      return (
                      <div
                        key={booking.id}
                        className="p-4 bg-gray-50 dark:bg-[#1a1a1a]/50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-zinc-100">
                            {formatTimeDisplay(booking.startTime)} - {formatTimeDisplay(booking.endTime)}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            rosterSize > 1
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          }`}>
                            {rosterSize > 1 ? `Group (${rosterSize})` : 'Private'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">{booking.className}</p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{booking.locationName}</p>
                        <p className={`text-xs font-medium mt-1 ${total > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                          {total > 0 ? `RM ${total}` : 'Free'}
                        </p>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

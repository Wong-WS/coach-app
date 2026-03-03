'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings } from '@/hooks/useCoachData';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { DayOfWeek } from '@/types';
import { getDayDisplayName, formatTimeDisplay } from '@/lib/availability-engine';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function DashboardPage() {
  const { coach } = useAuth();
  const { locations } = useLocations(coach?.id);
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

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

  // Group bookings by day
  const bookingsByDay = DAYS.reduce((acc, day) => {
    acc[day] = bookings.filter((b) => b.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    return acc;
  }, {} as Record<DayOfWeek, typeof bookings>);

  // Get current day
  const today = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Welcome, {coach.displayName}!</h1>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">Here&apos;s an overview of your schedule</p>
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

      {/* Weekly schedule */}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
        <div className="p-6 border-b border-gray-100 dark:border-[#333333]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">This Week&apos;s Schedule</h2>
        </div>
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {DAYS.map((day) => (
              <div
                key={day}
                className={`p-4 rounded-lg ${day === today ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-200 dark:ring-blue-700' : 'bg-gray-50 dark:bg-[#1a1a1a]/50'}`}
              >
                <div className="mb-3">
                  {day === today && (
                    <span className="block text-xs font-medium text-blue-600 dark:text-blue-400 mb-0.5">Today</span>
                  )}
                  <h3 className={`text-sm font-medium ${day === today ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-zinc-300'}`}>
                    {getDayDisplayName(day)}
                  </h3>
                </div>
                {bookingsByDay[day].length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-zinc-500">No bookings</p>
                ) : (
                  <div className="space-y-2">
                    {bookingsByDay[day].map((booking) => (
                      <div
                        key={booking.id}
                        className="text-xs p-2 bg-white dark:bg-[#1f1f1f] rounded border border-gray-200 dark:border-zinc-500"
                      >
                        <p className="font-medium text-gray-900 dark:text-zinc-100">
                          {formatTimeDisplay(booking.startTime)}
                        </p>
                        <p className="text-gray-600 dark:text-zinc-400 truncate">{booking.clientName}</p>
                        <p className="text-gray-400 dark:text-zinc-500 truncate">{booking.locationName}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
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

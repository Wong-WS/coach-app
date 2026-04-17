'use client';

import { useState, useEffect, use } from 'react';
import { formatDateMedium, parseDateString } from '@/lib/date-format';

interface PortalData {
  studentName: string;
  walletBalance: number | null;
  coachName: string;
  serviceType: string;
  lessons: {
    date: string;
    startTime: string;
    endTime: string;
    locationName: string;
    note?: string;
  }[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function getDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return DAYS[date.getDay()];
}

export default function StudentPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/student/${token}`);
        if (!res.ok) {
          setError('Student portal not found.');
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError('Failed to load portal data.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#262626]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#262626]">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Not Found</h1>
          <p className="text-gray-500 dark:text-zinc-400">{error || 'This portal link is invalid.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#262626]">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-zinc-400">{data.coachName} {data.serviceType ? `\u00B7 ${data.serviceType}` : ''}</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1">
            Welcome, {data.studentName}!
          </h1>
        </div>

        {/* Wallet balance */}
        {data.walletBalance !== null && (
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <h2 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">Wallet Balance</h2>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-zinc-400">
                {data.walletBalance < 0 ? 'You owe' : 'Available'}
              </span>
              <span className={`text-2xl font-bold ${data.walletBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {data.walletBalance < 0 ? '-' : ''}RM {Math.abs(data.walletBalance).toFixed(0)}
              </span>
            </div>
          </div>
        )}

        {/* Lesson history */}
        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
          <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-100 dark:border-[#333333]">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
              Lesson History ({data.lessons.length})
            </h2>
          </div>
          {data.lessons.length === 0 ? (
            <div className="p-6 text-center text-gray-400 dark:text-zinc-500">
              No lessons recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[#333333]">
              {data.lessons.map((lesson, i) => (
                <div key={i} className="px-4 sm:px-6 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{formatDateMedium(parseDateString(lesson.date))}</p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500 text-right shrink-0">{lesson.locationName}</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                    {getDayName(lesson.date)} &middot; {formatTime(lesson.startTime)} &ndash; {formatTime(lesson.endTime)}
                  </p>
                  {lesson.note && (
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5 italic">{lesson.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 dark:text-zinc-500 pt-4">
          Powered by CoachApp
        </div>
      </div>
    </div>
  );
}

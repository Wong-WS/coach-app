'use client';

import { useState, useEffect, use } from 'react';
import { formatDateMedium, parseDateString } from '@/lib/date-format';

interface PortalData {
  studentName: string;
  prepaidTotal: number;
  prepaidUsed: number;
  credit: number;
  pendingPayment: number;
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

  const remaining = data.prepaidTotal - data.prepaidUsed;
  const hasPrepaid = data.prepaidTotal > 0;
  const hasCredit = (data.credit ?? 0) > 0;

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

        {/* Payment due banner */}
        {Math.max(0, (data.pendingPayment ?? 0) - (data.credit ?? 0)) > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Payment due: RM {Math.max(0, (data.pendingPayment ?? 0) - (data.credit ?? 0))}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Please arrange payment with your coach.
            </p>
          </div>
        )}

        {/* Prepaid status */}
        {hasPrepaid && (
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <h2 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">Lesson Package</h2>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-zinc-400">
                {data.prepaidUsed} of {data.prepaidTotal} lessons used
              </span>
              <span className={`font-medium ${remaining > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                {remaining > 0 ? `${remaining} remaining` : 'Package used up'}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full ${remaining > 0 ? 'bg-blue-600' : 'bg-red-500'}`}
                style={{
                  width: `${Math.min(100, (data.prepaidUsed / data.prepaidTotal) * 100)}%`,
                }}
              />
            </div>
            {hasCredit && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#333333] flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-zinc-400">Credit Balance</span>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">RM {data.credit}</span>
              </div>
            )}
          </div>
        )}

        {/* Credit balance (standalone if no prepaid package) */}
        {!hasPrepaid && hasCredit && (
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">Credit Balance</span>
              <span className="text-lg font-semibold text-green-600 dark:text-green-400">RM {data.credit}</span>
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

'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useBookings, useLessonLogs, usePayments, useStudents } from '@/hooks/useCoachData';
import { getDayDisplayName, formatTimeDisplay } from '@/lib/availability-engine';
import { formatDateMedium } from '@/lib/date-format';
import type { DayOfWeek, Booking, Student } from '@/types';

const DAY_TO_JS: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function countDayOccurrencesInMonth(dayOfWeek: DayOfWeek, year: number, month: number, fromDay = 1): number {
  const targetDay = DAY_TO_JS[dayOfWeek];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = fromDay; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === targetDay) count++;
  }
  return count;
}

function getMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

interface ProjectedCollection {
  packageRenewals: number;
  payPerLesson: number;
  total: number;
}

function computeProjectedCollections(
  students: Student[],
  recurringBookings: Booking[],
  year: number,
  month: number,
  fromDay = 1,
): ProjectedCollection {
  // Build student → bookings map (separate primary vs linked)
  const primaryBookingsMap = new Map<string, Booking[]>();
  const linkedBookingsMap = new Map<string, Booking[]>();
  for (const booking of recurringBookings) {
    // Check booking is active during this month
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    if (booking.startDate && booking.startDate > monthEnd) continue;
    if (booking.endDate && booking.endDate < monthStart) continue;

    // Primary student
    const primary = students.find(
      (s) => s.clientName === booking.clientName && s.clientPhone === (booking.clientPhone || '')
    );
    if (primary) {
      const existing = primaryBookingsMap.get(primary.id) ?? [];
      existing.push(booking);
      primaryBookingsMap.set(primary.id, existing);
    }
    // Linked students
    if (booking.linkedStudentIds) {
      for (const linkedId of booking.linkedStudentIds) {
        const existing = linkedBookingsMap.get(linkedId) ?? [];
        existing.push(booking);
        linkedBookingsMap.set(linkedId, existing);
      }
    }
  }

  let packageRenewals = 0;
  let payPerLessonTotal = 0;

  for (const student of students) {
    // Use lessonRate if set, otherwise fall back to the booking price
    const getRate = (b: Booking) => {
      if (student.lessonRate != null && student.lessonRate > 0) return student.lessonRate;
      if (b.studentPrices?.[student.id] != null) return b.studentPrices[student.id];
      return b.price ?? 0;
    };

    if (student.payPerLesson) {
      // Only count primary bookings (not linked) for pay-per-lesson
      const bookings = primaryBookingsMap.get(student.id);
      if (!bookings || bookings.length === 0) continue;
      for (const b of bookings) {
        const rate = getRate(b);
        if (rate <= 0) continue;
        const count = countDayOccurrencesInMonth(b.dayOfWeek, year, month, fromDay);
        payPerLessonTotal += count * rate;
      }
    } else if (student.prepaidTotal > 0) {
      // Package student — use both primary and linked bookings
      const primary = primaryBookingsMap.get(student.id) ?? [];
      const linked = linkedBookingsMap.get(student.id) ?? [];
      const studentBookings = [...primary, ...linked];
      if (studentBookings.length === 0) continue;

      const rate = getRate(studentBookings[0]);
      if (rate <= 0) continue;

      const remaining = Math.max(0, student.prepaidTotal - student.prepaidUsed);
      const lessonsPerWeek = studentBookings.length;

      if (remaining === 0) {
        // Package already exhausted — already captured in "Currently unpaid", skip
      } else {
        // Calculate when package runs out
        const weeksUntilExhaustion = Math.ceil(remaining / lessonsPerWeek);
        const exhaustionDate = new Date();
        exhaustionDate.setDate(exhaustionDate.getDate() + weeksUntilExhaustion * 7);

        if (exhaustionDate.getFullYear() === year && exhaustionDate.getMonth() === month) {
          packageRenewals += rate * student.prepaidTotal;
        }
      }
    }
  }

  return {
    packageRenewals,
    payPerLesson: payPerLessonTotal,
    total: packageRenewals + payPerLessonTotal,
  };
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  return { start: fmt(monday), end: fmt(sunday) };
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const fmt = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  return { start: fmt(start), end: fmt(end) };
}

export default function IncomePage() {
  const { coach } = useAuth();
  const { bookings, loading } = useBookings(coach?.id, 'confirmed');
  const { lessonLogs, loading: logsLoading } = useLessonLogs(coach?.id);
  const { payments, loading: paymentsLoading } = usePayments(coach?.id);
  const { students, loading: studentsLoading } = useStudents(coach?.id);

  // Only recurring bookings (no endDate) for projections
  const recurringBookings = bookings.filter((b) => !b.endDate);
  const unpricedCount = recurringBookings.filter((b) => !b.price).length;
  const weeklyTotal = recurringBookings.reduce((sum, b) => sum + (b.price ?? 0), 0);
  const monthlyTotal = weeklyTotal * (52 / 12);
  const annualTotal = weeklyTotal * 52;

  const weekRange = useMemo(() => getWeekRange(), []);
  const monthRange = useMemo(() => getMonthRange(), []);

  const weekActual = useMemo(() => {
    return lessonLogs
      .filter((l) => l.date >= weekRange.start && l.date <= weekRange.end)
      .reduce((sum, l) => sum + l.price, 0);
  }, [lessonLogs, weekRange]);

  const monthActual = useMemo(() => {
    return lessonLogs
      .filter((l) => l.date >= monthRange.start && l.date <= monthRange.end)
      .reduce((sum, l) => sum + l.price, 0);
  }, [lessonLogs, monthRange]);

  const monthPayments = useMemo(() => {
    const now = new Date();
    return payments.filter((p) => {
      return p.collectedAt.getFullYear() === now.getFullYear() && p.collectedAt.getMonth() === now.getMonth();
    });
  }, [payments]);

  const monthCollected = useMemo(() => monthPayments.reduce((sum, p) => sum + p.amount, 0), [monthPayments]);

  const recentPayments = useMemo(() => {
    return [...payments].slice(0, 20);
  }, [payments]);

  const recentLogs = useMemo(() => {
    return [...lessonLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);
  }, [lessonLogs]);

  const projectedCollections = useMemo(() => {
    const now = new Date();
    const currentMonth = computeProjectedCollections(students, recurringBookings, now.getFullYear(), now.getMonth(), now.getDate());
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonth = computeProjectedCollections(students, recurringBookings, nextDate.getFullYear(), nextDate.getMonth());
    const currentLabel = getMonthLabel(now.getFullYear(), now.getMonth());
    const nextLabel = getMonthLabel(nextDate.getFullYear(), nextDate.getMonth());
    const unpaid = students.reduce((sum, s) => sum + Math.max(0, (s.pendingPayment ?? 0) - (s.credit ?? 0)), 0);
    return { currentMonth, nextMonth, currentLabel, nextLabel, unpaid };
  }, [students, recurringBookings]);

  const formatRM = (amount: number) =>
    `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading || logsLoading || paymentsLoading || studentsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Income</h1>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">Actual earnings and projected income</p>
      </div>

      {/* Actual income */}
      {(lessonLogs.length > 0 || monthPayments.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <p className="text-sm text-gray-500 dark:text-zinc-400">This Week (Actual)</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{formatRM(weekActual)}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
              vs {formatRM(weeklyTotal)} projected
            </p>
          </div>
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <p className="text-sm text-gray-500 dark:text-zinc-400">This Month (Actual)</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{formatRM(monthActual)}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
              vs {formatRM(monthlyTotal)} projected
            </p>
          </div>
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Collected This Month</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{formatRM(monthCollected)}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
              {monthPayments.length} payment{monthPayments.length !== 1 ? 's' : ''} received
            </p>
          </div>
        </div>
      )}

      {unpricedCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            {unpricedCount} booking{unpricedCount > 1 ? 's have' : ' has'} no price set. Add prices to your bookings to get accurate projections.
          </p>
        </div>
      )}

      {/* Projected Collections */}
      {(projectedCollections.currentMonth.total > 0 || projectedCollections.nextMonth.total > 0 || projectedCollections.unpaid > 0) && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-3 uppercase tracking-wide">Projected Collections</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Current month */}
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
              <p className="text-sm text-gray-500 dark:text-zinc-400">{projectedCollections.currentLabel}</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {formatRM(projectedCollections.currentMonth.total)}
              </p>
              <div className="mt-3 space-y-1">
                {projectedCollections.currentMonth.packageRenewals > 0 && (
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Package renewals: {formatRM(projectedCollections.currentMonth.packageRenewals)}
                  </p>
                )}
                {projectedCollections.currentMonth.payPerLesson > 0 && (
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Pay-per-lesson: {formatRM(projectedCollections.currentMonth.payPerLesson)}
                  </p>
                )}
              </div>
              {projectedCollections.unpaid > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#333333]">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Currently unpaid: {formatRM(projectedCollections.unpaid)}
                  </p>
                </div>
              )}
            </div>
            {/* Next month */}
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
              <p className="text-sm text-gray-500 dark:text-zinc-400">{projectedCollections.nextLabel}</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {formatRM(projectedCollections.nextMonth.total)}
              </p>
              <div className="mt-3 space-y-1">
                {projectedCollections.nextMonth.packageRenewals > 0 && (
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Package renewals: {formatRM(projectedCollections.nextMonth.packageRenewals)}
                  </p>
                )}
                {projectedCollections.nextMonth.payPerLesson > 0 && (
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Pay-per-lesson: {formatRM(projectedCollections.nextMonth.payPerLesson)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projected summary cards */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 mb-3 uppercase tracking-wide">Projected</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Weekly</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1">{formatRM(weeklyTotal)}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">per week</p>
          </div>
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Monthly</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1">{formatRM(monthlyTotal)}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">weekly &times; 4.33</p>
          </div>
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Annual</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1">{formatRM(annualTotal)}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">weekly &times; 52</p>
          </div>
        </div>
      </div>

      {/* Recent lesson logs */}
      {recentLogs.length > 0 && (
        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
          <div className="p-6 border-b border-gray-100 dark:border-[#333333]">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Recent Lessons</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-[#333333]">
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Date</th>
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Student</th>
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Time</th>
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Location</th>
                  <th className="text-right px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-gray-50 dark:border-[#2a2a2a] last:border-0 hover:bg-gray-50 dark:hover:bg-[#262626]"
                  >
                    <td className="px-6 py-3 text-gray-900 dark:text-zinc-100">{log.date}</td>
                    <td className="px-6 py-3 text-gray-600 dark:text-zinc-400">{log.studentName}</td>
                    <td className="px-6 py-3 text-gray-600 dark:text-zinc-400">
                      {formatTimeDisplay(log.startTime)} &ndash; {formatTimeDisplay(log.endTime)}
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-zinc-400">{log.locationName}</td>
                    <td className="px-6 py-3 text-right">
                      {log.price > 0 ? (
                        <span className="text-gray-900 dark:text-zinc-100 font-medium">RM {log.price}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-zinc-500">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent payments */}
      {recentPayments.length > 0 && (
        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
          <div className="p-6 border-b border-gray-100 dark:border-[#333333]">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Recent Payments</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-[#333333]">
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Date</th>
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Student</th>
                  <th className="text-right px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-gray-50 dark:border-[#2a2a2a] last:border-0 hover:bg-gray-50 dark:hover:bg-[#262626]"
                  >
                    <td className="px-6 py-3 text-gray-900 dark:text-zinc-100">
                      {formatDateMedium(payment.collectedAt)}
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-zinc-400">{payment.studentName}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-blue-600 dark:text-blue-400 font-medium">{formatRM(payment.amount)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Booking breakdown */}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
        <div className="p-6 border-b border-gray-100 dark:border-[#333333]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Booking Breakdown</h2>
        </div>
        {recurringBookings.length === 0 ? (
          <div className="p-6 text-center text-gray-400 dark:text-zinc-500">
            No confirmed bookings yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-[#333333]">
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Client</th>
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Day</th>
                  <th className="text-left px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Time</th>
                  <th className="text-right px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">Price</th>
                  <th className="text-right px-6 py-3 text-gray-500 dark:text-zinc-400 font-medium">% of Weekly</th>
                </tr>
              </thead>
              <tbody>
                {recurringBookings.map((booking) => {
                  const price = booking.price ?? 0;
                  const pct = weeklyTotal > 0 ? ((price / weeklyTotal) * 100).toFixed(1) : '\u2014';
                  return (
                    <tr
                      key={booking.id}
                      className="border-b border-gray-50 dark:border-[#2a2a2a] last:border-0 hover:bg-gray-50 dark:hover:bg-[#262626]"
                    >
                      <td className="px-6 py-4 text-gray-900 dark:text-zinc-100 font-medium">{booking.clientName}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-400">{getDayDisplayName(booking.dayOfWeek)}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-400">
                        {formatTimeDisplay(booking.startTime)} &ndash; {formatTimeDisplay(booking.endTime)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {price > 0 ? (
                          <span className="text-gray-900 dark:text-zinc-100 font-medium">RM {price}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-zinc-500">&mdash;</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600 dark:text-zinc-400">
                        {weeklyTotal > 0 && price > 0 ? `${pct}%` : '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {weeklyTotal > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-[#444444] bg-gray-50 dark:bg-[#1a1a1a]">
                    <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-700 dark:text-zinc-300">Total</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-zinc-100">{formatRM(weeklyTotal)}</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-600 dark:text-zinc-400">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useAuth } from '@/lib/auth-context';
import { useBookings } from '@/hooks/useCoachData';
import { getDayDisplayName, formatTimeDisplay } from '@/lib/availability-engine';

export default function IncomePage() {
  const { coach } = useAuth();
  const { bookings, loading } = useBookings(coach?.id, 'confirmed');

  const unpricedCount = bookings.filter((b) => !b.price).length;
  const weeklyTotal = bookings.reduce((sum, b) => sum + (b.price ?? 0), 0);
  const monthlyTotal = weeklyTotal * (52 / 12);
  const annualTotal = weeklyTotal * 52;

  const formatRM = (amount: number) =>
    `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Income</h1>
        <p className="text-gray-600 dark:text-zinc-400 mt-1">Projected earnings based on your current weekly schedule</p>
      </div>

      {unpricedCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            {unpricedCount} booking{unpricedCount > 1 ? 's have' : ' has'} no price set. Add prices to your bookings to get accurate projections.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
          <p className="text-sm text-gray-500 dark:text-zinc-400">Weekly</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1">{formatRM(weeklyTotal)}</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">per week</p>
        </div>
        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
          <p className="text-sm text-gray-500 dark:text-zinc-400">Monthly</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1">{formatRM(monthlyTotal)}</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">weekly × 4.33</p>
        </div>
        <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333] p-6">
          <p className="text-sm text-gray-500 dark:text-zinc-400">Annual</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1">{formatRM(annualTotal)}</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">weekly × 52</p>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
        <div className="p-6 border-b border-gray-100 dark:border-[#333333]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Booking Breakdown</h2>
        </div>
        {bookings.length === 0 ? (
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
                {bookings.map((booking) => {
                  const price = booking.price ?? 0;
                  const pct = weeklyTotal > 0 ? ((price / weeklyTotal) * 100).toFixed(1) : '—';
                  return (
                    <tr
                      key={booking.id}
                      className="border-b border-gray-50 dark:border-[#2a2a2a] last:border-0 hover:bg-gray-50 dark:hover:bg-[#262626]"
                    >
                      <td className="px-6 py-4 text-gray-900 dark:text-zinc-100 font-medium">{booking.clientName}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-400">{getDayDisplayName(booking.dayOfWeek)}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-zinc-400">
                        {formatTimeDisplay(booking.startTime)} – {formatTimeDisplay(booking.endTime)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {price > 0 ? (
                          <span className="text-gray-900 dark:text-zinc-100 font-medium">RM {price}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600 dark:text-zinc-400">
                        {weeklyTotal > 0 && price > 0 ? `${pct}%` : '—'}
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

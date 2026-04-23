'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useBookings } from '@/hooks/useCoachData';
import { getBookingTotal } from '@/lib/class-schedule';
import { Chip } from '@/components/paper';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const { coach } = useAuth();
  const { bookings, loading } = useBookings(coach?.id);

  const confirmedBookings = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === 'confirmed' && !b.endDate, // recurring only
      ),
    [bookings],
  );

  const totalSlots = confirmedBookings.length;
  const weeklyTotal = useMemo(
    () => confirmedBookings.reduce((s, b) => s + getBookingTotal(b), 0),
    [confirmedBookings],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: 'var(--accent)' }}
        />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-5 sm:py-7" style={{ color: 'var(--ink)' }}>
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <div
            className="text-[11px] font-semibold uppercase"
            style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
          >
            Schedule
          </div>
          <div
            className="text-[22px] sm:text-[28px] font-semibold leading-tight"
            style={{ letterSpacing: '-0.6px' }}
          >
            Recurring weekly
          </div>
          <div
            className="text-[13px] mt-1.5"
            style={{ color: 'var(--ink-3)' }}
          >
            <span className="tnum" style={{ color: 'var(--ink)', fontWeight: 500 }}>
              {totalSlots}
            </span>{' '}
            <span className="sm:hidden">recurring</span>
            <span className="hidden sm:inline">{totalSlots === 1 ? 'slot' : 'slots'}</span>{' '}
            ·{' '}
            <span
              className="mono tnum"
              style={{ color: 'var(--ink)', fontWeight: 500 }}
            >
              RM {weeklyTotal.toLocaleString()}
            </span>
            <span className="ml-1">/week</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
          <Chip tone="soft">Read-only</Chip>
          <span>To change, open the class on Overview</span>
        </div>
      </div>

      {confirmedBookings.length === 0 ? (
        <div
          className="rounded-[12px] border py-16 text-center"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
        >
          <p
            className="text-[15px] font-semibold mb-1"
            style={{ color: 'var(--ink)' }}
          >
            No recurring classes yet
          </p>
          <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
            Add a recurring class on Overview to see it here.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop grid — added in Task 2 */}
          <div className="hidden sm:block" />
          {/* Mobile list — added in Task 3 */}
          <div className="sm:hidden" />
        </>
      )}
    </div>
  );
}

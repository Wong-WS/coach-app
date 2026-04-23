'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useBookings } from '@/hooks/useCoachData';
import { getBookingTotal } from '@/lib/class-schedule';
import { Chip } from '@/components/paper';
import type { Booking, DayOfWeek } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DAY_LABELS_SHORT: Record<DayOfWeek, string> = {
  monday: 'MON',
  tuesday: 'TUE',
  wednesday: 'WED',
  thursday: 'THU',
  friday: 'FRI',
  saturday: 'SAT',
  sunday: 'SUN',
};

const HOUR_PX = 56;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// "14:00" → "2p", "14:30" → "2:30p". Duplicated from src/app/dashboard/page.tsx
// to keep this PR single-file; a follow-up can hoist to @/lib/time-format.
function fmtTimeShort(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'p' : 'a';
  const h12 = hh % 12 || 12;
  if (mm === 0) return `${h12}${period}`;
  return `${h12}:${String(mm).padStart(2, '0')}${period}`;
}

// Returns the inclusive list of hours the grid should display. Floors at 8am
// and ceilings at 9pm (mock default), but expands if any booking starts
// earlier or ends later.
function computeGridHours(bookings: Booking[]): number[] {
  let startH = 8;
  let endH = 21;
  for (const b of bookings) {
    const [sh] = b.startTime.split(':').map(Number);
    const [eh, em] = b.endTime.split(':').map(Number);
    if (sh < startH) startH = sh;
    const ceil = em > 0 ? eh + 1 : eh;
    if (ceil > endH) endH = ceil;
  }
  const out: number[] = [];
  for (let h = startH; h < endH; h++) out.push(h);
  return out;
}

// ─── Desktop weekly grid ─────────────────────────────────────────────────────

function WeeklyGrid({
  byDay,
  hours,
}: {
  byDay: Record<DayOfWeek, Booking[]>;
  hours: number[];
}) {
  const gridStart = hours[0];
  const gridMinHeight = hours.length * HOUR_PX;

  return (
    <div
      className="rounded-[12px] border overflow-hidden"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      {/* Day header row */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: '52px repeat(7, 1fr)',
          borderBottom: '1px solid var(--line)',
          background: 'var(--panel)',
        }}
      >
        <div />
        {DAYS.map((d) => {
          const count = byDay[d].length;
          return (
            <div
              key={d}
              className="px-3 py-3.5"
              style={{ borderLeft: '1px solid var(--line)' }}
            >
              <div
                className="text-[11px] font-semibold uppercase"
                style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
              >
                {DAY_LABELS_SHORT[d]}
              </div>
              <div
                className="text-[13px] mt-0.5"
                style={{ color: 'var(--ink)', fontWeight: 500 }}
              >
                {count} {count === 1 ? 'class' : 'classes'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Body: hour gutter + 7 day columns */}
      <div
        className="grid relative"
        style={{
          gridTemplateColumns: '52px repeat(7, 1fr)',
        }}
      >
        {/* Hour labels */}
        <div>
          {hours.map((h) => (
            <div
              key={h}
              className="flex justify-end pr-2 pt-0.5"
              style={{ height: HOUR_PX }}
            >
              <span
                className="mono tnum text-[10.5px]"
                style={{ color: 'var(--ink-4)', fontWeight: 500 }}
              >
                {h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map((d) => (
          <div
            key={d}
            className="relative"
            style={{
              borderLeft: '1px solid var(--line)',
              minHeight: gridMinHeight,
            }}
          >
            {/* Hour lines */}
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute left-0 right-0"
                style={{
                  top: i * HOUR_PX,
                  height: 1,
                  background: 'var(--line)',
                  opacity: 0.5,
                }}
              />
            ))}
            {/* Booking blocks */}
            {byDay[d].map((b) => {
              const [sh, sm] = b.startTime.split(':').map(Number);
              const [eh, em] = b.endTime.split(':').map(Number);
              const startOffset = (sh - gridStart + sm / 60) * HOUR_PX;
              const height = (eh - sh + (em - sm) / 60) * HOUR_PX;
              const isGroup = b.studentIds.length > 1;
              const background = isGroup ? 'var(--accent-soft)' : 'var(--line)';
              const borderColor = isGroup ? 'var(--accent)' : 'var(--line-2)';
              const accentEdge = isGroup ? 'var(--accent)' : 'var(--ink-3)';
              const primaryColor = isGroup ? 'var(--accent-ink)' : 'var(--ink)';
              const secondaryColor = isGroup ? 'var(--accent-ink)' : 'var(--ink-2)';
              const tertiaryColor = isGroup ? 'var(--accent-ink)' : 'var(--ink-3)';
              const firstLocationWord = b.locationName.split(' ')[0];
              return (
                <div
                  key={b.id}
                  className="absolute flex flex-col overflow-hidden"
                  style={{
                    top: startOffset + 2,
                    left: 4,
                    right: 4,
                    height: height - 4,
                    borderRadius: 8,
                    background,
                    border: `1px solid ${borderColor}`,
                    borderLeft: `3px solid ${accentEdge}`,
                    padding: '5px 7px',
                    gap: 1,
                  }}
                >
                  <div
                    className="text-[11px] font-semibold truncate"
                    style={{ color: primaryColor }}
                  >
                    {b.className}
                  </div>
                  <div
                    className="mono tnum text-[10px]"
                    style={{ color: secondaryColor, opacity: 0.85 }}
                  >
                    {fmtTimeShort(b.startTime)}–{fmtTimeShort(b.endTime)}
                  </div>
                  {height > 48 && (
                    <div
                      className="text-[10px] truncate"
                      style={{ color: tertiaryColor, opacity: 0.8 }}
                    >
                      {firstLocationWord}
                      {isGroup ? ` · ${b.studentIds.length}` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const byDay = useMemo(() => {
    const m: Record<DayOfWeek, Booking[]> = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    };
    for (const b of confirmedBookings) m[b.dayOfWeek].push(b);
    for (const d of DAYS) m[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [confirmedBookings]);

  const hours = useMemo(
    () => computeGridHours(confirmedBookings),
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
          <div className="hidden sm:block">
            <WeeklyGrid byDay={byDay} hours={hours} />
            <div
              className="flex items-center gap-3.5 mt-3 text-[12px]"
              style={{ color: 'var(--ink-3)' }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: 'var(--line)',
                    border: '1px solid var(--line-2)',
                    borderLeft: '3px solid var(--ink-3)',
                  }}
                />{' '}
                Private
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--accent)',
                    borderLeft: '3px solid var(--accent)',
                  }}
                />{' '}
                Group
              </div>
            </div>
          </div>
          {/* Mobile list — added in Task 3 */}
          <div className="sm:hidden" />
        </>
      )}
    </div>
  );
}

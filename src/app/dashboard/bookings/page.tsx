'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useBookings, useStudents } from '@/hooks/useCoachData';
import { getBookingTotalCents } from '@/lib/class-schedule';
import { Chip } from '@/components/paper';
import type { Booking, DayOfWeek, Student } from '@/types';
import { formatCents, formatCentsGrouped } from '@/lib/money';
import { dayTimeline, type FreeFit, type TimelineItem } from '@/lib/schedule-gaps';

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

const DAY_LABELS_FULL: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};


// ─── Helpers ─────────────────────────────────────────────────────────────────

function hm(t: string): { label: string; period: 'am' | 'pm' } {
  const [hh, mm] = t.split(':').map(Number);
  const h12 = hh % 12 || 12;
  return { label: mm === 0 ? `${h12}` : `${h12}:${String(mm).padStart(2, '0')}`, period: hh < 12 ? 'am' : 'pm' };
}

/** "3:30–4:30pm", "11:30am–12:30pm". */
function fmtRange(start: string, end: string): string {
  const a = hm(start);
  const b = hm(end);
  return `${a.label}${a.period === b.period ? '' : a.period}–${b.label}${b.period}`;
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Student names instead of "Swimming class with …": "Vera", "Ana & Ben", "Nadia +3". */
function classTitle(b: Booking, studentsById: Map<string, Student>): string {
  const names = b.studentIds
    .map((sid) => studentsById.get(sid)?.clientName)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return b.className || 'Class';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

function fitLabel(f: FreeFit): string {
  const where = f.locationName;
  if (f.kind === 'slot') return where ? `${where} ${fmtRange(f.start, f.end)}` : `anywhere else ${fmtRange(f.start, f.end)}`;
  return where ? `${f.count} at ${where}` : `${f.count} anywhere else`;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function ClassCard({
  b,
  studentsById,
  showPrice = false,
}: {
  b: Booking;
  studentsById: Map<string, Student>;
  showPrice?: boolean;
}) {
  const isGroup = b.studentIds.length > 1;
  return (
    <div
      className="flex items-start gap-2 rounded-[8px] px-2.5 py-2"
      style={{
        background: 'var(--line)',
        borderLeft: `4px solid ${isGroup ? 'var(--accent)' : 'var(--ink-3)'}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="mono tnum text-[12.5px] font-semibold" style={{ color: 'var(--ink)' }}>
          {fmtRange(b.startTime, b.endTime)}
        </div>
        <div className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--ink)' }}>
          {classTitle(b, studentsById)}
        </div>
        <div className="text-[11.5px] truncate" style={{ color: 'var(--ink-2)' }}>
          {b.locationName}
          {isGroup ? ` · ${b.studentIds.length}` : ''}
        </div>
      </div>
      {showPrice && (
        <div className="mono tnum text-[12.5px] shrink-0 pt-0.5" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
          RM {formatCents(getBookingTotalCents(b))}
        </div>
      )}
    </div>
  );
}

function FreeBox({ item, allDay }: { item: Extract<TimelineItem, { kind: 'free' }>; allDay: boolean }) {
  // Too short for a class: a quiet dashed line with the minutes.
  if (item.minutes < 60 && item.fits.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-0.5 text-[10.5px] font-medium" style={{ color: 'var(--ink-4)' }}>
        <span className="flex-1" style={{ borderTop: '1px dashed var(--line-2)' }} />
        <span className="mono tnum">{fmtDuration(item.minutes)}</span>
        <span className="flex-1" style={{ borderTop: '1px dashed var(--line-2)' }} />
      </div>
    );
  }
  return (
    <div className="rounded-[8px] px-2.5 py-2" style={{ border: '1.5px dashed var(--line-2)' }}>
      <div className="mono tnum text-[11.5px] font-semibold" style={{ color: 'var(--ink-3)' }}>
        {allDay ? 'Free all day' : `${fmtRange(item.start, item.end)} · Free ${fmtDuration(item.minutes)}`}
      </div>
      {!allDay &&
        (item.fits.length > 0 ? (
          item.fits.map((f) => (
            <div key={fitLabel(f)} className="text-[11.5px] truncate" style={{ color: 'var(--good)' }}>
              {fitLabel(f)}
            </div>
          ))
        ) : (
          <div className="text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
            too tight with travel
          </div>
        ))}
    </div>
  );
}

function DayTimeline({
  day,
  classes,
  studentsById,
  showPrice = false,
}: {
  day: DayOfWeek;
  classes: Booking[];
  studentsById: Map<string, Student>;
  showPrice?: boolean;
}) {
  const items = dayTimeline(classes, day === 'saturday' || day === 'sunday');
  const allDay = classes.length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) =>
        item.kind === 'class' ? (
          <ClassCard key={item.booking.id} b={item.booking} studentsById={studentsById} showPrice={showPrice} />
        ) : (
          <FreeBox key={`free-${item.start}`} item={item} allDay={allDay} />
        ),
      )}
    </div>
  );
}

function DayHeading({ day, count, full = false }: { day: DayOfWeek; count: number; full?: boolean }) {
  return (
    <div className="text-[12px] font-semibold uppercase mb-2" style={{ color: 'var(--ink-2)', letterSpacing: '0.05em' }}>
      {full ? DAY_LABELS_FULL[day] : DAY_LABELS_SHORT[day]}{' '}
      <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>· {count}</span>
    </div>
  );
}

/** Desktop: seven day columns, each a list of classes with free time between. */
function WeekColumns({
  byDay,
  studentsById,
}: {
  byDay: Record<DayOfWeek, Booking[]>;
  studentsById: Map<string, Student>;
}) {
  return (
    <div
      className="rounded-[12px] border p-2.5 grid gap-2.5 items-start"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
    >
      {DAYS.map((d) => (
        <div key={d} className="min-w-0">
          <DayHeading day={d} count={byDay[d].length} />
          <DayTimeline day={d} classes={byDay[d]} studentsById={studentsById} />
        </div>
      ))}
    </div>
  );
}

/** Phone and narrow screens: days stacked, same timeline, with prices. */
function DayList({
  byDay,
  studentsById,
}: {
  byDay: Record<DayOfWeek, Booking[]>;
  studentsById: Map<string, Student>;
}) {
  return (
    <div className="flex flex-col gap-5">
      {DAYS.map((d) => (
        <div key={d}>
          <DayHeading day={d} count={byDay[d].length} full />
          <DayTimeline day={d} classes={byDay[d]} studentsById={studentsById} showPrice />
        </div>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const { coach } = useAuth();
  const { bookings, loading } = useBookings(coach?.id);
  const { students } = useStudents(coach?.id);

  const confirmedBookings = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === 'confirmed' && !b.endDate, // recurring only
      ),
    [bookings],
  );

  const totalSlots = confirmedBookings.length;
  const weeklyTotal = useMemo(
    () => confirmedBookings.reduce((s, b) => s + getBookingTotalCents(b), 0),
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

  const studentsById = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);

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
              RM {formatCentsGrouped(weeklyTotal)}
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
          <div className="hidden lg:block">
            <WeekColumns byDay={byDay} studentsById={studentsById} />
          </div>
          <div className="lg:hidden">
            <DayList byDay={byDay} studentsById={studentsById} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-3 text-[12px]" style={{ color: 'var(--ink-3)' }}>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 4, height: 12, borderRadius: 2, background: 'var(--ink-3)' }} /> Private
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 4, height: 12, borderRadius: 2, background: 'var(--accent)' }} /> Group
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 14, height: 10, borderRadius: 3, border: '1.5px dashed var(--line-2)' }} /> Free time
            </span>
            <span>
              · <span style={{ color: 'var(--good)' }}>green</span> = a 1-hour class that fits (30 min travel between different pools)
            </span>
          </div>
        </>
      )}
    </div>
  );
}

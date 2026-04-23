'use client';

import { useState, useMemo, useEffect } from 'react';
import type { DayOfWeek, Student } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useStudents, useBookings, useWallets } from '@/hooks/useCoachData';
import { Avatar, BalancePill } from '@/components/paper';
import { IconSearch } from '@/components/paper';

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
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Returns true when the viewport is below the `sm` breakpoint (640px).
// SSR-safe: defaults to `false` on the server; updates once mounted.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)');
    const handler = () => setIsMobile(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

type FilterValue = 'all' | 'owing' | 'no-booking' | DayOfWeek;

// ─── List row ────────────────────────────────────────────────────────────────

function StudentListRow({
  student,
  bookingCount,
  walletBalance,
  selected,
  onClick,
}: {
  student: Student;
  bookingCount: number;
  walletBalance: number | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 text-left"
      style={{
        padding: 10,
        borderRadius: 8,
        background: selected ? 'var(--line)' : 'transparent',
        color: 'var(--ink)',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <Avatar name={student.clientName} size={32} />
      <div className="flex-1 min-w-0">
        <div
          className="text-[13.5px] truncate"
          style={{ color: 'var(--ink)', fontWeight: 500 }}
        >
          {student.clientName}
        </div>
        <div
          className="text-[11.5px] truncate"
          style={{ color: 'var(--ink-3)' }}
        >
          {bookingCount > 0 ? `${bookingCount} weekly` : 'No recurring'}
        </div>
      </div>
      {walletBalance !== null && (
        <BalancePill balance={walletBalance} compact />
      )}
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StudentsPage() {
  const { coach } = useAuth();
  const { students, loading } = useStudents(coach?.id);
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const { wallets } = useWallets(coach?.id);
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Map day → student IDs with bookings that day (+ earliest start time for sorting).
  const { dayToStudents, activeDays } = useMemo(() => {
    const dayMap = new Map<
      DayOfWeek,
      Map<string, { startTime: string }>
    >();
    for (const b of bookings) {
      if (b.endDate) continue;
      for (const sid of b.studentIds) {
        if (!dayMap.has(b.dayOfWeek)) dayMap.set(b.dayOfWeek, new Map());
        const perDay = dayMap.get(b.dayOfWeek)!;
        const existing = perDay.get(sid);
        if (!existing || b.startTime < existing.startTime) {
          perDay.set(sid, { startTime: b.startTime });
        }
      }
    }
    const active = DAYS.filter((d) => dayMap.has(d));
    return { dayToStudents: dayMap, activeDays: active };
  }, [bookings]);

  const studentsWithBookings = useMemo(() => {
    const ids = new Set<string>();
    for (const b of bookings) {
      if (b.endDate) continue;
      for (const sid of b.studentIds) ids.add(sid);
    }
    return ids;
  }, [bookings]);

  const owingStudentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const w of wallets) {
      if (w.balance < 0) {
        for (const sid of w.studentIds) ids.add(sid);
      }
    }
    return ids;
  }, [wallets]);

  const bookingCountByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bookings) {
      if (b.endDate) continue;
      for (const sid of b.studentIds) m.set(sid, (m.get(sid) ?? 0) + 1);
    }
    return m;
  }, [bookings]);

  const walletByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of wallets) {
      for (const sid of w.studentIds) {
        // First wallet wins if a student is in multiple (unusual).
        if (!m.has(sid)) m.set(sid, w.balance);
      }
    }
    return m;
  }, [wallets]);

  const filtered = useMemo(() => {
    let result = students;

    if (filter === 'owing') {
      result = result.filter((s) => owingStudentIds.has(s.id));
    } else if (filter === 'no-booking') {
      result = result.filter((s) => !studentsWithBookings.has(s.id));
    } else if (filter !== 'all') {
      const dayStudents = dayToStudents.get(filter);
      result = dayStudents ? result.filter((s) => dayStudents.has(s.id)) : [];
      result = [...result].sort((a, b) => {
        const aT = dayStudents?.get(a.id)?.startTime ?? '';
        const bT = dayStudents?.get(b.id)?.startTime ?? '';
        return aT.localeCompare(bT);
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.clientName.toLowerCase().includes(q) ||
          s.clientPhone.toLowerCase().includes(q),
      );
    }

    // Name-sort only when not day-filtered (day-filter has its own sort above).
    if (filter === 'all' || filter === 'owing' || filter === 'no-booking') {
      result = [...result].sort((a, b) =>
        a.clientName.localeCompare(b.clientName),
      );
    }

    return result;
  }, [
    students,
    search,
    filter,
    dayToStudents,
    studentsWithBookings,
    owingStudentIds,
  ]);

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
      <div className="mb-5">
        <div
          className="text-[11px] font-semibold uppercase"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Students
        </div>
        <div
          className="text-[22px] sm:text-[28px] font-semibold leading-tight"
          style={{ letterSpacing: '-0.6px' }}
        >
          {students.length} on the roster
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        <div
          className="flex items-center gap-2 flex-1"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 12px',
            maxWidth: 340,
          }}
        >
          <IconSearch size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: 'var(--ink)' }}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
        <FilterChip active={filter === 'owing'} onClick={() => setFilter('owing')}>Owing</FilterChip>
        <FilterChip active={filter === 'no-booking'} onClick={() => setFilter('no-booking')}>No booking</FilterChip>
        {activeDays.map((d) => (
          <FilterChip
            key={d}
            active={filter === d}
            onClick={() => setFilter(d)}
          >
            {DAY_LABELS_SHORT[d]}
          </FilterChip>
        ))}
      </div>

      {/* Master-detail grid */}
      <div
        className="grid gap-4 sm:gap-5 items-start"
        style={{
          gridTemplateColumns: isMobile ? '1fr' : '360px minmax(0, 1fr)',
        }}
      >
        {/* List */}
        <div
          className="rounded-[12px] border"
          style={{
            background: 'var(--panel)',
            borderColor: 'var(--line)',
            padding: 4,
          }}
        >
          {filtered.length === 0 ? (
            <div
              className="text-center py-10"
              style={{ color: 'var(--ink-3)', fontSize: 13 }}
            >
              {students.length === 0 ? (
                <div className="space-y-1">
                  <div>No students yet.</div>
                  <div className="text-[12px]" style={{ color: 'var(--ink-4)' }}>
                    Students are created automatically when you add a booking
                    or mark a class done.
                  </div>
                </div>
              ) : (
                'No students found.'
              )}
            </div>
          ) : (
            filtered.map((s) => (
              <StudentListRow
                key={s.id}
                student={s}
                bookingCount={bookingCountByStudent.get(s.id) ?? 0}
                walletBalance={walletByStudent.get(s.id) ?? null}
                selected={selectedId === s.id}
                onClick={() => setSelectedId(s.id)}
              />
            ))
          )}
        </div>

        {/* Detail placeholder — filled in Task 2 */}
        {!isMobile && (
          <div
            className="rounded-[12px] border py-16 text-center"
            style={{
              background: 'var(--panel)',
              borderColor: 'var(--line)',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            Select a student
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Filter chip ─────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[12.5px] font-medium"
      style={{
        padding: '5px 12px',
        borderRadius: 999,
        border: 'none',
        background: active ? 'var(--ink)' : 'var(--line)',
        color: active ? 'var(--panel)' : 'var(--ink-3)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

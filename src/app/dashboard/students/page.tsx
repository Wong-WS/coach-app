'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Booking, DayOfWeek, LessonLog, Student, Wallet } from '@/types';
import { useAuth } from '@/lib/auth-context';
import {
  useStudents,
  useBookings,
  useWallets,
  useLessonLogs,
} from '@/hooks/useCoachData';
import { Avatar, BalancePill } from '@/components/paper';
import {
  IconSearch,
  IconPhone,
  IconEdit,
  IconSparkle,
  IconClose,
} from '@/components/paper';
import { formatDateMedium, parseDateString } from '@/lib/date-format';

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

// Matches the Schedule page helper. Follow-up: hoist to @/lib/time-format.
function fmtTimeShort(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'p' : 'a';
  const h12 = hh % 12 || 12;
  if (mm === 0) return `${h12}${period}`;
  return `${h12}:${String(mm).padStart(2, '0')}${period}`;
}

type FilterValue = 'all' | 'owing' | 'no-booking' | DayOfWeek;

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
      aria-pressed={active}
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

// ─── MiniStat ────────────────────────────────────────────────────────────────

function MiniStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'bad';
}) {
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: 10,
      }}
    >
      <div
        className="text-[10.5px] font-semibold uppercase"
        style={{ color: 'var(--ink-3)', letterSpacing: '0.05em' }}
      >
        {label}
      </div>
      <div
        className="mono tnum"
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: tone === 'bad' ? 'var(--bad)' : 'var(--ink)',
          letterSpacing: '-0.4px',
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-[11px]"
          style={{ color: 'var(--ink-3)', marginTop: 2 }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

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

// ─── Student detail ──────────────────────────────────────────────────────────

function StudentDetail({
  student,
  wallet,
  studentBookings,
  studentLogs,
  logsLoading,
  logLimit,
  onEdit,
  onDeleteLog,
  onDeleteStudent,
  onLoadMore,
}: {
  student: Student;
  wallet: Wallet | null;
  studentBookings: Booking[];
  studentLogs: LessonLog[];
  logsLoading: boolean;
  logLimit: number;
  onEdit: () => void;
  onDeleteLog: (logId: string) => void;
  onDeleteStudent: () => void;
  onLoadMore: () => void;
}) {
  const sortedBookings = useMemo(() => {
    return [...studentBookings].sort(
      (a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek),
    );
  }, [studentBookings]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-3.5 mb-5">
        <Avatar name={student.clientName} size={56} />
        <div className="flex-1 min-w-0">
          <div
            className="text-[20px]"
            style={{ fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--ink)' }}
          >
            {student.clientName}
          </div>
          <div
            className="flex items-center gap-2.5 mt-0.5"
            style={{ color: 'var(--ink-3)', fontSize: 13 }}
          >
            <span className="flex items-center gap-1">
              <IconPhone size={12} />
              {student.clientPhone || '—'}
            </span>
            <span className="mono text-[11px]">
              joined {formatDateMedium(student.createdAt)}
            </span>
          </div>
        </div>
        <button
          onClick={onEdit}
          aria-label="Edit student"
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
          }}
        >
          <IconEdit size={13} />
        </button>
      </div>

      {/* MiniStat row */}
      <div
        className="grid gap-2.5 mb-5"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
      >
        <MiniStat
          label="Wallet"
          value={
            wallet
              ? `${wallet.balance < 0 ? '−' : ''}RM ${Math.abs(wallet.balance).toFixed(0)}`
              : '—'
          }
          tone={wallet && wallet.balance < 0 ? 'bad' : undefined}
        />
        <MiniStat label="Weekly" value={studentBookings.length} />
        <MiniStat
          label="All-time"
          value={studentLogs.length}
          sub="lessons done"
        />
      </div>

      {/* Notes */}
      {student.notes?.trim() && (
        <div
          className="flex items-start gap-2.5 mb-5"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: 14,
          }}
        >
          <IconSparkle size={14} />
          <div
            className="text-[13px]"
            style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}
          >
            {student.notes}
          </div>
        </div>
      )}

      {/* Weekly schedule */}
      <div className="mb-5">
        <div
          className="text-[11px] font-semibold uppercase mb-2.5"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Weekly schedule
        </div>
        {sortedBookings.length === 0 ? (
          <div
            className="text-[12.5px] italic py-1"
            style={{ color: 'var(--ink-4)' }}
          >
            No recurring bookings.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedBookings.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2.5"
                style={{
                  padding: 10,
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                }}
              >
                <div
                  className="text-[11px] font-semibold uppercase"
                  style={{
                    color: 'var(--ink-3)',
                    letterSpacing: '0.06em',
                    width: 36,
                  }}
                >
                  {DAY_LABELS_SHORT[b.dayOfWeek]}
                </div>
                <div
                  className="mono tnum text-[12.5px]"
                  style={{ color: 'var(--ink)', fontWeight: 500, width: 90 }}
                >
                  {fmtTimeShort(b.startTime)}–{fmtTimeShort(b.endTime)}
                </div>
                <div
                  className="flex-1 text-[12.5px] truncate"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {b.locationName}
                </div>
                <div
                  className="mono tnum text-[12.5px]"
                  style={{ color: 'var(--ink)' }}
                >
                  RM {b.studentPrices[student.id] ?? 0}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent lessons */}
      <div>
        <div
          className="text-[11px] font-semibold uppercase mb-2.5"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Recent lessons
        </div>
        {logsLoading ? (
          <div className="flex justify-center py-4">
            <div
              className="animate-spin rounded-full h-5 w-5 border-b-2"
              style={{ borderColor: 'var(--accent)' }}
            />
          </div>
        ) : studentLogs.length === 0 ? (
          <div
            className="text-[12.5px] italic"
            style={{ color: 'var(--ink-4)' }}
          >
            Nothing yet.
          </div>
        ) : (
          <div className="flex flex-col">
            {studentLogs.map((log, i) => (
              <div
                key={log.id}
                className="flex items-center gap-2.5"
                style={{
                  padding: '10px 0',
                  borderBottom:
                    i === studentLogs.length - 1
                      ? 'none'
                      : '1px solid var(--line)',
                }}
              >
                <span
                  className="mono tnum text-[11.5px]"
                  style={{ color: 'var(--ink-3)', width: 84 }}
                >
                  {formatDateMedium(parseDateString(log.date))}
                </span>
                <span
                  className="mono tnum text-[11.5px]"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {fmtTimeShort(log.startTime)}
                </span>
                <span
                  className="flex-1 text-[12.5px] truncate"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {log.locationName}
                </span>
                <span
                  className="mono tnum text-[12.5px]"
                  style={{ color: 'var(--ink)' }}
                >
                  RM {log.price}
                </span>
                <button
                  onClick={() => onDeleteLog(log.id)}
                  aria-label="Delete lesson"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-3)',
                    cursor: 'pointer',
                    padding: 2,
                  }}
                >
                  <IconClose size={11} />
                </button>
              </div>
            ))}
            {studentLogs.length >= logLimit && (
              <button
                onClick={onLoadMore}
                className="text-[12.5px] py-2"
                style={{
                  color: 'var(--accent-ink)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Danger footer */}
      <div
        className="flex justify-end"
        style={{
          borderTop: '1px solid var(--line)',
          paddingTop: 16,
          marginTop: 20,
        }}
      >
        <button
          onClick={onDeleteStudent}
          className="text-[12.5px]"
          style={{
            color: 'var(--bad)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Delete student
        </button>
      </div>
    </div>
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
  const [logLimit, setLogLimit] = useState(20);

  const { lessonLogs: studentLogs, loading: logsLoading } = useLessonLogs(
    selectedId ? coach?.id : undefined,
    undefined,
    selectedId ?? undefined,
    undefined,
    logLimit,
  );

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

  // Auto-select the first filtered student on desktop so the detail pane is
  // never empty when data exists. Also reselect if the current selection
  // drops out of the filter.
  useEffect(() => {
    if (isMobile) return;
    if (filtered.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing selection when the filtered list becomes empty
      setSelectedId(null);
      setLogLimit(20);
      return;
    }
    if (!selectedId || !filtered.some((s) => s.id === selectedId)) {
      setSelectedId(filtered[0].id);
      setLogLimit(20);
    }
  }, [isMobile, filtered, selectedId]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedId) ?? null,
    [students, selectedId],
  );

  const selectedWallet = useMemo(
    () =>
      selectedStudent
        ? wallets.find((w) => w.studentIds.includes(selectedStudent.id)) ?? null
        : null,
    [wallets, selectedStudent],
  );

  const selectedBookings = useMemo(
    () =>
      selectedStudent
        ? bookings.filter(
            (b) =>
              b.status === 'confirmed' &&
              !b.endDate &&
              b.studentIds.includes(selectedStudent.id),
          )
        : [],
    [bookings, selectedStudent],
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
            type="search"
            aria-label="Search students"
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
                onClick={() => {
                  setSelectedId(s.id);
                  setLogLimit(20);
                }}
              />
            ))
          )}
        </div>

        {/* Detail (desktop) */}
        {!isMobile && (
          <div
            className="rounded-[12px] border"
            style={{
              background: 'var(--panel)',
              borderColor: 'var(--line)',
              padding: 20,
            }}
          >
            {selectedStudent ? (
              <StudentDetail
                student={selectedStudent}
                wallet={selectedWallet}
                studentBookings={selectedBookings}
                studentLogs={studentLogs}
                logsLoading={logsLoading}
                logLimit={logLimit}
                onEdit={() => {
                  /* wired in Task 3 */
                }}
                onDeleteLog={() => {
                  /* wired in Task 3 */
                }}
                onDeleteStudent={() => {
                  /* wired in Task 3 */
                }}
                onLoadMore={() => setLogLimit(logLimit + 20)}
              />
            ) : (
              <div
                className="py-16 text-center"
                style={{ color: 'var(--ink-3)', fontSize: 13 }}
              >
                Select a student
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


# Students Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `src/app/dashboard/students/page.tsx` from the legacy Tailwind look into the Paper & Ink design system, matching the mock at `/Users/wongweisiang/Downloads/coach-redesign/project/src/page-students.jsx`.

**Architecture:** Single-file rewrite. Desktop renders a two-column master-detail layout (360px list + flex detail pane). Mobile renders the list full-width; tapping a row opens a `PaperModal` containing the same detail content. Selection state is shared; a `useIsMobile` hook drives which surface renders it. All existing data hooks and Firestore writes are preserved unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Tailwind CSS 4, `@/components/paper` primitives (`Avatar`, `BalancePill`, `PaperModal`, `Chip`, icons), Paper & Ink CSS vars.

**Spec:** `docs/superpowers/specs/2026-04-23-students-page-redesign-design.md`

**Mock reference:** `/Users/wongweisiang/Downloads/coach-redesign/project/src/page-students.jsx`

**Testing strategy:** No unit tests for dashboard pages exist or are added. Verification is manual via `npm run dev` during implementation; final sign-off happens on the live Vercel URL after Task 3 pushes.

---

## File Structure

Only one file is modified across all tasks:

- `src/app/dashboard/students/page.tsx` (full rewrite)

Internal layout of the rewritten file (in order of declaration):

1. `'use client'` directive and imports.
2. Constants: `DAYS`, `DAY_LABELS_SHORT`.
3. Helpers: `fmtTimeShort`, `useIsMobile`.
4. `StudentListRow` component.
5. `MiniStat` component.
6. `StudentDetail` component.
7. `EditDetailsModal`, `DeleteLessonModal`, `DeleteStudentModal` components.
8. `StudentsPage` default export.

---

## Task 1: Scaffold — header, toolbar, list, filtering

**Files:**
- Modify (full rewrite): `src/app/dashboard/students/page.tsx`

**Goal:** Replace the current file with the Paper & Ink shell — header, toolbar (search + filter chips), list with `StudentListRow`, all filter/search/memo logic, empty states. Selection state is wired but the detail pane is a placeholder ("Select a student"). No modals yet. No detail content yet.

- [ ] **Step 1: Read the current file once**

Run: Open `src/app/dashboard/students/page.tsx` to confirm the starting state before overwriting.

- [ ] **Step 2: Replace the entire contents of `src/app/dashboard/students/page.tsx` with the scaffold below**

```tsx
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

// Matches the Schedule page helper. Follow-up: hoist to @/lib/time-format.
function fmtTimeShort(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'p' : 'a';
  const h12 = hh % 12 || 12;
  if (mm === 0) return `${h12}${period}`;
  return `${h12}:${String(mm).padStart(2, '0')}${period}`;
}

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
        <FilterChip value="all" active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
        <FilterChip value="owing" active={filter === 'owing'} onClick={() => setFilter('owing')}>Owing</FilterChip>
        <FilterChip value="no-booking" active={filter === 'no-booking'} onClick={() => setFilter('no-booking')}>No booking</FilterChip>
        {activeDays.map((d) => (
          <FilterChip
            key={d}
            value={d}
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
  value: FilterValue;
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean, no new warnings from this file.

- [ ] **Step 5: Smoke-test in dev**

Run: `npm run dev` and visit `http://localhost:3000/dashboard/students` while signed in as test coach.
Expected:
- Header: `STUDENTS` eyebrow + `<N> on the roster` title.
- Toolbar: search input with magnifier icon.
- Chip row: `All` `Owing` `No booking` followed by only the days that have recurring bookings.
- Left card: list of students sorted alphabetically, each row showing avatar + name + "N weekly" or "No recurring" + BalancePill when wallet exists.
- Right card (desktop ≥ 640px): placeholder "Select a student".
- Mobile (< 640px): list only, no placeholder.
- Click a row: background turns `var(--line)` (selected state) but detail stays as placeholder (Task 2 wires the detail).
- Empty states render when filters/search yield nothing and when the coach has zero students.
- Dark mode: all colours render via Paper & Ink vars.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/students/page.tsx
git commit -m "$(cat <<'EOF'
students: scaffold Paper & Ink rewrite — header, toolbar, list

Replace the legacy students page with a Paper & Ink shell: search +
filter chips (All, Owing, No booking, active days), StudentListRow
with Avatar + BalancePill, master-detail grid with a detail
placeholder. Modals and the detail pane are added in the next tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Detail pane — MiniStat, StudentDetail, auto-select

**Files:**
- Modify: `src/app/dashboard/students/page.tsx`

**Goal:** Render the detail content (header, three MiniStats, notes card, weekly schedule, recent lessons, danger footer) in the desktop right pane when a student is selected. Add an auto-select effect that picks the first filtered student on desktop. Detail is visually complete but all action buttons are no-ops; modals are wired in Task 3.

- [ ] **Step 1: Extend imports**

Update the imports block at the top of the file.

Replace:

```tsx
import { useState, useMemo, useEffect } from 'react';
import type { DayOfWeek, Student } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useStudents, useBookings, useWallets } from '@/hooks/useCoachData';
import { Avatar, BalancePill } from '@/components/paper';
import { IconSearch } from '@/components/paper';
```

with:

```tsx
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
```

- [ ] **Step 2: Add `MiniStat` component**

Insert just above `StudentListRow`:

```tsx
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
```

- [ ] **Step 3: Add `StudentDetail` component**

Insert just above the `StudentsPage` function (below `MiniStat`, `StudentListRow`):

```tsx
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
              className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent"
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
```

- [ ] **Step 3.5: Confirm `IconSparkle` exists in `@/components/paper/Icons.tsx`**

Run: `grep "IconSparkle" src/components/paper/Icons.tsx`
Expected: a line defining `export const IconSparkle = …`. If missing, stop and surface — this is the "notes" indicator icon and the plan assumes it is present. (Task 2 cannot proceed without it.)

- [ ] **Step 4: Add log-limit + lesson-log subscription to `StudentsPage`**

In `StudentsPage`, just after the existing `const [selectedId, setSelectedId] = useState<string | null>(null);` line, add:

```tsx
  const [logLimit, setLogLimit] = useState(20);

  const { lessonLogs: studentLogs, loading: logsLoading } = useLessonLogs(
    selectedId ? coach?.id : undefined,
    undefined,
    selectedId ?? undefined,
    undefined,
    logLimit,
  );
```

- [ ] **Step 5: Add the auto-select effect and derived-data memos**

In `StudentsPage`, just after the existing `filtered` memo, add:

```tsx
  // Auto-select the first filtered student on desktop so the detail pane is
  // never empty when data exists. Also reselect if the current selection
  // drops out of the filter.
  useEffect(() => {
    if (isMobile) return;
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((s) => s.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [isMobile, filtered, selectedId]);

  // Reset the log-limit whenever the selected student changes.
  useEffect(() => {
    setLogLimit(20);
  }, [selectedId]);

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
```

- [ ] **Step 6: Replace the detail placeholder with `<StudentDetail>`**

In `StudentsPage`, replace:

```tsx
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
```

with:

```tsx
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
```

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. No errors, no new warnings from this file.

- [ ] **Step 8: Smoke-test in dev**

Visit `http://localhost:3000/dashboard/students`.
Expected:
- On desktop (≥ 640px), the first filtered student is automatically selected and the right pane shows the complete detail (header with avatar + name + phone + joined date, Edit icon, three MiniStat cards, notes card if present, weekly schedule rows sorted Mon→Sun, recent lessons list).
- Clicking another row swaps detail content without remounting the whole page.
- Filtering so no students match: detail pane shows "Select a student".
- Changing the filter reselects the first visible student.
- Mobile (< 640px): right pane is hidden entirely; tapping a row highlights it but nothing else happens (Task 3 wires the modal).
- Edit icon, Delete icon on lesson rows, Delete student link are visible but click does nothing yet.
- Dark mode renders correctly.

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/students/page.tsx
git commit -m "$(cat <<'EOF'
students: desktop detail pane with MiniStats + schedule + logs

Add StudentDetail + MiniStat and wire them into the desktop right
pane. Auto-select the first filtered student so the pane is never
empty when data exists; reselect when the current selection drops
out of the filter.

Action buttons (edit, delete lesson, delete student) are rendered
but are no-ops until Task 3 wires the modals.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Modals + mobile modal + push

**Files:**
- Modify: `src/app/dashboard/students/page.tsx`

**Goal:** Add the three action modals (Edit details, Delete lesson, Delete student) and the mobile `PaperModal` that renders the same `StudentDetail`. Wire all Firestore writes (reusing the logic from the legacy page). Push to Vercel and sign off on the live URL.

- [ ] **Step 1: Extend imports for Firestore + modal + toast**

Replace the entire imports block at the top of the file with:

```tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  collection,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  increment,
  query,
  where,
  getDocs,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Booking, DayOfWeek, LessonLog, Student, Wallet } from '@/types';
import { useAuth } from '@/lib/auth-context';
import {
  useStudents,
  useBookings,
  useWallets,
  useLessonLogs,
} from '@/hooks/useCoachData';
import { Avatar, BalancePill, PaperModal } from '@/components/paper';
import {
  IconSearch,
  IconPhone,
  IconEdit,
  IconSparkle,
  IconClose,
} from '@/components/paper';
import { Button, Input, PhoneInput } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { formatDateMedium, parseDateString } from '@/lib/date-format';
```

- [ ] **Step 2: Add `EditDetailsModal` component**

Insert just above `StudentsPage`:

```tsx
// ─── Modals ──────────────────────────────────────────────────────────────────

function EditDetailsModal({
  open,
  student,
  coachId,
  onClose,
}: {
  open: boolean;
  student: Student | null;
  coachId: string | undefined;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (student) {
      setName(student.clientName);
      setPhone(student.clientPhone);
      setNotes(student.notes);
    }
  }, [student]);

  const handleSave = async () => {
    if (!coachId || !db || !student) return;
    setSaving(true);
    try {
      await updateDoc(
        doc(db as Firestore, 'coaches', coachId, 'students', student.id),
        {
          clientName: name.trim(),
          clientPhone: phone.trim(),
          notes: notes.trim(),
          updatedAt: serverTimestamp(),
        },
      );
      showToast('Student updated!', 'success');
      onClose();
    } catch (error) {
      console.error('Error updating student:', error);
      showToast('Failed to update student', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PaperModal open={open} onClose={onClose} title="Edit student">
      <div className="space-y-4">
        <Input
          id="editName"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <PhoneInput
          id="editPhone"
          label="Phone"
          value={phone}
          onChange={(v) => setPhone(v)}
        />
        <div>
          <label
            htmlFor="editNotes"
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--ink-2)' }}
          >
            Notes
          </label>
          <textarea
            id="editNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="block w-full px-3 py-2 rounded-lg outline-none text-[14px]"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
            }}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </PaperModal>
  );
}
```

- [ ] **Step 3: Add `DeleteLessonModal` component**

Insert just below `EditDetailsModal`:

```tsx
function DeleteLessonModal({
  open,
  logId,
  coachId,
  wallets,
  onClose,
}: {
  open: boolean;
  logId: string | null;
  coachId: string | undefined;
  wallets: Wallet[];
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!coachId || !db || !logId) return;
    setDeleting(true);
    try {
      const firestore = db as Firestore;

      // Reverse any wallet transaction tied to this lesson.
      for (const walletDoc of wallets) {
        const txnQuery = query(
          collection(
            firestore,
            'coaches',
            coachId,
            'wallets',
            walletDoc.id,
            'transactions',
          ),
          where('lessonLogId', '==', logId),
        );
        const txnSnap = await getDocs(txnQuery);
        if (!txnSnap.empty) {
          const originalTxn = txnSnap.docs[0].data();
          const refundAmount = Math.abs(originalTxn.amount);
          const newBalance = walletDoc.balance + refundAmount;
          const now = new Date();
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          await addDoc(
            collection(
              firestore,
              'coaches',
              coachId,
              'wallets',
              walletDoc.id,
              'transactions',
            ),
            {
              type: 'refund',
              amount: refundAmount,
              balanceAfter: newBalance,
              description: `Reversed: ${originalTxn.description}`,
              studentId: originalTxn.studentId,
              date: dateStr,
              createdAt: serverTimestamp(),
            },
          );
          await updateDoc(
            doc(firestore, 'coaches', coachId, 'wallets', walletDoc.id),
            {
              balance: increment(refundAmount),
              updatedAt: serverTimestamp(),
            },
          );
          break;
        }
      }

      await deleteDoc(
        doc(firestore, 'coaches', coachId, 'lessonLogs', logId),
      );
      showToast('Lesson deleted', 'success');
      onClose();
    } catch (error) {
      console.error('Error deleting lesson:', error);
      showToast('Failed to delete lesson', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PaperModal open={open} onClose={onClose} title="Delete lesson">
      <div
        className="text-sm mb-4"
        style={{ color: 'var(--ink-2)' }}
      >
        Are you sure? This will delete the lesson log and refund the wallet
        charge if applicable.
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} loading={deleting}>
          Delete
        </Button>
      </div>
    </PaperModal>
  );
}
```

- [ ] **Step 4: Add `DeleteStudentModal` component**

Insert just below `DeleteLessonModal`:

```tsx
function DeleteStudentModal({
  open,
  student,
  coachId,
  activeBookings,
  onClose,
  onDeleted,
}: {
  open: boolean;
  student: Student | null;
  coachId: string | undefined;
  activeBookings: Booking[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!coachId || !db || !student) return;
    setDeleting(true);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      batch.delete(
        doc(firestore, 'coaches', coachId, 'students', student.id),
      );

      for (const booking of activeBookings) {
        batch.update(
          doc(firestore, 'coaches', coachId, 'bookings', booking.id),
          {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
          },
        );
      }

      await batch.commit();

      const msg =
        activeBookings.length > 0
          ? `Student deleted and ${activeBookings.length} booking${activeBookings.length > 1 ? 's' : ''} cancelled`
          : 'Student deleted';
      showToast(msg, 'success');
      onDeleted();
      onClose();
    } catch (error) {
      console.error('Error deleting student:', error);
      showToast('Failed to delete student', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PaperModal open={open} onClose={onClose} title="Delete student">
      <div
        className="text-sm mb-4"
        style={{ color: 'var(--ink-2)' }}
      >
        Delete <strong>{student?.clientName}</strong>? This removes the student
        record. Lesson history will be lost.
        {activeBookings.length > 0 && (
          <>
            {' '}Their {activeBookings.length} active booking
            {activeBookings.length > 1 ? 's' : ''} will also be cancelled.
          </>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete} loading={deleting}>
          Delete
        </Button>
      </div>
    </PaperModal>
  );
}
```

- [ ] **Step 5: Add modal state + handlers to `StudentsPage`**

In `StudentsPage`, just after the existing `const [logLimit, setLogLimit] = useState(20);` line, add:

```tsx
  const [editOpen, setEditOpen] = useState(false);
  const [deleteLogId, setDeleteLogId] = useState<string | null>(null);
  const [deleteStudentOpen, setDeleteStudentOpen] = useState(false);
```

- [ ] **Step 6: Wire the detail action callbacks and render modals**

In `StudentsPage`, replace the desktop detail block from Task 2 (the `{!isMobile && (…)` block containing `<StudentDetail … />`) with this version where the three `/* wired in Task 3 */` no-ops now call state setters, and add the mobile modal + three action modals after the master-detail grid.

Replace:

```tsx
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
```

with:

```tsx
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
                onEdit={() => setEditOpen(true)}
                onDeleteLog={(id) => setDeleteLogId(id)}
                onDeleteStudent={() => setDeleteStudentOpen(true)}
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

      {/* Mobile detail modal */}
      <PaperModal
        open={isMobile && selectedStudent !== null}
        onClose={() => setSelectedId(null)}
        title={selectedStudent?.clientName}
        width={520}
      >
        {selectedStudent && (
          <StudentDetail
            student={selectedStudent}
            wallet={selectedWallet}
            studentBookings={selectedBookings}
            studentLogs={studentLogs}
            logsLoading={logsLoading}
            logLimit={logLimit}
            onEdit={() => setEditOpen(true)}
            onDeleteLog={(id) => setDeleteLogId(id)}
            onDeleteStudent={() => setDeleteStudentOpen(true)}
            onLoadMore={() => setLogLimit(logLimit + 20)}
          />
        )}
      </PaperModal>

      {/* Action modals */}
      <EditDetailsModal
        open={editOpen}
        student={selectedStudent}
        coachId={coach?.id}
        onClose={() => setEditOpen(false)}
      />
      <DeleteLessonModal
        open={deleteLogId !== null}
        logId={deleteLogId}
        coachId={coach?.id}
        wallets={wallets}
        onClose={() => setDeleteLogId(null)}
      />
      <DeleteStudentModal
        open={deleteStudentOpen}
        student={selectedStudent}
        coachId={coach?.id}
        activeBookings={selectedBookings}
        onClose={() => setDeleteStudentOpen(false)}
        onDeleted={() => {
          setDeleteStudentOpen(false);
          setSelectedId(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean, no errors, no new warnings from this file.

- [ ] **Step 8: Smoke-test in dev across breakpoints**

Visit `http://localhost:3000/dashboard/students`.

Desktop (≥ 640px):
- Click Edit icon → `Edit student` modal opens, fields are pre-filled. Save → toast "Student updated!", modal closes, list reflects new name if changed.
- Click ✕ on a lesson row → `Delete lesson` modal. Confirm → toast "Lesson deleted", lesson disappears from the list, wallet balance in the Wallet MiniStat increases by the refunded amount (check via the Payments page wallet if needed).
- Click "Delete student" at the bottom → modal with cascade warning showing active booking count. Confirm → toast, student disappears, selection resets.

Mobile (< 640px, DevTools device toolbar):
- Tap a list row → `PaperModal` opens titled with the student name, showing the same detail content.
- Close modal → returns to list, selection clears.
- Edit / delete lesson / delete student all work the same from inside the mobile modal.

Edge cases:
- Filter to "Owing" when no wallets have negative balance: empty list state "No students found.".
- Search for a nonsense string: "No students found.".
- Dark-mode toggle: every surface readable.

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/students/page.tsx
git commit -m "$(cat <<'EOF'
students: wire edit/delete modals + mobile detail modal

Add EditDetailsModal, DeleteLessonModal, DeleteStudentModal, and
mount them from the detail pane. Below sm, the detail pane renders
inside a PaperModal instead of the right column. All Firestore
writes (edit, lesson-delete with wallet refund, student-delete with
booking cascade) match the legacy page.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Push and verify on Vercel**

Run:

```bash
git push
```

Wait ~1–2 minutes for Vercel. Then visit:

- `https://coach-app-ashen-delta.vercel.app/dashboard/students` (test-coach login: testcoach@example.com / Test123!)

Run the Step 8 checks once more on the live URL. If anything is off, open a follow-up — do not patch inside this plan after push.

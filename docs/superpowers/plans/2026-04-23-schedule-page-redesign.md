# Schedule Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `src/app/dashboard/bookings/page.tsx` (read-only recurring weekly schedule) from the legacy Tailwind look into the Paper & Ink design system, matching the mock at `/Users/wongweisiang/Downloads/coach-redesign/project/src/page-schedule.jsx` and the style already used on Overview and Payments.

**Architecture:** Single-file rewrite. Desktop renders a 7-column × N-hour absolute-positioned grid. Mobile renders a stacked day-by-day card list. Both views are rendered and toggled with Tailwind responsive classes (`hidden sm:block` / `sm:hidden`). Grid hours are computed adaptively from actual bookings with an 8am–9pm floor.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Tailwind CSS 4, `@/components/paper` primitives (`Chip`), Paper & Ink CSS vars (`--ink`, `--panel`, `--line`, `--line-2`, `--accent`, `--accent-soft`, `--accent-ink`, `--ink-2`, `--ink-3`, `--ink-4`).

**Spec:** `docs/superpowers/specs/2026-04-23-schedule-page-redesign-design.md`

**Mock reference:** `/Users/wongweisiang/Downloads/coach-redesign/project/src/page-schedule.jsx`

**Testing strategy:** This project has no unit tests for dashboard pages and the spec explicitly opts out of adding any. Verification is manual — run `npm run dev`, navigate to `/dashboard/bookings`, and confirm the visual behaviour described in each task. After everything is pushed, final sign-off happens on the live Vercel URL.

---

## File Structure

Only one file is modified across all tasks:

- `src/app/dashboard/bookings/page.tsx` (rewrite)

Internal layout of the rewritten file (in order of declaration):

1. `'use client'` directive and imports.
2. Constants: `DAYS`, `DAY_LABELS_SHORT`, `DAY_LABELS_FULL`, `HOUR_PX`.
3. Helpers: `fmtTimeShort`, `computeGridHours`, `perBookingTotal`.
4. `RecurringCard` — a single row used by the mobile list.
5. `DayList` — mobile layout component (renders all 7 days of `RecurringCard`s).
6. `WeeklyGrid` — desktop grid component.
7. `BookingsPage` — default export. Loads data, memoizes derived state, renders header + loading/empty states + `WeeklyGrid` (desktop) + `DayList` (mobile) + legend.

---

## Task 1: Scaffold the new page — header, data loading, helpers, empty/loading states

**Files:**
- Modify (full rewrite): `src/app/dashboard/bookings/page.tsx`

**Goal of this task:** Replace the current file with the Paper & Ink shell — imports, data hooks, constants, helpers, and the top-level `BookingsPage` component with header, loading spinner, and empty state. Desktop grid and mobile list are stubbed out as empty placeholders and filled in by later tasks.

- [ ] **Step 1: Replace the entire contents of `src/app/dashboard/bookings/page.tsx` with the scaffold below**

```tsx
'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useBookings } from '@/hooks/useCoachData';
import { Chip } from '@/components/paper';
import type { Booking } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Weekly RM for one booking (sum over studentPrices for linked students).
function perBookingTotal(b: Booking): number {
  return b.studentIds.reduce(
    (sum, sid) => sum + (b.studentPrices[sid] ?? 0),
    0,
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
    () => confirmedBookings.reduce((s, b) => s + perBookingTotal(b), 0),
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
            {totalSlots === 1 ? 'slot' : 'slots'} ·{' '}
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
```

- [ ] **Step 2: Type-check the file**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean — no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean — no new warnings or errors introduced by this file.

- [ ] **Step 4: Smoke-test in dev**

Run: `npm run dev` (leave running; open in a separate terminal tab or background)
Visit `http://localhost:3000/dashboard/bookings` while signed in as the test coach.
Expected:
- Header shows `SCHEDULE` eyebrow, "Recurring weekly" title, `<N> slots · RM <total>/week` subtitle.
- Top-right on desktop: a "Read-only" chip and hint text.
- If the coach has no recurring bookings: the empty-state card appears.
- Page renders in both light and dark mode (toggle via the dashboard theme switcher).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/bookings/page.tsx
git commit -m "$(cat <<'EOF'
schedule: scaffold Paper & Ink rewrite — header + states

Replace the legacy schedule page with a Paper & Ink shell: data
hooks, perBookingTotal helper, header with read-only chip, loading
spinner, and empty state. Grid and list bodies are filled in by the
next two tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Desktop weekly grid + legend

**Files:**
- Modify: `src/app/dashboard/bookings/page.tsx`

**Goal:** Add the `WeeklyGrid` component, the constants and helpers it needs, the `byDay` + `hours` memoizations in `BookingsPage`, and the legend. Replaces the `<div className="hidden sm:block" />` placeholder.

- [ ] **Step 1: Extend imports and add `DAYS`, `DAY_LABELS_SHORT`, `HOUR_PX`, `fmtTimeShort`, `computeGridHours`**

Update the types import that reads:

```tsx
import type { Booking } from '@/types';
```

to:

```tsx
import type { Booking, DayOfWeek } from '@/types';
```

Just after the imports, add the constants block:

```tsx
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
```

Just after the existing `perBookingTotal` helper, add:

```tsx
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
```

- [ ] **Step 2: Add `byDay` and `hours` memoizations to `BookingsPage`**

In `BookingsPage`, just after the `weeklyTotal` memo, add:

```tsx
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
```

- [ ] **Step 3: Add the `WeeklyGrid` component definition**

Insert it just above the `BookingsPage` function:

```tsx
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
```

- [ ] **Step 4: Replace the desktop placeholder with `<WeeklyGrid>` and add the legend**

In `BookingsPage`, replace:

```tsx
          {/* Desktop grid — added in Task 2 */}
          <div className="hidden sm:block" />
```

with:

```tsx
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
```

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: no errors, no new warnings from this file.

- [ ] **Step 6: Smoke-test in dev**

Visit `/dashboard/bookings` on desktop (`sm:` breakpoint and wider).
Expected:
- 7 day columns with headers showing `MON · 2 classes` etc.
- Hour labels in the 52px gutter (`8a`, `9a`, …, `12p`, `1p`, …).
- Private classes: neutral background, grey left edge.
- Group classes: subtle blue/accent background, accent left edge.
- Each block shows class name, time range, and location first-word (plus `· <n>` for groups) when tall enough.
- Legend visible below the grid.
- Verify adaptive hours: if the coach has a recurring class starting at 7:00am, the grid starts at `7a`. If you don't have one handy, temporarily add one in Firestore or via Overview to verify, then remove. (If the test coach already has one, just confirm behaviour.)
- Dark mode still looks correct.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/bookings/page.tsx
git commit -m "$(cat <<'EOF'
schedule: desktop weekly grid with adaptive hours + legend

Add WeeklyGrid with a 52px hour gutter, 7 day columns, and absolute-
positioned booking blocks. Private vs group classes use different
background/border colours. Grid hours floor at 8am–9pm and expand
to fit any booking that starts earlier or ends later.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mobile day list + final QA and push

**Files:**
- Modify: `src/app/dashboard/bookings/page.tsx`

**Goal:** Replace the mobile placeholder with `DayList` / `RecurringCard`, verify everything end-to-end, push, and sign off on the live Vercel URL.

- [ ] **Step 1: Extend imports and add `DAY_LABELS_FULL`**

Update the import line that reads:

```tsx
import { useBookings } from '@/hooks/useCoachData';
```

to:

```tsx
import { useBookings, useStudents } from '@/hooks/useCoachData';
```

Update the types import that reads:

```tsx
import type { Booking, DayOfWeek } from '@/types';
```

to:

```tsx
import type { Booking, DayOfWeek, Student } from '@/types';
```

Just after `DAY_LABELS_SHORT`, add:

```tsx
const DAY_LABELS_FULL: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};
```

- [ ] **Step 2: Add `useStudents` call and `studentsById` memo to `BookingsPage`**

Just after the existing `useBookings` call in `BookingsPage`:

```tsx
  const { bookings, loading } = useBookings(coach?.id);
```

add:

```tsx
  const { students } = useStudents(coach?.id);
```

Then, just after the `hours` memo, add:

```tsx
  const studentsById = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);
```

- [ ] **Step 3: Add `RecurringCard` and `DayList` components**

Insert these components just above `WeeklyGrid`:

```tsx
// ─── Mobile list ─────────────────────────────────────────────────────────────

function RecurringCard({
  b,
  studentsById,
}: {
  b: Booking;
  studentsById: Map<string, Student>;
}) {
  const isGroup = b.studentIds.length > 1;
  const total = perBookingTotal(b);
  const firstNames = b.studentIds
    .map((sid) => studentsById.get(sid)?.clientName.split(' ')[0])
    .filter((n): n is string => Boolean(n))
    .join(', ');
  return (
    <div
      className="flex items-center gap-2.5 p-2.5 rounded-[10px]"
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderLeft: `3px solid ${isGroup ? 'var(--accent)' : 'var(--ink-3)'}`,
      }}
    >
      <div
        className="mono tnum text-[12.5px] font-semibold"
        style={{ color: 'var(--ink)', width: 64 }}
      >
        {fmtTimeShort(b.startTime)}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[13px] truncate"
          style={{ color: 'var(--ink)', fontWeight: 500 }}
        >
          {b.className}
          {isGroup && (
            <span style={{ color: 'var(--accent-ink)' }}>
              {' '}
              · {b.studentIds.length}
            </span>
          )}
        </div>
        <div
          className="text-[11.5px] truncate"
          style={{ color: 'var(--ink-3)' }}
        >
          {b.locationName}
          {firstNames ? ` · ${firstNames}` : ''}
        </div>
      </div>
      <div
        className="mono tnum text-[12.5px] shrink-0"
        style={{ color: 'var(--ink-2)', fontWeight: 500 }}
      >
        RM {total}
      </div>
    </div>
  );
}

function DayList({
  byDay,
  studentsById,
}: {
  byDay: Record<DayOfWeek, Booking[]>;
  studentsById: Map<string, Student>;
}) {
  return (
    <div>
      {DAYS.map((d) => (
        <div key={d} className="mb-4 last:mb-0">
          <div
            className="text-[11px] font-semibold uppercase mb-2"
            style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
          >
            {DAY_LABELS_FULL[d]}
          </div>
          {byDay[d].length === 0 ? (
            <div
              className="text-[12.5px] italic py-1"
              style={{ color: 'var(--ink-4)' }}
            >
              No classes
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {byDay[d].map((b) => (
                <RecurringCard key={b.id} b={b} studentsById={studentsById} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Replace the mobile placeholder in `BookingsPage`**

Replace:

```tsx
          {/* Mobile list — added in Task 3 */}
          <div className="sm:hidden" />
```

with:

```tsx
          <div className="sm:hidden">
            <DayList byDay={byDay} studentsById={studentsById} />
          </div>
```

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: clean, no errors and no warnings introduced by this file.

- [ ] **Step 6: Smoke-test in dev across breakpoints**

Visit `/dashboard/bookings` and test all of the following:

Desktop (≥ 640px):
- Grid renders; mobile list is hidden.
- Read-only chip + hint visible in the header.

Mobile (< 640px; use DevTools device toolbar):
- Grid is hidden; day list is visible.
- Each day shows its label; days with no classes show "No classes" in italic.
- `RecurringCard` shows start time (left), class name + `· <count>` for groups (centre top), location + first names (centre bottom), and weekly RM on the right.
- Private cards have a grey left edge, group cards have an accent left edge.

Edge cases:
- Empty state (no recurring bookings) still shows the empty-state card, not the grid or list.
- A booking that spans 7:00–8:30am: grid extends down to 7a; block renders tall and shows all three text lines.
- A booking that ends at 21:30 (9:30pm): grid extends to the 10pm row; block renders without clipping.
- Dark mode: everything legible, no light-mode-only colours leaking through.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/bookings/page.tsx
git commit -m "$(cat <<'EOF'
schedule: mobile day-list view

Add a stacked day-by-day list of RecurringCard rows for viewports
below the sm breakpoint. Each card mirrors the desktop block's
private/group left-edge treatment and shows time, class name,
location + student first names, and weekly RM.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Push and verify on Vercel**

Run:

```bash
git push
```

Wait for the Vercel deploy to finish (roughly 1–2 minutes — check the deployment URL in Vercel dashboard, or just reload until the change appears). Then visit:

- `https://coach-app-ashen-delta.vercel.app/dashboard/bookings` (test-coach login: testcoach@example.com / Test123!)

Run the same checks as Step 4 one more time on the live URL. Confirm desktop grid, mobile list, dark mode, and edge cases all work in production. If anything is off, open a follow-up task — do not patch inside this plan after push.

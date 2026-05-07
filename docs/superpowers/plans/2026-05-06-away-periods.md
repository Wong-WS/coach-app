# Away Periods (Time Off) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach mark themselves "away" for a date range. All recurring classes inside the range are skipped automatically; ad-hoc + rescheduled lessons inside the range are surfaced for explicit cancellation. The away period persists as a labelled artefact visible in the calendar history.

**Architecture:** A new `coaches/{coachId}/awayPeriods` Firestore subcollection holds one doc per away period. Pure helpers in `src/lib/` (`isDateInAwayPeriod`, schedule + wallet-health updates) skip dates inside an active period. UI lives in Settings → Time off (list + create/edit modal). Dashboard + Schedule page surface an "Away — [label]" empty state for affected days.

**Tech Stack:** Next.js 16, TypeScript 5, Firebase Web SDK + Admin SDK 13, Vitest 4, Tailwind 4, Paper & Ink design system.

**Spec:** `docs/superpowers/specs/2026-05-06-away-periods-design.md`

---

## File Map

**New files:**
- `src/lib/away-periods.ts` — pure helpers: `isDateInAwayPeriod`, `awayPeriodsOverlapping`
- `src/lib/__tests__/away-periods.test.ts` — unit tests for helpers
- `src/app/dashboard/settings/_components/AwayPeriodModal.tsx` — add/edit/delete modal
- `src/app/dashboard/settings/_components/TimeOffSection.tsx` — list view inside Settings

**Modified:**
- `src/types/index.ts` — add `AwayPeriod` interface
- `src/hooks/useCoachData.ts` — add `useAwayPeriods` hook
- `src/lib/class-schedule.ts` — `getClassesForDate` and `getScheduledRevenueForDateRange` accept optional `awayPeriods`
- `src/lib/wallet-alerts.ts` — `getNextLessonCost` / `getWalletStatus` / `isLowBalance` / `getWalletHealth` accept optional `awayPeriods`
- `src/lib/__tests__/class-schedule.test.ts` — extend with away-period cases
- `src/lib/__tests__/wallet-alerts.test.ts` — extend with away-period cases
- `src/lib/portal-data.ts` — fetch + pass `awayPeriods` to `getWalletHealth`
- `src/app/dashboard/page.tsx` — wire `useAwayPeriods`, update calls, dashboard empty state
- `src/app/dashboard/payments/page.tsx` — wire `useAwayPeriods`, update wallet-health calls
- `src/app/dashboard/settings/page.tsx` — render `<TimeOffSection />` above Danger Zone
- `src/app/dashboard/bookings/page.tsx` — render away-period overlay on affected days
- `src/app/api/reset-account/route.ts` — include `awayPeriods` in cleanup list
- `firestore.rules` — owner-only rules for `awayPeriods`
- `CLAUDE.md` — document the collection in the data-model section

**Total: 4 new + 12 modified = 16 files**

---

## Task 1: Add `AwayPeriod` type + write failing tests for helpers

**Files:**
- Modify: `src/types/index.ts` (append at end)
- Test: `src/lib/__tests__/away-periods.test.ts` (create)

- [ ] **Step 1: Add the type**

Append to `src/types/index.ts` after the `WalletTransaction` interface:

```ts
export interface AwayPeriod {
  id: string;
  startDate: string;        // YYYY-MM-DD, inclusive
  endDate: string;          // YYYY-MM-DD, inclusive
  label?: string;           // optional free text, e.g. "Bali holiday"
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the failing test file**

Create `src/lib/__tests__/away-periods.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isDateInAwayPeriod, awayPeriodsOverlapping } from '@/lib/away-periods';
import type { AwayPeriod } from '@/types';

function makePeriod(overrides: Partial<AwayPeriod> = {}): AwayPeriod {
  return {
    id: 'a1',
    startDate: '2026-05-01',
    endDate: '2026-05-30',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('isDateInAwayPeriod', () => {
  it('returns null when there are no periods', () => {
    expect(isDateInAwayPeriod('2026-05-15', [])).toBeNull();
  });

  it('returns the matching period when date is inside the range', () => {
    const p = makePeriod();
    expect(isDateInAwayPeriod('2026-05-15', [p])).toEqual(p);
  });

  it('matches the exact start date (inclusive)', () => {
    const p = makePeriod();
    expect(isDateInAwayPeriod('2026-05-01', [p])).toEqual(p);
  });

  it('matches the exact end date (inclusive)', () => {
    const p = makePeriod();
    expect(isDateInAwayPeriod('2026-05-30', [p])).toEqual(p);
  });

  it('returns null one day before the range', () => {
    expect(isDateInAwayPeriod('2026-04-30', [makePeriod()])).toBeNull();
  });

  it('returns null one day after the range', () => {
    expect(isDateInAwayPeriod('2026-05-31', [makePeriod()])).toBeNull();
  });

  it('returns the first matching period when multiple exist', () => {
    const a = makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-10' });
    const b = makePeriod({ id: 'a2', startDate: '2026-06-01', endDate: '2026-06-10' });
    expect(isDateInAwayPeriod('2026-06-05', [a, b])).toEqual(b);
  });
});

describe('awayPeriodsOverlapping', () => {
  it('returns empty when no periods overlap', () => {
    const existing = [makePeriod({ startDate: '2026-05-01', endDate: '2026-05-10' })];
    expect(awayPeriodsOverlapping('2026-06-01', '2026-06-10', existing)).toEqual([]);
  });

  it('returns the period when fully contained inside an existing one', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-30' })];
    const result = awayPeriodsOverlapping('2026-05-10', '2026-05-15', existing);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('returns the period when ranges are identical', () => {
    const existing = [makePeriod({ id: 'a1' })];
    const result = awayPeriodsOverlapping('2026-05-01', '2026-05-30', existing);
    expect(result).toHaveLength(1);
  });

  it('returns the period on a partial-end overlap', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-15' })];
    const result = awayPeriodsOverlapping('2026-05-10', '2026-05-20', existing);
    expect(result).toHaveLength(1);
  });

  it('returns the period on a partial-start overlap', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-10', endDate: '2026-05-20' })];
    const result = awayPeriodsOverlapping('2026-05-05', '2026-05-12', existing);
    expect(result).toHaveLength(1);
  });

  it('treats touching boundaries as no overlap (Apr 30 → May 1)', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-30' })];
    expect(awayPeriodsOverlapping('2026-04-15', '2026-04-30', existing)).toEqual([]);
  });

  it('treats touching boundaries as no overlap (May 30 → May 31)', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-30' })];
    expect(awayPeriodsOverlapping('2026-05-31', '2026-06-15', existing)).toEqual([]);
  });

  it('honours excludeId so editing the same period doesn\'t self-conflict', () => {
    const existing = [makePeriod({ id: 'a1' })];
    const result = awayPeriodsOverlapping('2026-05-01', '2026-05-30', existing, 'a1');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests — expect them to fail**

```bash
npx vitest run src/lib/__tests__/away-periods.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/away-periods'`.

- [ ] **Step 4: Commit (test-only)**

```bash
git add src/types/index.ts src/lib/__tests__/away-periods.test.ts
git commit -m "test: failing tests for away-periods helpers + AwayPeriod type"
```

---

## Task 2: Implement away-periods helpers

**Files:**
- Create: `src/lib/away-periods.ts`

- [ ] **Step 1: Implement the helpers**

Create `src/lib/away-periods.ts`:

```ts
import type { AwayPeriod } from '@/types';

/**
 * Returns the first away period containing `date` (inclusive on both ends),
 * or null if none.
 *
 * Dates are compared as YYYY-MM-DD strings — lexicographic ordering matches
 * chronological ordering for that format, no Date parsing needed.
 */
export function isDateInAwayPeriod(
  date: string,
  awayPeriods: AwayPeriod[],
): AwayPeriod | null {
  for (const p of awayPeriods) {
    if (date >= p.startDate && date <= p.endDate) return p;
  }
  return null;
}

/**
 * Returns every period whose range overlaps [start, end] (inclusive). Touching
 * boundaries (e.g. one ends Apr 30 and another starts May 1) do NOT overlap.
 *
 * Pass `excludeId` when editing an existing period to skip self-conflict.
 */
export function awayPeriodsOverlapping(
  start: string,
  end: string,
  awayPeriods: AwayPeriod[],
  excludeId?: string,
): AwayPeriod[] {
  const out: AwayPeriod[] = [];
  for (const p of awayPeriods) {
    if (excludeId && p.id === excludeId) continue;
    // Standard interval overlap: a.start <= b.end AND a.end >= b.start
    if (p.startDate <= end && p.endDate >= start) out.push(p);
  }
  return out;
}
```

- [ ] **Step 2: Run tests — expect all pass**

```bash
npx vitest run src/lib/__tests__/away-periods.test.ts
```

Expected: PASS, 14 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/away-periods.ts
git commit -m "feat: away-periods helpers (isDateInAwayPeriod, awayPeriodsOverlapping)"
```

---

## Task 3: Extend `class-schedule` to honour away periods (TDD)

**Files:**
- Modify: `src/lib/__tests__/class-schedule.test.ts`
- Modify: `src/lib/class-schedule.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/__tests__/class-schedule.test.ts` (just before the final closing of the file or at the bottom). First update the imports at the top — add `AwayPeriod` to the type import:

Change:
```ts
import { Booking, ClassException } from '@/types';
```

To:
```ts
import { Booking, ClassException, AwayPeriod } from '@/types';
```

Then add a helper near the existing `makeBooking` / `makeException` helpers:

```ts
function makeAwayPeriod(overrides: Partial<AwayPeriod> = {}): AwayPeriod {
  return {
    id: 'away1',
    startDate: '2026-03-23',
    endDate: '2026-03-27',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
```

Then append these test blocks at the end of the file:

```ts
describe('getClassesForDate with away periods', () => {
  it('returns empty when the date falls inside an away period', () => {
    const booking = makeBooking({ dayOfWeek: 'tuesday' });
    const away = [makeAwayPeriod({ startDate: '2026-03-23', endDate: '2026-03-27' })];
    expect(getClassesForDate(TUESDAY, [booking], [], away)).toEqual([]);
  });

  it('returns classes when the date is outside every away period', () => {
    const booking = makeBooking({ dayOfWeek: 'tuesday' });
    const away = [makeAwayPeriod({ startDate: '2026-04-01', endDate: '2026-04-10' })];
    const result = getClassesForDate(TUESDAY, [booking], [], away);
    expect(result).toHaveLength(1);
  });

  it('skips away period even when an exception reschedules a class to that date', () => {
    const original = makeBooking({ dayOfWeek: 'tuesday' });
    // Reschedule from a different Tuesday to TUESDAY (which is in the away range)
    const ex = makeException({
      bookingId: 'b1',
      originalDate: '2026-03-17',
      type: 'rescheduled',
      newDate: TUESDAY,
    });
    const away = [makeAwayPeriod({ startDate: '2026-03-23', endDate: '2026-03-27' })];
    expect(getClassesForDate(TUESDAY, [original], [ex], away)).toEqual([]);
  });

  it('omitting awayPeriods param keeps existing behaviour (backward-compatible)', () => {
    const booking = makeBooking({ dayOfWeek: 'tuesday' });
    expect(getClassesForDate(TUESDAY, [booking], [])).toHaveLength(1);
  });
});

describe('getScheduledRevenueForDateRange with away periods', () => {
  it('excludes revenue from days inside an away period', () => {
    const booking = makeBooking({
      dayOfWeek: 'tuesday',
      studentIds: ['s1'],
      studentPrices: { s1: 100 },
    });
    // 2026-03-17 (Tue), 2026-03-24 (Tue), 2026-03-31 (Tue)
    const away = [makeAwayPeriod({ startDate: '2026-03-23', endDate: '2026-03-27' })];
    // Without away period: 3 Tuesdays × 100 = 300
    // With away period covering 2026-03-24: 200
    const total = getScheduledRevenueForDateRange(
      '2026-03-15',
      '2026-04-01',
      [booking],
      [],
      away,
    );
    expect(total).toBe(200);
  });

  it('omitting awayPeriods param keeps existing behaviour', () => {
    const booking = makeBooking({
      dayOfWeek: 'tuesday',
      studentIds: ['s1'],
      studentPrices: { s1: 100 },
    });
    const total = getScheduledRevenueForDateRange('2026-03-15', '2026-04-01', [booking], []);
    expect(total).toBe(300);
  });
});
```

- [ ] **Step 2: Run tests — expect new ones to fail**

```bash
npx vitest run src/lib/__tests__/class-schedule.test.ts
```

Expected: 5 new tests fail (function signature mismatch / no skip logic). Existing tests still pass.

- [ ] **Step 3: Update `getClassesForDate` to accept `awayPeriods`**

Edit `src/lib/class-schedule.ts`. Update imports at the top:

```ts
import { Booking, ClassException, DayOfWeek, AwayPeriod } from '@/types';
import { isDateInAwayPeriod } from '@/lib/away-periods';
```

Replace the `getClassesForDate` signature + first line:

```ts
export function getClassesForDate(
  date: string,
  bookings: Booking[],
  exceptions: ClassException[],
  awayPeriods: AwayPeriod[] = [],
): Booking[] {
  if (isDateInAwayPeriod(date, awayPeriods)) return [];

  const dayOfWeek = getDayOfWeekForDate(date);
  // ... rest of the function unchanged
```

- [ ] **Step 4: Update `getScheduledRevenueForDateRange` to accept `awayPeriods`**

Replace the function signature + body of `getScheduledRevenueForDateRange`:

```ts
export function getScheduledRevenueForDateRange(
  start: string,
  end: string,
  bookings: Booking[],
  exceptions: ClassException[],
  awayPeriods: AwayPeriod[] = [],
): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const startDate = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);
  const pad = (n: number) => String(n).padStart(2, '0');

  let total = 0;
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    for (const c of getClassesForDate(dateStr, bookings, exceptions, awayPeriods)) {
      total += getBookingTotal(c);
    }
  }
  return total;
}
```

(Only the signature and the inner `getClassesForDate` call changed — the rest stays the same.)

- [ ] **Step 5: Run tests — expect all pass**

```bash
npx vitest run src/lib/__tests__/class-schedule.test.ts
```

Expected: PASS — all existing tests + 5 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/lib/class-schedule.ts src/lib/__tests__/class-schedule.test.ts
git commit -m "feat: class-schedule helpers skip dates inside away periods"
```

---

## Task 4: Extend `wallet-alerts` to honour away periods (TDD)

**Files:**
- Modify: `src/lib/__tests__/wallet-alerts.test.ts`
- Modify: `src/lib/wallet-alerts.ts`

- [ ] **Step 1: Add failing tests**

Edit `src/lib/__tests__/wallet-alerts.test.ts`. Update imports:

```ts
import type { Booking, ClassException, LessonLog, Wallet, AwayPeriod } from '@/types';
```

Add a helper near `makeWallet`:

```ts
function makeAwayPeriod(overrides: Partial<AwayPeriod> = {}): AwayPeriod {
  return {
    id: 'away1',
    startDate: '2026-05-01',
    endDate: '2026-05-30',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
```

Append at the bottom of the file:

```ts
describe('away periods affect wallet health lookahead', () => {
  // Today is Mon 2026-04-27 (a few days before the away period starts).
  // Recurring Monday booking at rate 60.
  const TODAY = '2026-04-27';

  it('getNextLessonCost returns 0 when every upcoming Monday falls inside an away period', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 100 });
    // Cover all Mondays in lookahead window (LOOKAHEAD_DAYS = 56)
    const away = [makeAwayPeriod({ startDate: '2026-04-27', endDate: '2026-06-30' })];
    expect(getNextLessonCost(wallet, [booking], [], [], TODAY, away)).toBe(0);
  });

  it('getNextLessonCost finds the first Monday outside the away period', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 100 });
    // Mondays in window: 2026-04-27, 2026-05-04, 2026-05-11, 2026-05-18, 2026-05-25, 2026-06-01...
    // Block first 4: away period covers 2026-04-26 → 2026-05-22
    const away = [makeAwayPeriod({ startDate: '2026-04-26', endDate: '2026-05-22' })];
    expect(getNextLessonCost(wallet, [booking], [], [], TODAY, away)).toBe(60);
  });

  it('getWalletHealth flips from "low" to "healthy" when away period removes upcoming charges', () => {
    // balance 60, rate 60 → without away, that's "empty" (0 ≤ balance < rate is empty? actually 60 <= 60 < 120 is "low").
    // Wait: rate is 60, balance 60 → 60 < 60 is false (not empty), 60 < 120 is true → low.
    // With away covering all upcoming Mondays, getNextLessonCost returns 0,
    // hasActiveBooking still returns true (booking has no endDate), so health = healthy (rate <= 0 branch).
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 60 });
    const noAwayHealth = getWalletHealth(wallet, [booking], [], [], TODAY);
    expect(noAwayHealth.health).toBe('low');

    const away = [makeAwayPeriod({ startDate: '2026-04-27', endDate: '2026-06-30' })];
    const withAwayHealth = getWalletHealth(wallet, [booking], [], [], TODAY, away);
    expect(withAwayHealth.health).toBe('healthy');
  });

  it('isLowBalance returns false when away period clears upcoming charges', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 60 });
    const away = [makeAwayPeriod({ startDate: '2026-04-27', endDate: '2026-06-30' })];
    expect(isLowBalance(wallet, [booking], [], [], TODAY, away)).toBe(false);
  });

  it('omitting awayPeriods keeps existing behaviour (backward-compatible)', () => {
    const booking = makeBooking({ dayOfWeek: 'monday' });
    const wallet = makeWallet({ balance: 60 });
    expect(getNextLessonCost(wallet, [booking], [], [], TODAY)).toBe(60);
  });
});
```

- [ ] **Step 2: Run tests — expect new ones to fail**

```bash
npx vitest run src/lib/__tests__/wallet-alerts.test.ts
```

Expected: 5 new tests fail. Existing tests still pass.

- [ ] **Step 3: Update `wallet-alerts.ts` to thread `awayPeriods`**

Edit `src/lib/wallet-alerts.ts`. Update import:

```ts
import type { Booking, ClassException, LessonLog, Wallet, AwayPeriod } from '@/types';
```

Update `getNextLessonCost` signature + the inner `getClassesForDate` call:

```ts
export function getNextLessonCost(
  wallet: Wallet,
  bookings: Booking[],
  exceptions: ClassException[],
  completedLogs: LessonLog[],
  today: string,
  awayPeriods: AwayPeriod[] = [],
): number {
  const cur = parseDateString(today);
  for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
    const date = ymd(cur);
    const classes = getClassesForDate(date, bookings, exceptions, awayPeriods);
    for (const c of classes) {
      const isDone = completedLogs.some(
        (l) => l.date === date && l.bookingId === c.id,
      );
      if (isDone) continue;
      let cost = 0;
      for (const sid of c.studentIds) {
        if (c.studentWallets?.[sid] !== wallet.id) continue;
        cost += c.studentPrices?.[sid] ?? 0;
      }
      if (cost > 0) return cost;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return 0;
}
```

Update `isLowBalance`:

```ts
export function isLowBalance(
  wallet: Wallet,
  bookings: Booking[],
  exceptions: ClassException[],
  completedLogs: LessonLog[],
  today: string,
  awayPeriods: AwayPeriod[] = [],
): boolean {
  if (wallet.archived) return false;
  if (wallet.tabMode) return false;
  if (!hasActiveBooking(wallet, bookings, today)) return false;
  const rate = getNextLessonCost(wallet, bookings, exceptions, completedLogs, today, awayPeriods);
  if (rate <= 0) return false;
  return wallet.balance < rate * 2;
}
```

Update `getWalletStatus`:

```ts
export function getWalletStatus(
  wallet: Wallet,
  bookings: Booking[],
  exceptions: ClassException[],
  completedLogs: LessonLog[],
  today: string,
  awayPeriods: AwayPeriod[] = [],
): { rate: number; isLow: boolean } {
  if (wallet.archived) {
    return { rate: 0, isLow: false };
  }
  const rate = getNextLessonCost(wallet, bookings, exceptions, completedLogs, today, awayPeriods);
  if (wallet.tabMode) {
    return { rate, isLow: false };
  }
  const active = hasActiveBooking(wallet, bookings, today);
  const isLow = active && rate > 0 && wallet.balance < rate * 2;
  return { rate, isLow };
}
```

Update `getWalletHealth`:

```ts
export function getWalletHealth(
  wallet: Wallet,
  bookings: Booking[],
  exceptions: ClassException[],
  completedLogs: LessonLog[],
  today: string,
  awayPeriods: AwayPeriod[] = [],
): { health: WalletHealth; rate: number; lessonsLeft: number } {
  if (wallet.archived) return { health: 'inactive', rate: 0, lessonsLeft: 0 };
  const rate = getNextLessonCost(wallet, bookings, exceptions, completedLogs, today, awayPeriods);
  const lessonsLeft = rate > 0 ? Math.floor(wallet.balance / rate) : 0;
  if (wallet.tabMode) return { health: 'tab', rate, lessonsLeft };
  if (!hasActiveBooking(wallet, bookings, today))
    return { health: 'inactive', rate, lessonsLeft };
  if (wallet.balance < 0) return { health: 'owing', rate, lessonsLeft };
  if (rate <= 0) return { health: 'healthy', rate, lessonsLeft };
  if (wallet.balance < rate) return { health: 'empty', rate, lessonsLeft };
  if (wallet.balance < rate * 2) return { health: 'low', rate, lessonsLeft };
  return { health: 'healthy', rate, lessonsLeft };
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/lib/__tests__/wallet-alerts.test.ts
```

Expected: PASS — all existing tests + 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wallet-alerts.ts src/lib/__tests__/wallet-alerts.test.ts
git commit -m "feat: wallet-alerts honour away periods in lookahead"
```

---

## Task 5: Add `useAwayPeriods` hook

**Files:**
- Modify: `src/hooks/useCoachData.ts`

- [ ] **Step 1: Add the hook**

In `src/hooks/useCoachData.ts`, update the imports at the top to include `AwayPeriod`:

```ts
import { Booking, Location, Student, LessonLog, ClassException, Wallet, WalletTransaction, AwayPeriod } from '@/types';
```

Append a new hook at the end of the file (mirrors `useClassExceptions` exactly — same 4-month sliding window, but on `startDate`):

```ts
export function useAwayPeriods(coachId: string | undefined, referenceDate?: string) {
  const [awayPeriods, setAwayPeriods] = useState<AwayPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  // Build a 4-month window around the reference date (2 months each direction).
  // Periods whose endDate < window.from or startDate > window.to are excluded.
  const dateWindow = useMemo(() => {
    const ref = referenceDate ? new Date(referenceDate + 'T00:00:00') : new Date();
    const from = new Date(ref);
    from.setMonth(from.getMonth() - 2);
    const to = new Date(ref);
    to.setMonth(to.getMonth() + 2);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
      to: `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
    };
  }, [referenceDate]);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    // Filter by startDate <= window.to. We can't add endDate >= window.from in
    // the same query (Firestore allows range filters on only one field), so we
    // post-filter on the client.
    const q = query(
      collection(firestore, 'coaches', coachId, 'awayPeriods'),
      where('startDate', '<=', dateWindow.to),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: AwayPeriod[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          startDate: d.data().startDate,
          endDate: d.data().endDate,
          label: d.data().label,
          createdAt: d.data().createdAt?.toDate() || new Date(),
          updatedAt: d.data().updatedAt?.toDate() || new Date(),
        }))
        .filter((p) => p.endDate >= dateWindow.from);
      // Sort by startDate ascending — settings list will reverse for display.
      items.sort((a, b) => a.startDate.localeCompare(b.startDate));
      setAwayPeriods(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, dateWindow]);

  return { awayPeriods, loading };
}

/**
 * Loads ALL away periods (no date window). Used by Settings → Time off so the
 * coach can see their full history. Small dataset (a few per year) — fine.
 */
export function useAllAwayPeriods(coachId: string | undefined) {
  const [awayPeriods, setAwayPeriods] = useState<AwayPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard branch: hydrate loading=false when no subscription will be opened
      setLoading(false);
      return;
    }
    const firestore = db as Firestore;
    const unsubscribe = onSnapshot(
      query(collection(firestore, 'coaches', coachId, 'awayPeriods')),
      (snapshot) => {
        const items: AwayPeriod[] = snapshot.docs.map((d) => ({
          id: d.id,
          startDate: d.data().startDate,
          endDate: d.data().endDate,
          label: d.data().label,
          createdAt: d.data().createdAt?.toDate() || new Date(),
          updatedAt: d.data().updatedAt?.toDate() || new Date(),
        }));
        items.sort((a, b) => b.startDate.localeCompare(a.startDate));
        setAwayPeriods(items);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [coachId]);

  return { awayPeriods, loading };
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCoachData.ts
git commit -m "feat: useAwayPeriods + useAllAwayPeriods hooks"
```

---

## Task 6: Firestore security rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add the rule block**

Edit `firestore.rules`. Inside `match /coaches/{coachId}` (between the existing `wallets` block and the closing brace at line 39), add:

```
      match /awayPeriods/{periodId} {
        allow read, write: if isOwner(coachId);
      }
```

The full block under `match /coaches/{coachId}` should now include `awayPeriods` alongside locations, bookings, students, lessonLogs, classExceptions, and wallets.

- [ ] **Step 2: Deploy rules**

```bash
firebase deploy --only firestore:rules
```

Expected: `✔  Deploy complete!`

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: firestore rules for awayPeriods (owner-only)"
```

---

## Task 7: Wire `awayPeriods` into existing dashboard call sites

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/payments/page.tsx`
- Modify: `src/lib/portal-data.ts`

This task threads `awayPeriods` into every existing caller. None of the helpers' default values change behaviour, so this is mechanical wiring.

- [ ] **Step 1: Dashboard page — load and pass `awayPeriods`**

In `src/app/dashboard/page.tsx`, update the import for hooks:

```ts
import {
  useBookings,
  useClassExceptions,
  useLessonLogs,
  useStudents,
  useWallets,
  useLocations,
  useAwayPeriods,
} from '@/hooks/useCoachData';
```

Inside the component (after the existing `useClassExceptions` line at ~139), add:

```ts
const { awayPeriods } = useAwayPeriods(coach?.id, selectedDateStr);
```

Update the four call sites identified earlier:

Line ~146:
```ts
const todaysClasses = useMemo(
  () => getClassesForDate(selectedDateStr, bookings, classExceptions, awayPeriods),
  [selectedDateStr, bookings, classExceptions, awayPeriods],
);
```

Line ~189 (`isLowBalance` filter):
```ts
.filter((w) => isLowBalance(w, bookings, classExceptions, lessonLogs, todayStr, awayPeriods))
```

Line ~202 (`getClassesForDate` count map): pass `awayPeriods` as 4th arg, and add `awayPeriods` to the `useMemo` deps.

Line ~348 and ~460 (`getNextLessonCost` calls): pass `awayPeriods` as the 6th arg.

Line ~1578 (the helper inside the wallet card): pass `awayPeriods` (sourced from the surrounding scope — verify it's in scope; if not, prop-drill it).

- [ ] **Step 2: Payments page — load and pass `awayPeriods`**

In `src/app/dashboard/payments/page.tsx`, update the hook import to include `useAwayPeriods`:

```ts
import {
  useWallets,
  useStudents,
  useBookings,
  useClassExceptions,
  useLessonLogs,
  useAwayPeriods,
} from '@/hooks/useCoachData';
```

Inside the component, add:

```ts
const { awayPeriods } = useAwayPeriods(coach?.id);
```

For each of the 5 call sites identified earlier:
- Line ~166: `getWalletHealth(wallet, bookings, exceptions, completedLogs, todayStr, awayPeriods)`
- Line ~878 + ~892: `isLowBalance(w, bookings, classExceptions, lessonLogs, todayStr, awayPeriods)`
- Line ~941: `getWalletHealth(... , awayPeriods)`
- Line ~970: `getScheduledRevenueForDateRange(start, end, bookings, exceptions, awayPeriods)`
- Line ~982: `getWalletStatus(wallet, bookings, exceptions, logs, todayStr, awayPeriods)`

If `awayPeriods` is consumed inside a child component (e.g. `WalletCard` at line ~166), prop-drill it: add `awayPeriods: AwayPeriod[]` to the component's prop type and pass it down.

- [ ] **Step 3: Portal data — fetch + thread `awayPeriods`**

In `src/lib/portal-data.ts`, update imports:

```ts
import type { Booking, ClassException, LessonLog, Wallet, AwayPeriod } from '@/types';
```

In `fetchPortalData` around line 189, add `awayPeriodsSnap` to the parallel fetch:

```ts
const [coachSnap, walletSnap, bookingsSnap, exceptionsSnap, awayPeriodsSnap, todayLogsSnap, charges, topUps] =
  await Promise.all([
    db.doc(`coaches/${coachId}`).get(),
    db.doc(`coaches/${coachId}/wallets/${walletId}`).get(),
    db.collection(`coaches/${coachId}/bookings`).where('status', '==', 'confirmed').get(),
    db.collection(`coaches/${coachId}/classExceptions`)
      .where('originalDate', '>=', fourMonthsAgo)
      .where('originalDate', '<=', fourMonthsAhead)
      .get(),
    db.collection(`coaches/${coachId}/awayPeriods`)
      .where('startDate', '<=', fourMonthsAhead)
      .get(),
    db.collection(`coaches/${coachId}/lessonLogs`).where('date', '==', today).get(),
    fetchChargesPage(ctx, null),
    fetchTopUpsPage(ctx, null),
  ]);
```

After the existing `exceptions` mapping block, add:

```ts
const awayPeriods: AwayPeriod[] = awayPeriodsSnap.docs
  .map((d) => {
    const a = d.data();
    return {
      id: d.id,
      startDate: a.startDate as string,
      endDate: a.endDate as string,
      label: a.label as string | undefined,
      createdAt: a.createdAt?.toDate?.() ?? new Date(),
      updatedAt: a.updatedAt?.toDate?.() ?? new Date(),
    };
  })
  .filter((p) => p.endDate >= fourMonthsAgo);
```

Then update the `getWalletHealth` call at line ~282 to pass `awayPeriods`:

```ts
const { health, rate } = getWalletHealth(wallet, bookings, exceptions, todayLogs, today, awayPeriods);
```

- [ ] **Step 4: Build + lint**

```bash
npm run build && npm run lint
```

Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/payments/page.tsx src/lib/portal-data.ts
git commit -m "feat: thread awayPeriods through dashboard, payments, portal"
```

---

## Task 8: Build the AwayPeriodModal component

**Files:**
- Create: `src/app/dashboard/settings/_components/AwayPeriodModal.tsx`

This modal handles create + edit + delete in a single component. It runs the conflict resolver live and commits everything in a single `writeBatch`.

- [ ] **Step 1: Create the modal component**

Create `src/app/dashboard/settings/_components/AwayPeriodModal.tsx`:

```tsx
'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/ui/Toast';
import { Btn, PaperModal } from '@/components/paper';
import { DatePicker } from '@/components/ui/DatePicker';
import { awayPeriodsOverlapping } from '@/lib/away-periods';
import type { AwayPeriod, Booking, ClassException } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  coachId: string;
  editing: AwayPeriod | null;       // null = create mode
  allAwayPeriods: AwayPeriod[];     // for overlap check
  bookings: Booking[];              // for conflict resolver
  exceptions: ClassException[];     // for conflict resolver
}

type ConflictRow =
  | { kind: 'adhoc-booking'; id: string; date: string; label: string }
  | { kind: 'rescheduled-exception'; id: string; date: string; label: string };

const paperInputClass =
  'w-full px-3 py-2.5 rounded-[10px] border text-[13.5px] outline-none focus:border-[color:var(--accent)]';
const paperInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  borderColor: 'var(--line-2)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
  appearance: 'none',
  minWidth: 0,
};

function formatDateLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-MY', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeLabel(t: string): string {
  // 24h "HH:mm" → "h:mm AM/PM"
  const [hh, mm] = t.split(':').map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const ampm = hh < 12 ? 'AM' : 'PM';
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function buildConflictRows(
  startDate: string,
  endDate: string,
  bookings: Booking[],
  exceptions: ClassException[],
): ConflictRow[] {
  const rows: ConflictRow[] = [];

  // Ad-hoc bookings whose startDate === endDate falls in [startDate, endDate]
  for (const b of bookings) {
    if (b.startDate && b.endDate && b.startDate === b.endDate) {
      const d = b.startDate;
      if (d >= startDate && d <= endDate) {
        rows.push({
          kind: 'adhoc-booking',
          id: b.id,
          date: d,
          label: `${formatDateLabel(d)} · ${formatTimeLabel(b.startTime)} · ${b.className || 'Class'} at ${b.locationName}`,
        });
      }
    }
  }

  // Rescheduled exceptions whose newDate falls in [startDate, endDate]
  for (const ex of exceptions) {
    if (ex.type !== 'rescheduled' || !ex.newDate) continue;
    const d = ex.newDate;
    if (d >= startDate && d <= endDate) {
      const booking = bookings.find((b) => b.id === ex.bookingId);
      const className = ex.newClassName ?? booking?.className ?? 'Class';
      const locationName = ex.newLocationName ?? booking?.locationName ?? '';
      const startTime = ex.newStartTime ?? booking?.startTime ?? '';
      rows.push({
        kind: 'rescheduled-exception',
        id: ex.id,
        date: d,
        label: `${formatDateLabel(d)} · ${formatTimeLabel(startTime)} · ${className} at ${locationName} (rescheduled)`,
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

export default function AwayPeriodModal({
  open,
  onClose,
  coachId,
  editing,
  allAwayPeriods,
  bookings,
  exceptions,
}: Props) {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState<string>(editing?.startDate ?? '');
  const [endDate, setEndDate] = useState<string>(editing?.endDate ?? '');
  const [label, setLabel] = useState<string>(editing?.label ?? '');
  const [skipBookingIds, setSkipBookingIds] = useState<Set<string>>(new Set());
  const [skipExceptionIds, setSkipExceptionIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLongRangeConfirm, setShowLongRangeConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-init local state when editing target changes
  useEffect(() => {
    setStartDate(editing?.startDate ?? '');
    setEndDate(editing?.endDate ?? '');
    setLabel(editing?.label ?? '');
    setSkipBookingIds(new Set());
    setSkipExceptionIds(new Set());
    setError(null);
  }, [editing, open]);

  const datesValid = !!startDate && !!endDate && startDate <= endDate;

  const conflictRows = useMemo<ConflictRow[]>(() => {
    if (!datesValid) return [];
    return buildConflictRows(startDate, endDate, bookings, exceptions);
  }, [datesValid, startDate, endDate, bookings, exceptions]);

  // Default: every conflict row ticked (= "cancel"). Reset whenever the row set changes.
  useEffect(() => {
    const initBookings = new Set<string>();
    const initExceptions = new Set<string>();
    for (const r of conflictRows) {
      if (r.kind === 'adhoc-booking') initBookings.add(r.id);
      else initExceptions.add(r.id);
    }
    setSkipBookingIds(initBookings);
    setSkipExceptionIds(initExceptions);
  }, [conflictRows]);

  const dayCount = useMemo(() => {
    if (!datesValid) return 0;
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const ms = new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
  }, [datesValid, startDate, endDate]);

  function toggleRow(row: ConflictRow) {
    if (row.kind === 'adhoc-booking') {
      const next = new Set(skipBookingIds);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      setSkipBookingIds(next);
    } else {
      const next = new Set(skipExceptionIds);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      setSkipExceptionIds(next);
    }
  }

  async function handleSave() {
    if (!datesValid || !db) return;
    setError(null);

    // Overlap check (excluding the period being edited)
    const overlaps = awayPeriodsOverlapping(
      startDate,
      endDate,
      allAwayPeriods,
      editing?.id,
    );
    if (overlaps.length > 0) {
      const o = overlaps[0];
      setError(
        `Overlaps with "${o.label || `${o.startDate} – ${o.endDate}`}". Edit that one instead.`,
      );
      return;
    }

    // Length sanity check — show a confirm modal instead of saving immediately
    if (dayCount > 365 && !showLongRangeConfirm) {
      setShowLongRangeConfirm(true);
      return;
    }
    setShowLongRangeConfirm(false);

    setSaving(true);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      // 1. Create or update the away period doc
      let awayPeriodId = editing?.id;
      if (editing) {
        batch.update(
          doc(firestore, 'coaches', coachId, 'awayPeriods', editing.id),
          {
            startDate,
            endDate,
            label: label.trim() || null,
            updatedAt: serverTimestamp(),
          },
        );
      } else {
        const newDocRef = doc(collection(firestore, 'coaches', coachId, 'awayPeriods'));
        awayPeriodId = newDocRef.id;
        batch.set(newDocRef, {
          startDate,
          endDate,
          label: label.trim() || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // 2. Delete ticked ad-hoc bookings (and their exceptions)
      for (const bookingId of skipBookingIds) {
        batch.delete(doc(firestore, 'coaches', coachId, 'bookings', bookingId));
      }
      // Cleanup exceptions referencing those deleted bookings — query outside batch
      if (skipBookingIds.size > 0) {
        for (const bookingId of skipBookingIds) {
          const exQuery = query(
            collection(firestore, 'coaches', coachId, 'classExceptions'),
            where('bookingId', '==', bookingId),
          );
          const snap = await getDocs(exQuery);
          for (const d of snap.docs) {
            batch.delete(doc(firestore, 'coaches', coachId, 'classExceptions', d.id));
          }
        }
      }

      // 3. Convert ticked rescheduled exceptions to cancelled
      for (const exId of skipExceptionIds) {
        batch.update(doc(firestore, 'coaches', coachId, 'classExceptions', exId), {
          type: 'cancelled',
          newDate: null,
          newStartTime: null,
          newEndTime: null,
          newLocationId: null,
          newLocationName: null,
          newNote: null,
          newClassName: null,
          newStudentIds: null,
          newStudentPrices: null,
          newStudentWallets: null,
        });
      }

      await batch.commit();
      showToast(editing ? 'Time off updated' : 'Time off added', 'success');
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Failed to save time off', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing || !db) return;
    setSaving(true);
    try {
      const firestore = db as Firestore;
      await deleteDoc(doc(firestore, 'coaches', coachId, 'awayPeriods', editing.id));
      showToast('Time off deleted', 'success');
      setShowDeleteConfirm(false);
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Failed to delete time off', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PaperModal
        open={open}
        onClose={() => !saving && onClose()}
        title={editing ? 'Edit time off' : 'Add time off'}
      >
        <div className="space-y-4">
          {/* Start date */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
              Start date
            </label>
            <DatePicker value={startDate} onChange={setStartDate} />
          </div>

          {/* End date */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
              End date
            </label>
            <DatePicker value={endDate} onChange={setEndDate} />
            {startDate && endDate && endDate < startDate && (
              <div className="text-[11.5px] mt-1" style={{ color: 'var(--bad)' }}>
                End date must be on or after the start date.
              </div>
            )}
          </div>

          {/* Label */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Bali holiday"
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          {/* Conflict resolver */}
          {datesValid && conflictRows.length > 0 && (
            <div className="pt-2">
              <div className="text-[12.5px] font-medium mb-2" style={{ color: 'var(--ink)' }}>
                While you're away, these lessons are scheduled:
              </div>
              <div className="space-y-1.5">
                {conflictRows.map((row) => {
                  const checked =
                    row.kind === 'adhoc-booking'
                      ? skipBookingIds.has(row.id)
                      : skipExceptionIds.has(row.id);
                  return (
                    <label
                      key={`${row.kind}:${row.id}`}
                      className="flex items-start gap-2 cursor-pointer text-[12.5px]"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(row)}
                        className="mt-0.5"
                      />
                      <span>
                        {row.label}{' '}
                        <span style={{ color: 'var(--ink-3)' }}>
                          {checked ? '— will cancel' : '— keep'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="text-[11.5px] mt-2" style={{ color: 'var(--ink-3)' }}>
                Recurring weekly classes in this range will be skipped automatically — no need to cancel each one.
              </div>
            </div>
          )}

          {/* Shrink note (edit mode only) */}
          {editing && (
            <div className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              Shortening the range won't restore lessons you already cancelled.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-[12px]" style={{ color: 'var(--bad)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {editing ? (
            <Btn
              variant="ghost"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving}
              style={{ color: 'var(--bad)' }}
            >
              Delete
            </Btn>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Btn variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Btn>
            <Btn onClick={handleSave} disabled={saving || !datesValid}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Add time off'}
            </Btn>
          </div>
        </div>
      </PaperModal>

      {/* Delete confirmation */}
      <PaperModal
        open={showDeleteConfirm}
        onClose={() => !saving && setShowDeleteConfirm(false)}
        title="Delete time off?"
      >
        <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
          Delete &ldquo;{editing?.label || `${editing?.startDate} – ${editing?.endDate}`}&rdquo;? Lessons cancelled because of this away period won&apos;t be restored.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Btn variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={saving}>
            Cancel
          </Btn>
          <Btn onClick={handleDelete} disabled={saving} style={{ background: 'var(--bad)', color: 'white' }}>
            {saving ? 'Deleting…' : 'Delete'}
          </Btn>
        </div>
      </PaperModal>

      {/* Long-range sanity check */}
      <PaperModal
        open={showLongRangeConfirm}
        onClose={() => !saving && setShowLongRangeConfirm(false)}
        title="That's a long time off"
      >
        <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
          {dayCount} days is over a year. Are you sure you picked the right dates?
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Btn variant="outline" onClick={() => setShowLongRangeConfirm(false)} disabled={saving}>
            Go back
          </Btn>
          <Btn onClick={handleSave} disabled={saving}>
            Yes, save
          </Btn>
        </div>
      </PaperModal>
    </>
  );
}
```

- [ ] **Step 2: Verify the imports compile**

```bash
npx tsc --noEmit
```

Expected: PASS. (`DatePicker` is a named export at `@/components/ui/DatePicker`; `PaperModal`, `Btn`, `IconPlus`, `IconEdit` are exported from `@/components/paper`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/settings/_components/AwayPeriodModal.tsx
git commit -m "feat: AwayPeriodModal — add/edit/delete + conflict resolver"
```

---

## Task 9: Add the Time Off section to Settings

**Files:**
- Create: `src/app/dashboard/settings/_components/TimeOffSection.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create the section component**

Create `src/app/dashboard/settings/_components/TimeOffSection.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Btn, IconPlus, IconEdit } from '@/components/paper';
import { useAllAwayPeriods, useBookings, useClassExceptions } from '@/hooks/useCoachData';
import AwayPeriodModal from './AwayPeriodModal';
import type { AwayPeriod } from '@/types';

interface Props {
  coachId: string;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
    >
      {children}
    </div>
  );
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const sDate = new Date(sy, sm - 1, sd);
  const eDate = new Date(ey, em - 1, ed);
  const sameYear = sy === ey;
  const startLabel = sDate.toLocaleDateString('en-MY', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endLabel = eDate.toLocaleDateString('en-MY', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

function statusFor(period: AwayPeriod, todayStr: string): 'upcoming' | 'now' | 'past' {
  if (todayStr < period.startDate) return 'upcoming';
  if (todayStr > period.endDate) return 'past';
  return 'now';
}

export default function TimeOffSection({ coachId }: Props) {
  const { awayPeriods, loading } = useAllAwayPeriods(coachId);
  const { bookings } = useBookings(coachId, 'confirmed');
  const { classExceptions } = useClassExceptions(coachId);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AwayPeriod | null>(null);

  const todayStr = useMemo(() => ymd(new Date()), []);

  // Sort: upcoming/current first (by startDate asc), then past (by startDate desc)
  const sorted = useMemo(() => {
    const upcomingOrNow: AwayPeriod[] = [];
    const past: AwayPeriod[] = [];
    for (const p of awayPeriods) {
      if (statusFor(p, todayStr) === 'past') past.push(p);
      else upcomingOrNow.push(p);
    }
    upcomingOrNow.sort((a, b) => a.startDate.localeCompare(b.startDate));
    past.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return [...upcomingOrNow, ...past];
  }, [awayPeriods, todayStr]);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-2.5">
        <Eyebrow>Time off</Eyebrow>
        <Btn variant="outline" onClick={() => setShowAdd(true)}>
          <IconPlus size={14} />
          <span className="ml-1">Add time off</span>
        </Btn>
      </div>
      <p className="text-[12.5px] mb-4" style={{ color: 'var(--ink-3)' }}>
        Block out vacations, conferences, or any stretch you're not teaching.
      </p>

      {loading ? (
        <div className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Loading…</div>
      ) : sorted.length === 0 ? (
        <div
          className="rounded-[12px] border p-4 text-[12.5px]"
          style={{ borderColor: 'var(--line-2)', color: 'var(--ink-3)' }}
        >
          No time off scheduled.
        </div>
      ) : (
        <div className="rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--line-2)' }}>
          {sorted.map((p, i) => {
            const status = statusFor(p, todayStr);
            const chipColor =
              status === 'now'
                ? 'var(--good)'
                : status === 'upcoming'
                  ? 'var(--accent)'
                  : 'var(--ink-3)';
            const chipLabel = status === 'now' ? 'Now' : status === 'upcoming' ? 'Upcoming' : 'Past';
            return (
              <button
                key={p.id}
                onClick={() => setEditing(p)}
                className="w-full flex items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-[var(--line)]"
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span
                    className="text-[13.5px] font-medium truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {formatRange(p.startDate, p.endDate)}
                  </span>
                  {p.label && (
                    <span
                      className="text-[12.5px] truncate"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      · {p.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    style={{
                      color: chipColor,
                      background: 'var(--line)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {chipLabel}
                  </span>
                  <IconEdit size={14} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <AwayPeriodModal
        open={showAdd || editing !== null}
        onClose={() => {
          setShowAdd(false);
          setEditing(null);
        }}
        coachId={coachId}
        editing={editing}
        allAwayPeriods={awayPeriods}
        bookings={bookings}
        exceptions={classExceptions}
      />
    </section>
  );
}
```

- [ ] **Step 2: Render the section in the settings page**

Edit `src/app/dashboard/settings/page.tsx`. Add the import near the other component imports:

```ts
import TimeOffSection from './_components/TimeOffSection';
```

Find the Danger Zone section (around line 420 — `{/* ── Danger zone ── */}`). Insert `<TimeOffSection coachId={coach!.id} />` immediately before it. Wrap with a coach existence check if needed:

```tsx
{coach && <TimeOffSection coachId={coach.id} />}

{/* ── Danger zone ── */}
```

- [ ] **Step 3: Smoke test in the dev server**

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard/settings`. Verify:
- "Time off" section appears between Locations and Danger Zone.
- "Add time off" opens the modal.
- Pick dates, optional label, save → toast appears, row appears in the list.
- Click the row → modal opens in edit mode with values populated.
- Try saving an overlapping range → inline error.
- Delete from edit modal → confirmation modal appears, then row disappears.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/_components/TimeOffSection.tsx src/app/dashboard/settings/page.tsx
git commit -m "feat: settings → time off section (list + add/edit modal)"
```

---

## Task 10: Dashboard "You're away" empty state

**Files:**
- Modify: `src/app/dashboard/page.tsx`

When today (or the selected date in the date picker) falls inside an away period, show an empty state with the away label. Hide bulk-mark-done.

- [ ] **Step 1: Compute the active away period and gate UI**

In `src/app/dashboard/page.tsx`, after the existing `awayPeriods` line added in Task 7, add:

```ts
const activeAwayPeriod = useMemo(
  () => awayPeriods.find((p) => selectedDateStr >= p.startDate && selectedDateStr <= p.endDate) ?? null,
  [awayPeriods, selectedDateStr],
);
```

(You may use the `isDateInAwayPeriod` helper instead — import from `@/lib/away-periods`.)

`getClassesForDate` already returns `[]` when the date is in an away period, so `todaysClasses.length === 0` will already be true on those days. The visible change is the *messaging*: replace the existing empty state with an away-specific banner when `activeAwayPeriod` is set.

- [ ] **Step 2: Render the away banner where empty state currently shows**

Find the existing empty-state JSX inside the dashboard (look for the message rendered when `todaysClasses.length === 0`). Replace it with a conditional:

```tsx
{todaysClasses.length === 0 ? (
  activeAwayPeriod ? (
    <div className="rounded-[12px] border p-6 text-center" style={{ borderColor: 'var(--line-2)' }}>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
        You&apos;re away
      </div>
      {activeAwayPeriod.label && (
        <div className="text-[13px] mt-1" style={{ color: 'var(--ink-2)' }}>
          {activeAwayPeriod.label}
        </div>
      )}
      <div className="text-[12px] mt-1" style={{ color: 'var(--ink-3)' }}>
        {/* Use the existing range formatter or inline format */}
        {activeAwayPeriod.startDate} – {activeAwayPeriod.endDate}
      </div>
      <a
        href="/dashboard/settings"
        className="inline-block mt-3 text-[12px] underline"
        style={{ color: 'var(--ink-2)' }}
      >
        Edit in Settings
      </a>
    </div>
  ) : (
    {/* original empty state JSX preserved */}
  )
) : (
  {/* existing class list JSX */}
)}
```

(Adapt the structure to match the existing JSX. The point is: when the empty list is because of an away period, render the away card instead of the generic "no classes" message.)

- [ ] **Step 3: Hide bulk-mark-done UI when away**

Find any bulk-action UI that's gated on `todaysClasses.length` or `remainingClasses.length`. Add `&& !activeAwayPeriod` to those gates so the bulk row hides on away days. (If the bulk UI is already hidden when `remainingClasses.length === 0`, it'll naturally hide — verify and skip if so.)

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Create a Time Off period covering today via Settings. Navigate to the dashboard. Verify:
- "Today's Classes" body shows the "You're away" card with label + dates.
- The week strip still works; navigating to a non-away day shows classes normally.
- Bulk actions are not visible.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: dashboard shows 'You're away' empty state on away days"
```

---

## Task 11: Schedule page away-day overlay

**Files:**
- Modify: `src/app/dashboard/bookings/page.tsx`

- [ ] **Step 1: Wire `useAwayPeriods` and overlay affected days**

Add the import to `src/app/dashboard/bookings/page.tsx`:

```ts
import { useAwayPeriods } from '@/hooks/useCoachData';
import { isDateInAwayPeriod } from '@/lib/away-periods';
```

Inside the component, add:

```ts
const { awayPeriods } = useAwayPeriods(coach?.id);
```

Find the day-rendering loop (search for `getClassesForDate` in this file). For each rendered day, check `const away = isDateInAwayPeriod(dayStr, awayPeriods);` and when truthy, render a soft grey overlay with a label pill instead of (or layered over) the empty grid:

```tsx
{away ? (
  <div
    className="rounded-[8px] p-3 flex items-center gap-2"
    style={{ background: 'var(--line)', color: 'var(--ink-3)' }}
  >
    <span className="text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-full"
          style={{ background: 'var(--bg)', color: 'var(--ink-2)', letterSpacing: '0.05em' }}>
      Away
    </span>
    <span className="text-[12.5px] truncate">{away.label || 'Time off'}</span>
  </div>
) : (
  /* existing class blocks */
)}
```

Adapt to the existing layout so the overlay sits where the day's class list sits. Pass `awayPeriods` to `getClassesForDate` — though it'll already return `[]` so no class blocks will render anyway, the overlay just makes the reason explicit.

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```

Visit `/dashboard/bookings`. Verify days inside the away period render the grey "Away — [label]" pill instead of empty space, and that classes still render normally on other days.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/bookings/page.tsx
git commit -m "feat: schedule page overlays away days with labelled pill"
```

---

## Task 12: Include `awayPeriods` in account reset

**Files:**
- Modify: `src/app/api/reset-account/route.ts`

- [ ] **Step 1: Add to the cleanup list**

Open `src/app/api/reset-account/route.ts`. Find the line:

```ts
const collections = ['wallets', 'students', 'bookings', 'lessonLogs', 'classExceptions', 'locations'];
```

Update it to:

```ts
const collections = ['wallets', 'students', 'bookings', 'lessonLogs', 'classExceptions', 'locations', 'awayPeriods'];
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reset-account/route.ts
git commit -m "feat: account reset clears awayPeriods"
```

---

## Task 13: Document the new collection in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the collection to the data model**

Edit `CLAUDE.md`. In the Firestore Data Model section, after the `classExceptions` block and before the `wallets` block, add:

```
coaches/{coachId}/awayPeriods/{periodId}     # Coach travel/leave — full-day blackouts
  startDate, endDate                          # YYYY-MM-DD inclusive on both ends
  label                                       # optional free text, e.g. "Bali holiday"
  createdAt, updatedAt
```

In the Key Features section, add a bullet:

```
- **Time off (away periods)**: full-day blackouts for travel/leave (Settings → Time off). Recurring classes inside the range are skipped automatically; ad-hoc + rescheduled lessons surface in a conflict resolver. Persists indefinitely as a labelled record visible on dashboard + schedule.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: away periods in data model + key features"
```

---

## Task 14: Final verification

- [ ] **Step 1: Full test run**

```bash
npx vitest run
```

Expected: ALL tests pass.

- [ ] **Step 2: Build + lint**

```bash
npm run build && npm run lint
```

Expected: PASS, no errors.

- [ ] **Step 3: Manual smoke walkthrough**

```bash
npm run dev
```

Login as `testcoach@example.com` and run through:
1. Settings → Time off → Add → pick dates spanning today → save. Confirm toast + row.
2. Dashboard → confirm "You're away" empty state for today.
3. Dashboard → navigate to a non-away day → classes render normally.
4. Schedule page → confirm grey "Away — [label]" pill on away days.
5. Settings → click the period → edit dates / label → save. Confirm changes reflected.
6. Settings → click the period → Delete → confirm → row disappears.
7. Add a one-time booking inside a future away period range, then create the away period — confirm conflict resolver lists that booking with default-tick "cancel". Save with the box ticked, confirm the booking is gone.
8. Open the wallet portal for a parent whose only upcoming charges fall inside an away period — confirm balance status doesn't flag "low" purely due to skipped charges.

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-Review Notes

**Spec coverage check:**
- Data model (collection + type) — Task 1, doc'd in Task 13
- `useAwayPeriods` hook — Task 5
- `isDateInAwayPeriod` / `awayPeriodsOverlapping` helpers — Task 1+2
- `class-schedule.ts` updates — Task 3
- `wallet-alerts.ts` updates — Task 4
- `portal-data.ts` fetch + thread — Task 7 step 3
- Settings → Time off card — Task 9
- Add/Edit modal with conflict resolver — Task 8
- Save behaviour (writeBatch with 3 actions) — Task 8 step 1
- Editing rules (extending/shrinking, length cap) — Task 8 step 1 (`dayCount` warn, no shrink-restore note)
- Delete confirmation modal — Task 8 step 1
- Overlap prevention — Task 8 step 1 (`awayPeriodsOverlapping`)
- Past dates allowed — implicit (no floor on DatePicker)
- Dashboard "You're away" empty state — Task 10
- Schedule page overlay — Task 11
- Firestore rules — Task 6
- No composite indexes — confirmed, none needed
- Reset account includes `awayPeriods` — Task 12
- Tests for helpers, schedule, wallet-alerts — Tasks 1, 3, 4

All spec sections covered.

**Type consistency check:** `AwayPeriod` interface defined once in Task 1. Helper signatures (`isDateInAwayPeriod`, `awayPeriodsOverlapping`) consistent across tasks. Hook returns `{ awayPeriods, loading }` matching the pattern.

**Placeholder check:** No "TBD", "implement later", or vague handlers. The dashboard-empty-state task references "the existing empty-state JSX" — that's necessarily a pointer rather than a code block since the surrounding JSX is large; the engineer has the surrounding context and a complete replacement card. Acceptable.

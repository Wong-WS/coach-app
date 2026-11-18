# Analytics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/dashboard/analytics`, a Month view and a Year view of classes, money, cancellations and a year-end forecast, built only from data the app already stores.

**Architecture:** All maths lives in pure, unit-tested modules under `src/lib/analytics/`. A one-time-fetch hook loads just the date range a view needs (no live listeners for history) and feeds the page. The page is a thin client component with `MonthView` / `YearView` presentational children. Payments' "projected" switches to the shared projection function so the two pages agree.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Firestore web SDK, Tailwind 4 + Paper & Ink tokens, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-18-analytics-design.md`. Read it first; it defines every number. This plan doesn't repeat the definitions; it says where each one is implemented.

## Global Constraints

- Paper & Ink tokens only (`var(--ink)`, `var(--panel)`, `var(--good)`/`--good-soft`, `--warn`/`--warn-soft`, `--bad`/`--bad-soft`, `--line`, `--line-2`, `--ink-2..4`, `--bg`). No hex.
- `.mono` + `.tnum` on every money, date and count cell.
- Card lists uniform height, single-line rows; badges in a row use `gap-2`.
- Never `await` inside a per-wallet loop. Fan out with `Promise.all` (live account has ~70 wallets).
- History data is read with one-time `getDocs`, not `onSnapshot`. Year data is fetched only when the Year view is shown. (Firestore Spark plan: 50k reads/day shared by all coaches.)
- Dates are `YYYY-MM-DD` strings in local time; ranges are inclusive on both ends.
- Money is integer cents; display with `formatRM` (`RM ${formatCentsGrouped(c)}`).
- Pure logic files must not import `firebase/*`.
- Check `git branch --show-current` is `main` before each commit; commit + push after each task.
- Unit tests live in `src/lib/__tests__/`; run with `npx vitest run`.

## Review Focus

1. **Today is the 31st and last month had 30 (or 28) days.** The comparison range must stop at last month's final day, not roll into this month. Test in Task 1.
2. **Siblings on one wallet in the same class.** The run-out simulation charges both prices against that wallet for the class. Cancels-most and most-lessons count the family once for that class. Tests in Tasks 4 and 5.
3. **Brand-new coach or an empty year.** No `NaN`/`Infinity`: rate 0, averages 0, forecast = taught, empty lists hidden, no "since" label. Tests in Tasks 3 and 6.
4. **Today is the 1st of the month.** Still-to-come includes today's unfinished classes; the comparison range is just day 1 of last month. Tests in Tasks 1 and 2.
5. **Today falls inside planned time off.** Still-to-come skips it (`getClassesForDate` returns `[]`); Days counts it as Time off unless a lesson was logged. Tests in Tasks 2 and 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/analytics/periods.ts` | Date-range helpers: month/year ranges, comparison range, "since" date |
| `src/lib/analytics/projection.ts` | Taught-in-range, still-to-come, projected (shared with Payments) |
| `src/lib/analytics/cancellations.ts` | Cancellation records, reason buckets, reschedule count, cancellation rate |
| `src/lib/analytics/families.ts` | Student → family (wallet) resolver, cancels-most, most-lessons |
| `src/lib/analytics/wallet-forecast.ts` | Likely-to-receive simulation |
| `src/lib/analytics/year.ts` | Forecast, monthly bars, days split, hours, by-weekday, students |
| `src/lib/lesson-logs.ts` | (modify) export `classKey` used by `countClasses` |
| `src/lib/firestore-mappers.ts` | Doc → `Booking`/`LessonLog`/`ClassException` mappers shared by hooks and fetchers |
| `src/lib/analytics/fetch.ts` | One-time Firestore range fetchers |
| `src/hooks/useAnalyticsData.ts` | Hook: fetch a range once, cache per visit |
| `src/app/dashboard/analytics/page.tsx` | Page shell: Month/Year switch, stepper, data wiring |
| `src/app/dashboard/analytics/_components/*.tsx` | `MonthView`, `YearView`, `StatCard`, `DeltaChip`, `ReasonBars`, `RankList` |
| `src/app/dashboard/layout.tsx` | (modify) add Analytics nav item |
| `src/components/paper/Icons.tsx` | (modify) add `IconChart` |
| `src/app/dashboard/payments/page.tsx` | (modify) projected via `projectPeriod` |
| `firestore.indexes.json` | (modify) `transactions (type ASC, date ASC)` |

---

### Task 1: Period helpers

**Files:**
- Create: `src/lib/analytics/periods.ts`
- Test: `src/lib/__tests__/analytics-periods.test.ts`

**Interfaces:**
- Produces:
  - `type DateRange = { start: string; end: string }`
  - `ymd(d: Date): string`
  - `addDays(date: string, n: number): string`
  - `monthRange(year: number, month: number /* 1–12 */): DateRange`
  - `yearRange(year: number): DateRange`
  - `clampRange(range: DateRange, min?: string, max?: string): DateRange | null` (null when empty)
  - `comparisonRange(period: DateRange, today: string): DateRange`: the previous calendar month. If `period` contains `today`, the end is the same day-of-month as today, capped at the previous month's last day.
  - `eachDate(range: DateRange): string[]`
  - `sinceDate(firstLogDate: string | null, year: number): string | null`: returns `firstLogDate` when it's in `year` and after `${year}-01-01`, else null.

- [ ] **Step 1: Write failing tests**

```ts
expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
expect(monthRange(2028, 2).end).toBe('2028-02-29');
expect(comparisonRange(monthRange(2026, 11), '2026-11-18')).toEqual({ start: '2026-10-01', end: '2026-10-18' });
expect(comparisonRange(monthRange(2026, 3), '2026-03-31')).toEqual({ start: '2026-02-01', end: '2026-02-28' });   // Review Focus 1
expect(comparisonRange(monthRange(2026, 12), '2026-12-01')).toEqual({ start: '2026-11-01', end: '2026-11-01' }); // Review Focus 4
expect(comparisonRange(monthRange(2026, 10), '2026-11-18')).toEqual({ start: '2026-09-01', end: '2026-09-30' }); // past month: full
expect(comparisonRange(monthRange(2026, 1), '2026-01-10')).toEqual({ start: '2025-12-01', end: '2025-12-10' });  // year wrap
expect(sinceDate('2026-04-18', 2026)).toBe('2026-04-18');
expect(sinceDate('2026-04-18', 2027)).toBeNull();
expect(sinceDate('2026-01-01', 2026)).toBeNull();
expect(sinceDate(null, 2026)).toBeNull();
expect(eachDate({ start: '2026-02-27', end: '2026-03-02' })).toEqual(['2026-02-27','2026-02-28','2026-03-01','2026-03-02']);
expect(clampRange({ start: '2026-11-01', end: '2026-11-30' }, '2026-11-18')).toEqual({ start: '2026-11-18', end: '2026-11-30' });
expect(clampRange({ start: '2026-11-01', end: '2026-11-30' }, '2026-12-01')).toBeNull();
expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/analytics-periods.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `periods.ts` with local-time `Date` maths (no UTC parsing: build dates with `new Date(y, m-1, d)`, as `parseDateString` does).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `analytics: date-range helpers`.

---

### Task 2: Projection (shared with Payments)

**Files:**
- Create: `src/lib/analytics/projection.ts`
- Modify: `src/lib/lesson-logs.ts` (export `classKey(l)`; `countClasses` uses it)
- Modify: `src/app/dashboard/payments/page.tsx:1075-1085` (replace `monthProjected`)
- Test: `src/lib/__tests__/analytics-projection.test.ts`

**Interfaces:**
- Consumes: `DateRange`, `clampRange`, `eachDate` (Task 1); `getClassesForDate`, `getBookingTotalCents` (`class-schedule.ts`); `countClasses`.
- Produces:
  - `classKey(l: Pick<LessonLog,'bookingId'|'date'|'startTime'|'locationName'>): string` (in `lesson-logs.ts`)
  - `type Tally = { classes: number; cents: number }`
  - `taughtIn(range: DateRange, logs: LessonLog[]): Tally`
  - `stillToComeByDate(range: DateRange, today: string, bookings: Booking[], exceptions: ClassException[], awayPeriods: AwayPeriod[], logs: LessonLog[]): { date: string; booking: Booking }[]`: scheduled classes from `max(range.start, today)` to `range.end`, minus any with a log matching `bookingId` + `date`. Bookings passed in must be confirmed only.
  - `stillToCome(...same args): Tally`
  - `projectPeriod(...same args): { taught: Tally; toCome: Tally; projected: Tally }`

- [ ] **Step 1: Write failing tests** (fixtures like `wallet-alerts.test.ts`: weekly Monday booking, s1 RM 60)

```ts
// range Nov 2026, today Wed 18 Nov, weekly Monday class, one log on Mon 16 Nov at 5000 (price overridden)
expect(taughtIn(nov, logs)).toEqual({ classes: 1, cents: 5000 });
expect(stillToCome(nov, '2026-11-18', [b], [], [], logs)).toEqual({ classes: 2, cents: 12000 }); // 23, 30 Nov
expect(projectPeriod(nov, '2026-11-18', [b], [], [], logs).projected).toEqual({ classes: 3, cents: 17000 });
// a past Monday (9 Nov) not marked done is NOT projected
// today's class counts as still to come until it has a log:
expect(stillToCome(nov, '2026-11-16', [b], [], [], []).classes).toBe(3);         // 16, 23, 30
expect(stillToCome(nov, '2026-11-16', [b], [], [], [log16]).classes).toBe(2);
// Review Focus 5: away period 16–20 Nov removes the 16 Nov class
expect(stillToCome(nov, '2026-11-16', [b], [], [away1620], []).classes).toBe(2);
// past range → toCome is zero
expect(stillToCome(oct, '2026-11-18', [b], [], [], []).classes).toBe(0);
// countClasses unchanged: two students' logs for one booking+date = 1 class
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/analytics-projection.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `classKey` (move the key expression out of `countClasses`) and `projection.ts`.
- [ ] **Step 4: Switch Payments.** Replace the `monthProjected` memo with `projectPeriod(monthRange, todayStr, bookings, classExceptions, awayPeriods, lessonLogs).projected.cents`. Payments' `bookings` are already confirmed-only. Its `useClassExceptions` window (±2 months) covers the month. The sub-line text stays as is.
- [ ] **Step 5: Run** `npx vitest run`. Expected: all PASS. Then `npm run lint` clean.
- [ ] **Step 6: Commit** `analytics: shared projection; Payments projected = taught + still to come`.

---

### Task 3: Cancellations

**Files:**
- Create: `src/lib/analytics/cancellations.ts`
- Test: `src/lib/__tests__/analytics-cancellations.test.ts`

**Interfaces:**
- Consumes: `DateRange`; `getDayOfWeekForDate`; `CancelReason` (`src/lib/cancel-reasons.ts`).
- Produces:
  - `type ReasonBucket = 'weather' | 'student' | 'coach' | 'other' | 'none'`
  - `interface CancellationRecord { date: string; bucket: ReasonBucket; bookingId: string; studentIds: string[] }`
  - `collectCancellations(range: DateRange, exceptions: ClassException[], allBookings: Booking[]): CancellationRecord[]`. `allBookings` = every booking of any status; soft-cancelled one-offs are found in it. Implements the spec's Cancellation definition: effective date, "would really have run" filter, `'away'` excluded, `studentIds = ex.newStudentIds ?? booking.studentIds`. Exceptions whose booking isn't in `allBookings` are skipped.
  - `reasonCounts(records: CancellationRecord[]): Record<ReasonBucket, number>`
  - `countReschedules(range: DateRange, exceptions: ClassException[], allBookings: Booking[]): number`. Spec "Rescheduled": actually moved (date differs, or `newStartTime` ≠ booking `startTime`) and passes the would-have-run filter.
  - `cancellationRate(cancelled: number, taughtClasses: number): number` → `cancelled / (cancelled + taught)`, 0 when both 0, clamped to [0, 1].

- [ ] **Step 1: Write failing tests**

```ts
// weekly Monday booking b (Nov). exceptions on Mon 16 Nov:
collect([cancel16 reason 'weather']) → [{ date:'2026-11-16', bucket:'weather', bookingId:'b', studentIds:['s1'] }]
collect([cancel16 no reason]) → bucket 'none'
collect([cancel16 reason 'away']) → []
// orphan: cancelled exception on a Tuesday for a Monday booking → []
// orphan: originalDate after booking.endDate → []
// moved then cancelled: originalDate 30 Nov, newDate 2 Dec, type cancelled
expect(collect(nov, [ex], [b])).toEqual([]); expect(collect(dec, [ex], [b])[0].date).toBe('2026-12-02');
// moved+cancelled uses newStudentIds when present
// soft-cancelled one-off: status 'cancelled', startDate=endDate='2026-11-20', cancelReason 'student' → one record bucket 'student'
// one-off with cancelReason 'away' → excluded; one-off with status 'cancelled' and no cancelReason (student deleted) → excluded
// confirmed one-off → not a cancellation
expect(countReschedules(nov, [movedDate, movedTime, plainEdit], [b])).toBe(2);
expect(cancellationRate(0, 0)).toBe(0);           // Review Focus 3
expect(cancellationRate(16, 84)).toBeCloseTo(0.16);
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/analytics-cancellations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `cancellations.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `analytics: cancellation records, reasons, reschedules, rate`.

---

### Task 4: Families (cancels most, most lessons)

**Files:**
- Create: `src/lib/analytics/families.ts`
- Test: `src/lib/__tests__/analytics-families.test.ts`

**Interfaces:**
- Consumes: `CancellationRecord`, `ReasonBucket` (Task 3); `classKey` (Task 2).
- Produces:
  - `type Family = { key: string; name: string }`
  - `familyResolver(wallets: Wallet[], students: Student[]): (studentId: string, fallbackName?: string) => Family`. Uses the first wallet whose `studentIds` contains the student, preferring non-archived wallets. Key is `w:<walletId>` and name is the wallet name. With no wallet: key `s:<studentId>`, name = student's `clientName` ?? `fallbackName` ?? `'Unknown'`.
  - `type Ranked = { name: string; count: number }`
  - `cancelsMost(records: CancellationRecord[], resolve: ReturnType<typeof familyResolver>, limit = 3): Ranked[]`. Counts only buckets `student`, `other`, `none`, with each family counted once per record. Sort by count desc, then name.
  - `mostLessons(logs: LessonLog[], resolve, limit = 3): Ranked[]`. Classes per family, deduped by `classKey`.

- [ ] **Step 1: Write failing tests**

```ts
// wallet 'Lee siblings' has s1, s2; s3 has no wallet (clientName 'Marcus')
// Review Focus 2: one record with studentIds [s1, s2] → Lee siblings count 1, not 2
expect(cancelsMost([rec([s1,s2],'student')], resolve)).toEqual([{ name: 'Lee siblings', count: 1 }]);
expect(cancelsMost([rec([s3],'weather'), rec([s3],'coach')], resolve)).toEqual([]);
expect(cancelsMost([rec([s3],'none'), rec([s3],'other')], resolve)).toEqual([{ name: 'Marcus', count: 2 }]);
// archived wallet loses to an active one containing the same student
// mostLessons: logs for s1 and s2 on the same booking+date → Lee siblings 1
// ties sorted by name; limit respected
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/analytics-families.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `families.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `analytics: family attribution for cancels-most and most-lessons`.

---

### Task 5: Likely to receive

**Files:**
- Create: `src/lib/analytics/wallet-forecast.ts`
- Test: `src/lib/__tests__/analytics-wallet-forecast.test.ts`

**Interfaces:**
- Consumes: `stillToComeByDate` (Task 2), `DateRange`.
- Produces:
  - `type RunOut = { kind: 'now' } | { kind: 'date'; date: string } | { kind: 'tab' }`
  - `interface ExpectedPayment { walletId: string; name: string; runOut: RunOut; amountCents: number | null }`
  - `likelyToReceive(args: { wallets: Wallet[]; bookings: Booking[]; exceptions: ClassException[]; awayPeriods: AwayPeriod[]; logs: LessonLog[]; today: string; monthEnd: string; lastTopUpCents: Record<string, number> }): { rows: ExpectedPayment[]; totalCents: number }`

Rules (spec "Likely to receive"):
- Skip archived wallets.
- A class's charge to wallet W = sum of `studentPriceCents[sid]` over `sid` with `studentWallets[sid] === W`.
- **Prepaid:** walk still-to-come classes in date order, then start time. The first charge the running balance can't cover gives `runOut`. It's `'now'` if that is the wallet's first upcoming charge, or if `balanceCents < 0`; otherwise `{date}`. `amountCents = usualTopUpCents ?? lastTopUpCents[id] ?? null`. A prepaid wallet with `balanceCents < 0` and nothing to come is also listed as `'now'`.
- **Tab:** `amountCents = max(0, −endBalance)`. Listed only if that's > 0; `runOut = {kind:'tab'}`.
- `totalCents` = sum of non-null amounts.
- Row order: `now`, then by date, then `tab`; ties by name.

- [ ] **Step 1: Write failing tests**

```ts
// prepaid, balance 12000, Mondays 6000, today Mon 16 Nov, monthEnd 30 Nov → covers 16, 23; runs out 30 Nov
expect(rows[0].runOut).toEqual({ kind: 'date', date: '2026-11-30' });
// usualTopUpCents 60000 → amount 60000; no usual, lastTopUp 48000 → 48000; neither → null and total excludes it
// balance 3000 < first charge 6000 → { kind: 'now' }
// balance 50000, only 3 classes → not listed
// Review Focus 2: siblings s1 (6000) + s2 (4000) both on W in one class → charge 10000 per class
// tab wallet balance -2000, two classes 6000 → amount 14000, runOut tab
// archived wallet ignored; ordering now → date → tab
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/analytics-wallet-forecast.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `wallet-forecast.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `analytics: likely-to-receive wallet simulation`.

---

### Task 6: Year statistics

**Files:**
- Create: `src/lib/analytics/year.ts`
- Test: `src/lib/__tests__/analytics-year.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`DateRange`, `eachDate`, `monthRange`, `taughtIn`, `stillToCome`, `classKey`); `isDateInAwayPeriod`.
- Produces:
  - `yearForecast(a: { year: number; today: string; logs; bookings; exceptions; awayPeriods; cancelRate: number }): { taught: Tally; toCome: Tally /* after rate, rounded */; forecast: Tally }`. `toCome` = still-to-come from today to 31 Dec × (1 − rate). Classes are rounded with `Math.round`, cents with `Math.round`.
  - `monthlyTaught(a: { year; today; logs; bookings; exceptions; awayPeriods; cancelRate; firstLogDate: string | null }): { month: number; cents: number; kind: 'actual' | 'forecast'; partial: boolean }[]`. Covers the months from the first-log month (if it's in this year) or January, through December. Months before today's month and today's own month are `actual` (`taughtIn`); later months are `forecast` (still-to-come × (1 − rate)). `partial` is true for the first-log month when `firstLogDate` isn't the 1st.
  - `daysSplit(range: DateRange, logs: LessonLog[], awayPeriods: AwayPeriod[]): { worked: number; timeOff: number; other: number }`. The caller passes `range` already clamped to since-date…today.
  - `minutesTaught(logs: LessonLog[]): number`: per distinct `classKey`, end − start.
  - `classesByWeekday(logs): Record<DayOfWeek, number>`
  - `busiestSlot(logs): { day: DayOfWeek; hour: number } | null`: the most common (weekday, start hour) pair across distinct classes.
  - `studentStats(a: { year: number; today: string; yearLogs: LessonLog[]; laterLogs: LessonLog[]; students: Student[]; confirmedBookings: Booking[]; isFirstYear: boolean }): { taught: number; newThisYear: number | null; stopped: number }`. `newThisYear` is null when `isFirstYear`; otherwise it's students taught this year whose `createdAt` year equals `year`. *(Plan decision: student `createdAt` stands in for "first-ever log". It's equivalent here because students are created when first booked, and it avoids reading all past logs. Flag this to the coach at hand-off.)* `stopped`, current year: taught this year and in no confirmed booking that's still running (`!endDate || endDate >= today`). Past year: taught this year and absent from `laterLogs`.

- [ ] **Step 1: Write failing tests**

```ts
// forecast (cents): taught 7_456_000 so far, raw still-to-come 1_406_000, rate 0.16 → toCome 1_181_040, forecast 8_637_040
// Review Focus 3: no logs, no bookings → forecast { classes: 0, cents: 0 }, monthlyTaught all zeros, busiestSlot null, minutesTaught 0
// monthlyTaught 2026, today 2026-11-18, firstLog 2026-04-18 → months 4..12, Apr partial, Nov actual, Dec forecast
// daysSplit 1–10 Nov: logs on 1,2,3; away 5–7; a log on 6 (taught inside time off) → worked 4, timeOff 2, other 4  (Review Focus 5)
// minutesTaught: two students' logs for the same 10:00–11:00 class → 60
// busiestSlot: 3 Sat 09:00 classes, 2 Sun 09:00 → { day:'saturday', hour: 9 }
// studentStats: isFirstYear → newThisYear null; current-year stopped excludes a student with an open-ended booking
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/analytics-year.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `year.ts`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: all PASS.
- [ ] **Step 5: Commit** `analytics: year forecast, monthly bars, days, hours, weekdays, students`.

---

### Task 7: Data loading

**Files:**
- Create: `src/lib/firestore-mappers.ts`. Move `bookingFromDoc` here from `useCoachData.ts`; add `lessonLogFromDoc(id, data)` and `exceptionFromDoc(id, data)`, extracted from the inline maps in `useLessonLogs` / `useClassExceptions`, with those hooks switched over (behaviour unchanged, including the raw `walletId` pass-through).
- Create: `src/lib/analytics/fetch.ts`
- Create: `src/hooks/useAnalyticsData.ts`
- Modify: `firestore.indexes.json`. Add `transactions` collection index `type ASC, date ASC`.

**Interfaces:**
- Produces (`fetch.ts`, all one-time `getDocs`):
  - `fetchLessonLogs(coachId: string, range: DateRange): Promise<LessonLog[]>`: `where date >= start, <= end`
  - `fetchExceptions(coachId: string, range: DateRange): Promise<ClassException[]>`: `where originalDate` range, **plus** a second query `where newDate` range, merged by id. A moved-then-cancelled class can land in range by `newDate` alone.
  - `fetchTopUps(coachId: string, walletIds: string[], range: DateRange): Promise<{ walletId: string; amountCents: number; date: string }[]>`: per wallet `where type == 'top-up', date >= , <=`, fanned out with `Promise.all`; amounts via `centsFromLegacy`.
  - `fetchLastTopUps(coachId: string, walletIds: string[]): Promise<Record<string, number>>`: per wallet `where type == 'top-up' orderBy createdAt desc limit 1` (existing index), `Promise.all`.
  - `fetchFirstLogDate(coachId: string): Promise<string | null>`: `orderBy date asc limit 1`.
- Produces (`useAnalyticsData.ts`):
  - `useAnalyticsData(coachId: string | undefined, range: DateRange | null, walletIds: string[]): { logs: LessonLog[]; exceptions: ClassException[]; topUps: {walletId; amountCents; date}[]; loading: boolean; error: boolean }`. It fetches when `range` or `walletIds` change and caches results in a module-level `Map` keyed by `coachId|start|end|walletIds`, so switching back to a period costs no reads. Range null → idle.
  - `useFirstLogDate(coachId): string | null | undefined` (undefined while loading).

- [ ] **Step 1: Move mappers**, switch the three hooks to them, run `npx vitest run` + `npx tsc --noEmit` (ignore the stale `.next` `reset-account` error). Expected: no new errors.
- [ ] **Step 2: Implement** `fetch.ts` and `useAnalyticsData.ts`. There are no unit tests (Firestore I/O); they're verified by the page in Task 9.
- [ ] **Step 3: Add the index** to `firestore.indexes.json` and deploy: `firebase deploy --only firestore:indexes` (needs network; run unsandboxed). Expected: "Deploy complete!".
- [ ] **Step 4: Commit** `analytics: range fetchers, analytics data hook, shared doc mappers, top-up date index`.

---

### Task 8: Page shell + nav

**Files:**
- Modify: `src/components/paper/Icons.tsx`. Add `IconChart`: three vertical bars, in the existing `Icon` wrapper style.
- Modify: `src/app/dashboard/layout.tsx:24-29`. Add `{ href: '/dashboard/analytics', label: 'Analytics', icon: IconChart }` after Payments.
- Create: `src/app/dashboard/analytics/page.tsx`
- Create: `src/app/dashboard/analytics/_components/StatCard.tsx`, `DeltaChip.tsx`, `ReasonBars.tsx`, `RankList.tsx`

**Interfaces:**
- `DeltaChip({ diff: number; format: (n:number)=>string; vsLabel: string; lowerIsBetter?: boolean })`: renders "▲ 2 vs 1–18 Oct". It uses good tone when the change is good (higher, or lower when `lowerIsBetter`), bad tone otherwise, and neutral ink-3 for 0 ("= vs …").
- `StatCard({ label: string; value: ReactNode; sub?: ReactNode; progress?: number /*0–1*/; delta?: ReactNode })`
- `ReasonBars({ counts: Record<ReasonBucket, number>; showFootnote: boolean })`: rows Weather, Student, Me, Other, "No reason*" (only if > 0). The footnote reads "* before reasons were tracked (18 Nov 2026)".
- `RankList({ title: string; items: Ranked[]; unit?: string })`: hidden when empty.
- `page.tsx` state: `view: 'month' | 'year'` (default `'month'`), `month: { year: number; month: number }` (default today's), `year: number`. The stepper is disabled past today's period and before the first-log period (`useFirstLogDate`). Loads `useBookings(coachId)` (all statuses; confirmed derived with `status === 'confirmed'`), `useWallets`, `useStudents`, `useAllAwayPeriods`. Renders `<MonthView …/>` or `<YearView …/>` (Tasks 9–10) with the computed props. A loading spinner matches `bookings/page.tsx`. On `error`, a Paper card: "Couldn't load analytics. Try again later."

- [ ] **Step 1: Implement** the icon, nav item, shared components, and the page shell rendering placeholder views.
- [ ] **Step 2: Verify** `npm run lint` clean, `npm run build` passes (unsandboxed, for Google Fonts). The phone bottom bar shows 6 tabs without wrapping at 375px wide.
- [ ] **Step 3: Commit** `analytics: page shell, nav item, shared stat components`.

---

### Task 9: Month view

**Files:**
- Create: `src/app/dashboard/analytics/_components/MonthView.tsx`
- Modify: `src/app/dashboard/analytics/page.tsx` (wire it)

**Interfaces:**
- Consumes: `monthRange`, `comparisonRange`, `clampRange` (T1); `projectPeriod`, `taughtIn` (T2); `collectCancellations`, `reasonCounts` (T3); `familyResolver`, `cancelsMost` (T4); `likelyToReceive` (T5); `useAnalyticsData` (T7); components from T8.
- Data range: `{ start: comparison.start, end: month.end }`, a single fetch covering both periods.

Content (spec "Month view" and mockup v2 without the forecast card):
- Header: month name + year; sub "Compared with 1–18 Oct · 18 of 30 days gone" (current) or "Compared with October" (past).
- Four `StatCard`s in a 2×2 grid on phone and 4 across at `lg`:
  - **Classes:** current month: value "64 / 108" (taught / projected), `progress` = taught ÷ projected; past month: taught only. Delta vs comparison taught classes.
  - **Taught (RM):** same shape, in RM.
  - **Received (RM):** sum of top-ups in the month up to today (current) or the full month; sub "16 top-ups"; delta vs comparison.
  - **Likely to receive** (current month only): "+RM 4,700", sub "N wallets run out before 30 Nov", plus "Month total if all pay: RM X" (received + likely).
- **Wallets running out this month** (current only): rows from `likelyToReceive`, first 4 then a "+ N more" button that expands. Chip: `now` → "Out now" (bad tone); `date` → "~21 Nov" (warn tone); `tab` → "Pays after" (neutral). Amount shows "—" when null.
- **Cancelled this month:** count with `DeltaChip lowerIsBetter`, `ReasonBars`, then `RankList` "Cancels most" ("4 this month"). For the current month every cancellation figure uses the range clamped to today (`clampRange(month, undefined, today)`), and so does the comparison.

- [ ] **Step 1: Implement** `MonthView` with all values computed in `useMemo` in `page.tsx` or the view. No Firestore calls in the view.
- [ ] **Step 2: Verify locally** on the test account (`npm run dev`, log in as testcoach): the numbers render, the stepper moves between months, past months hide Likely to receive and Wallets running out, and Taught RM for this month equals Payments' Taught card.
- [ ] **Step 3: Commit** `analytics: month view`.

---

### Task 10: Year view

**Files:**
- Create: `src/app/dashboard/analytics/_components/YearView.tsx`
- Modify: `src/app/dashboard/analytics/page.tsx`

**Interfaces:**
- Consumes: T1 (`yearRange`, `sinceDate`, `clampRange`, `addDays`); T2; T3 (`collectCancellations`, `reasonCounts`, `countReschedules`, `cancellationRate`); T4 (`cancelsMost` isn't used here; `mostLessons` is); T6 (all); T7.
- Data range: current year: `{ start: min(yearStart, addDays(today, -89)), end: yearEnd }`, where logs and top-ups only exist up to today and exceptions are needed up to 31 Dec for the forecast. Past year: `{ start: yearStart, end: today }` (later logs feed `stopped`). This is only fetched while the Year view is shown.
- Cancellation rate: `cancellationRate(collectCancellations({today−89…today}).length, taughtIn({today−89…today}).classes)`.

Content (spec "Year view" and mockup v4):
- Header "2026" plus a "since 18 Apr" label from `sinceDate(firstLogDate, year)`, formatted with `formatDateShort`-style "18 Apr".
- **Forecast card** (current year only): forecast RM, a bar showing taught vs to-come, and the line "taught RM X so far + about RM Y still to come (after Z% usual cancellations)".
- Four `StatCard`s: Classes taught (sub "~N by 31 Dec" current year) · Hours coached (`minutesTaught/60` rounded, sub "avg X h a working day" = hours ÷ worked days, 1 decimal) · Taught RM (sub "avg RM X a class") · Received RM (sub "N top-ups").
- **Monthly bars:** solid bars for `actual`, dashed `var(--line-2)` outline for `forecast`, "*" on partial with a footnote. Tapping an actual bar sets `view='month'` and `month`.
- **Days:** stacked bar + three rows (Worked / Time off (planned) / Other days off), range = `clampRange(yearRange, sinceDate ?? undefined, today)`.
- **Cancelled & moved:** Cancelled count, Rescheduled count, `ReasonBars`.
- **Classes by day:** 7 rows Mon→Sun with bars and counts; sub "Busiest: Saturday · busiest time Sat 9 am" (hidden if `busiestSlot` is null).
- **Students:** rows Taught this year · New this year (hidden when null) · Stopped this year. `RankList` "Most lessons".

- [ ] **Step 1: Implement** `YearView`.
- [ ] **Step 2: Verify locally:** 2026 shows "since …"; the forecast line's numbers add up (taught + to-come = forecast); tapping a month bar opens that month; the year stepper can't go past 2026 or before the first-log year.
- [ ] **Step 3: Commit** `analytics: year view`.

---

### Task 11: Ship and check live

- [ ] **Step 1:** `npx vitest run` (all pass), `npm run lint` (clean), `npm run build` (passes, unsandboxed).
- [ ] **Step 2:** Push; poll `gh api repos/Wong-WS/coach-app/commits/<sha>/status` until Vercel is `success`.
- [ ] **Step 3:** On the live site (https://coach-simplify.com) with the test account: open Analytics on a phone-width window and check Month and Year views render with no console errors (especially no "requires an index" Firestore error).
- [ ] **Step 4:** Update `NOTES.md`: mark ⭐ End-of-year summary Step 2 ✅ (2026-11-18 or the ship date) with a one-line pointer to `/dashboard/analytics`. Update CLAUDE.md Project Structure (analytics route + `src/lib/analytics/`) and the composite-indexes list. Commit + push.

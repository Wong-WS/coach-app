# Analytics page — design

Date: 2026-11-18
Status: approved layout (mockups v2 + v4 in `.superpowers/brainstorm/32147-1794980662/content/`); reviewed by a builder check; awaiting the coach's approval

## Why

The coach (solo swimming coach, teaches every day) wants one place to see how the business is actually doing: what was taught, what was paid, what's likely to come in, how much gets cancelled and by whom, and where the year is heading. Today the only numbers are the two small "Taught / Received" stat cards on Payments. This page is also where the end-of-year summary lives (NOTES.md ⭐ "End-of-year summary", Step 2). Step 1 — recording cancellations and reasons — shipped 2026-11-18 (commit `2dec89b`).

The coach's words: "I need to see accurate numbers." Accuracy matters more than richness. They also said, about everything: "keep it stupid simple as long as it works." The page can have a lot on it; each number must be simple to explain.

## Goals

- **Month view** (default): this month's classes and RM taught vs projected, money received, money likely to come in from wallets running out, cancellations by reason, students who cancel most, comparison with last month.
- **Year view**: year-end forecast, yearly totals (classes, hours, RM taught, RM received), RM by month, days worked vs off, cancellations + reschedules, classes by day of week, students.
- Numbers agree with the rest of the app (same definitions as Payments where they overlap).
- Works on a phone first (coach uses it on the go), fine on desktop.

## Non-goals

- Linking make-up classes to the cancellation they replace (explicitly rejected as too complicated). A rained-out class is a cancellation; its make-up is a class taught.
- Recording anything new. Everything comes from data the app already stores.
- Export, sharing, charts library, editing data from this page, portal-facing analytics, multi-coach.
- Back-filling history lost before the app started recording it.

## Anti-goals (it fails if…)

- A number disagrees with Payments or the dashboard without an obvious reason.
- The page is slow or burns the Firestore free-tier read quota (see Constraints).
- A number can't be explained in one sentence.

## Known data limits (show honestly, don't fix)

- Coach started using the app 18 Apr 2026. 2026 totals are partial; April is a partial month.
- One-off classes cancelled before 2026-11-18 were deleted and can't be counted, so 2026 cancellation counts and the cancellation rate run slightly low.
- Cancellation reasons exist only from 2026-11-18. Earlier cancellations show as "No reason".
- Moving a one-off class to another date leaves no record, so reschedule counts cover weekly classes only.
- A day taught but never marked done looks like a day off.

## Constraints

- **Firestore Spark (free) plan: 50k reads/day**, shared by all coaches. Normal use is far below it, but a page that re-reads a year of data on every visit could matter. Year data (~1,000+ lesson logs, ~250 top-ups, exceptions, bookings) should be read once per page visit (one-time reads, not live listeners), and only when the Year view is opened.
- **The live account has ~70 wallets.** Never `await` per wallet in a loop — that froze the UI for minutes before (see `collectWalletLedgerEntries` in `src/lib/wallet-ledger.ts`). Fan out with `Promise.all` or avoid per-wallet queries.
- Paper & Ink design tokens only (no hex), `.mono`/`.tnum` on money and dates, `<Modal>` never `window.confirm` — per CLAUDE.md. Card lists uniform height; badges spaced.
- Logic goes in pure functions in `src/lib/` with vitest tests (project convention: `src/lib/__tests__/`).

## Where it lives

New route `/dashboard/analytics`, added as a 5th item **"Analytics"** in the sidebar and mobile bottom nav (`navItems` in `src/app/dashboard/layout.tsx`). *(My call — the coach didn't object to the guess.)*

Top of page: **Month | Year** switch, plus a period stepper (‹ prev · current · next ›). Default: Month view, current month. The stepper can't go past the current month/year. Years available: from the year of the first-ever lesson log to now.

## Shared definitions

These are the rules every number on the page follows.

- **Class** = one booking on one date. Lesson logs are written one per student, so dedupe with `countClasses` (`src/lib/lesson-logs.ts`). Same rule as the Payments "Taught" card.
- **Taught (RM)** = sum of `priceCents` of lesson logs dated in the period. Same as Payments.
- **Received (RM)** = sum of wallet transactions with `type: 'top-up'` and `date` in the period. Same as Payments. Refunds and adjustments are not counted.
- **Scheduled classes** for a date = `getClassesForDate(date, confirmedBookings, exceptions, awayPeriods)` (`src/lib/class-schedule.ts`). This already drops cancelled dates, applies reschedules, and skips time off.
- **Still to come** (current period only) = scheduled classes from today to the period end that don't already have a lesson log for that booking+date. Today's not-yet-done classes count as still to come. Past days not marked done are *not* projected — they just weren't taught.
- **Projected** = taught so far + still to come (classes, or their RM via `getBookingTotalCents`).
  - **Payments switches to this definition too.** Its Taught card's "of RM X projected" currently uses `getScheduledRevenueForDateRange` over the whole month. That counts past days never marked done, at schedule price, so the two pages would disagree. Put the projection in one shared function in `src/lib/analytics.ts` and use it in both places. *(My call: it keeps the "numbers agree" goal, and the new definition is the more accurate one.)*
- **Cancellation** = a `classExceptions` doc with `type: 'cancelled'` whose **effective date** is in the period, **plus** a soft-cancelled one-off booking (`status: 'cancelled'`, `startDate === endDate`, has `cancelReason`) whose `startDate` is in the period. **Excluded:** anything with reason `'away'`. Time off is the coach's own choice and shows under Days, not as a cancellation. *(My call. It also keeps the rate consistent, because weekly classes skipped by time off were never recorded as cancellations anyway.)*
  - **Effective date** = `newDate` if the cancelled exception has one (a class that was moved, then cancelled, counts on the day it was moved to, the day it would actually have run), otherwise `originalDate`.
  - **Only count it if the class would really have run that day.** For an exception without `newDate`, the booking must exist, its `dayOfWeek` must match `originalDate`, and `originalDate` must fall inside its `startDate`/`endDate`. "Edit this + future" splits or moves bookings but leaves old exceptions behind, and those orphans must not count. Apply the same filter to Rescheduled. *(My call, for accuracy. It may make July slightly lower than the count the coach checked before.)*
  - **Current month: count only cancellations up to today**, so it compares fairly with "1–18 Oct". This applies to the count, the reason bars and Cancels most. *(My call.)*
- **Reason** buckets: Weather, Student, Me (`coach`), Other, and "No reason" (missing `reason`/`cancelReason`, i.e. before 2026-11-18). Show the footnote "* before reasons were tracked (18 Nov 2026)" whenever "No reason" is non-zero.
- **"Since" label**: if the coach's first-ever lesson log falls after 1 Jan of the shown year, label the year "since 18 Apr" (that date). Otherwise no label. Computed, never hard-coded; it disappears by itself from 2027.
- **Comparison with last period**:
  - Past month: full month vs full previous month.
  - Current month: so far vs **the previous month up to the same day** (e.g. 1–18 Nov vs 1–18 Oct), labelled that way ("vs 1–18 Oct"). *(My call. The mockup compared to all of October, but that makes every metric look down mid-month.)*
  - Year view: no comparison in this version.
  - Up arrow + green tone when higher, down + red when lower. Cancellations are the exception: lower is good, so green when lower.

## Month view

Matches mockup v2 minus the forecast card, which moves to the Year view.

1. **Header**: "November 2026", sub "Compared with 1–18 Oct · 18 of 30 days gone" (current month) or "Compared with October" (past month).
2. **Four stat cards**:
   - **Classes**: current month shows "taught / projected" with a progress bar (taught ÷ projected); past month shows the final count. Delta vs comparison period.
   - **Taught (RM)**: same shape as Classes.
   - **Received (RM)**: amount + number of top-ups. Delta.
   - **Likely to receive** (current month only; hidden for past months): RM total of expected top-ups, sub "N wallets run out before 30 Nov", and "Month total if all pay: received + likely".
3. **Wallets running out this month** (current month only): one row per wallet expected to need money before month end, sorted by run-out date, soonest first. Row: wallet name · chip ("Out now" in bad tone, or "~21 Nov" in warn tone) · expected amount. Show the first 4 and "+ N more" to expand. Uniform single-line rows.
4. **Cancelled this month**: total with delta; reason bars; **"Cancels most"**: top 3 students by cancellation count this month.

### Likely to receive — rule *(my call; the coach approved the idea, not this exact formula)*

For each wallet that isn't archived:

- Walk the still-to-come classes from today to month end in date order. For each class, the wallet's charge is the sum of `studentPriceCents[sid]` for students whose `studentWallets[sid]` is this wallet. Subtract it from a running balance that starts at `wallet.balanceCents`.
- The simulation starts from today's balance, so top-ups already received this month are already in it. A wallet that topped up on 5 Nov and runs out again on 27 Nov **is** listed and expected to pay again. *(My call.)*
- **Prepaid wallet** (not `tabMode`): it "runs out" on the first class whose charge the running balance can't cover (or "Out now" if today's balance already can't cover its next class). Expect **one** top-up of `usualTopUpCents`, falling back to the wallet's most recent top-up amount. If it has neither, list the wallet with "—" for the amount and add nothing to the total. One top-up per wallet per month, no repeat refills. Keep it simple.
- **Tab wallet** (`tabMode`): it pays after lessons. Expect what it will owe at month end: `max(0, −runningBalanceAtMonthEnd)`. Its run-out chip shows "Pays after" instead of a date.
- Wallets with nothing still to come and a balance ≥ 0 are not listed.
- The rule is wallet-level, so shared family wallets work naturally.

### Cancels most — rule *(my call)*

**Counted by family (wallet), as the coach decided.** Each student maps to the wallet whose `studentIds` contains them, so the row shows the wallet name, the same one as on the wallet list. A student in no wallet is counted under their own name.

Each cancellation adds 1 to each *family* on that class (the booking's `studentIds`, or the rescheduled override's `newStudentIds` if the cancelled exception backs a reschedule). Two siblings from one wallet in the same class count once. Count only cancellations that could be the student's doing: reasons **Student, Other, and No reason**. Weather and Me are not the student's fault. Top 3, ties broken by name. Hidden if empty.

## Year view

Matches mockup v4.

1. **Header**: "2026" + "since 18 Apr" label where applicable.
2. **Year-end forecast** (current year only):
   - **Forecast RM** = taught RM so far this year + still-to-come RM from today to 31 Dec × (1 − cancellation rate).
   - **Cancellation rate** = cancellations ÷ (cancellations + classes taught) over the last 90 days (cancellations per the shared definition, so `'away'` is excluded). Clamp to 0–1. If there are no classes in the window, use 0.
   - Display: big number, a bar showing so-far vs still-to-come, and the working in one line: "taught RM X so far + about RM Y still to come (after Z% usual cancellations)". Time off already planned is excluded automatically through `getClassesForDate`.
   - Classes get the same forecast for the Classes card's sub-line ("~1,050 by 31 Dec").
3. **Four stat cards**: Classes taught (sub: forecast by 31 Dec, current year only) · Hours coached (sub: average per working day) · Taught RM (sub: average RM per class) · Received RM (sub: number of top-ups).
   - **Hours** = sum over *classes* (deduped, not per student) of end − start from the lesson logs' `startTime`/`endTime`.
4. **RM taught, month by month**: one bar per month from the first month with data (or Jan) to Dec. Past months solid. Current month solid with actual so far. Future months dashed, using still-to-come × (1 − rate) for each month. A partial first month gets "*" and a footnote. Tapping a past or current bar switches to the Month view for that month.
5. **Days** (from the year's start, or the "since" date, up to today): Worked = distinct dates with ≥1 lesson log · Time off = dates inside any away period (a date that's both counts as Worked) · Other days off = the rest. Shown as a stacked bar plus three rows.
6. **Cancelled & moved**: cancellations (shared definition) · **Rescheduled** = `classExceptions` with `type: 'rescheduled'`, `originalDate` in the year, passing the "would really have run" filter, and **actually moved**: `newDate !== originalDate`, or a `newStartTime` that differs from the booking's `startTime`. Plain one-date edits (students, price, note, name, location only) also write `type: 'rescheduled'` and must not count. *(My call.)* · reason bars + footnote.
7. **Classes by day**: all 7 days, Monday→Sunday, classes taught per weekday (the coach teaches every day; weekends are normal days). Sub-line: busiest day, and busiest start time = the most common class start hour (e.g. "Sat 9 am"). *(Simplified from the mockup's "9–11 am" range — my call.)*
8. **Students**:
   - Taught this year = distinct `studentId` in the year's logs.
   - New this year = students whose first-ever log is in this year. **Hidden in the coach's first year**, where it would equal everyone.
   - Stopped = taught this year with no confirmed scheduled class from today onward (current year). For a past year: taught that year and not in any later year.
9. **Most lessons**: top 3 **families (wallets)** by number of classes in the year. Same student→wallet mapping as Cancels most; a student in no wallet is counted under `studentName`. Dedupe per family per class, so two siblings in one class count as 1.

## Data needed

- Month view (current or past month M): lesson logs for M and M−1; top-ups for M and M−1; exceptions for M and M−1; cancelled one-off bookings for M and M−1; confirmed bookings, wallets, away periods (current month also needs these for still-to-come).
- Year view: lesson logs for the year, plus the earliest-ever log (for the "since" label and New-this-year; one query ordered by date, limit 1, is enough for the label); top-ups for the year; exceptions for the year; cancelled bookings (any status) so cancelled exceptions can be attributed to students; plus, for the forecast, the last-90-days window, which may cross into the previous year.
- Existing hooks are date-windowed (e.g. `useClassExceptions` loads ±2 months; `useLessonLogs` takes `monthsBack`). The builder will likely need range-based one-time fetchers. Composite indexes may be required (e.g. `transactions` on `type` + `date`); add them to `firestore.indexes.json` and deploy with `firebase deploy --only firestore:indexes`.
- **Stopped (past year)** needs logs after that year. Acceptable to load all logs from that year to now, or drop the past-year variant if reads get heavy (builder's call; tell the coach).

## Left to the builder

- File and component structure (expected: `src/app/dashboard/analytics/page.tsx` + `_components/`, pure logic in `src/lib/analytics.ts` with tests).
- Fetch mechanics, caching within a visit, loading and empty states.
- Exact styling within Paper & Ink, mobile breakpoints (the four stat cards go 2×2 on phone), icon choice for the nav item.
- Rounding and number formatting, following existing `formatRM` / `formatCents`.

## Testing

Unit-test the pure functions: projected and still-to-come, likely-to-receive (prepaid run-out, tab owing, usual-top-up fallback, no-fallback "—"), cancellation counting (exceptions + soft-cancelled one-offs, `'away'` excluded, "No reason" bucket), cancels-most attribution, cancellation rate, forecast, days split, hours dedupe, the "since" label, same-day previous-month comparison ranges (31st vs a 30-day month, February).

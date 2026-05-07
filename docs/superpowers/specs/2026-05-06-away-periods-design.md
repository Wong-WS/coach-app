# Away Periods (Time Off) Design

**Date:** 2026-05-06
**Status:** Approved (brainstorming complete, ready for plan)

## Problem

When a coach travels or takes extended leave (e.g. a month-long holiday), they currently have to cancel each class one by one, every day. The existing per-date `classException` flow is fine for one-off changes but turns into busywork — and clutter — for a whole month away.

The coach also wants the historical record to *show* the time off when scrolling back ("oh, I was away the whole of May"), not just a silent gap.

## Goals

- One action sets the coach as away for a date range. All recurring classes in the range are skipped.
- The away period is a persistent, labelled artefact ("Bali holiday — May 1–30") that remains visible in the calendar/schedule when looking back months later.
- Ad-hoc lessons and rescheduled exceptions inside the range are surfaced so the coach can decide which to also cancel.
- Wallet portal sees no spurious "Low balance" suggestions caused by classes the coach won't actually deliver.

## Non-goals

- Half-day or partial-time blocking. Away periods are full days only.
- Restoring deleted ad-hoc bookings if the coach later shrinks the away range.
- Public-holiday presets, recurring annual leave, or templated time-off categories.
- Notifying students that the coach is away (no comms layer in v1).

## Approach

A coach-level `awayPeriods` doc. Schedule helpers and wallet-health logic treat days inside an active period as "no class — coach away." The doc persists indefinitely so the historical record is preserved.

### Data model

New collection: `coaches/{coachId}/awayPeriods/{id}`

```
startDate: string    // YYYY-MM-DD, inclusive
endDate:   string    // YYYY-MM-DD, inclusive
label?:    string    // optional free text, e.g. "Bali holiday"
createdAt: timestamp
updatedAt: timestamp
```

`src/types/index.ts`:

```ts
export interface AwayPeriod {
  id: string;
  startDate: string;
  endDate: string;
  label?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Hooks & helpers

**`src/hooks/useCoachData.ts`** — add `useAwayPeriods(coachId)`. `onSnapshot` listener, sliding ±4-month window keyed off `startDate` (matches the existing `useClassExceptions` window). Sorted by `startDate` ascending.

**`src/lib/away-periods.ts`** (new):
- `isDateInAwayPeriod(date: string, awayPeriods: AwayPeriod[]): AwayPeriod | null`
- `awayPeriodsOverlapping(start: string, end: string, awayPeriods: AwayPeriod[], excludeId?: string): AwayPeriod[]`

**`src/lib/class-schedule.ts`** — extend signatures with an optional `awayPeriods` parameter:
- `getClassesForDate(date, bookings, exceptions, awayPeriods?)` — if date is inside an away period, return `[]` immediately, before any booking/exception logic.
- `getScheduledRevenueForDateRange(start, end, bookings, exceptions, awayPeriods?)` — same skip per day.

The parameter is optional to keep call sites compiling during the rollout, but every existing caller will be updated to pass `awayPeriods`.

**`src/lib/wallet-alerts.ts`** — `getWalletHealth` accepts `awayPeriods` and skips any lookahead day that falls inside one. Empty/owing/low calculations no longer assume classes happen during the trip.

**`src/lib/portal-data.ts`** — `fetchPortalData` adds `awayPeriods` to its parallel fetch (same 4-month window as exceptions) and passes them to `getWalletHealth`.

### UI surfaces

#### Settings → "Time off" section

`src/app/dashboard/settings/page.tsx` gets a new card above Danger Zone.

- Heading: "Time off". Subtitle: "Block out vacations, conferences, etc."
- "Add time off" primary button → opens `AwayPeriodModal`.
- List of away periods, sorted **upcoming/current first, then past**. One row per period:
  - `May 1 – May 30, 2026` · `Bali holiday` · status chip (`Upcoming` / `Now` / `Past`)
  - Single line per CLAUDE.md card-list rule. Status chip on the right with `gap-2` between badges.
  - Tap to open the same modal in edit mode. Past entries are still editable/deletable.

#### Add/Edit Time Off modal

New component: `src/app/dashboard/settings/_components/AwayPeriodModal.tsx`. Uses the app's `<Modal>` component.

Fields:
- **Start date** — `DatePicker`.
- **End date** — `DatePicker`, validated `>= startDate`.
- **Label** — optional free text.

**Conflict resolver** (live-computed below the date inputs whenever the range is valid):

- Heading: "While you're away, these lessons are scheduled:"
- One row per ad-hoc booking AND per `rescheduled` exception whose `newDate` falls in the range:
  - Format: `Mon Jun 8 · 4:00 PM · Adam at Studio A` with a checkbox (default checked).
- If the list is empty, the conflict resolver section is hidden.
- Footer note (always visible when at least one recurring class exists in the range): *"Recurring weekly classes in this range will be skipped automatically — no need to cancel each one."*

Recurring-class occurrences are NOT listed individually in the resolver — they're skipped automatically by `getClassesForDate`. Only items requiring an explicit choice (ad-hoc bookings + rescheduled exceptions) appear.

**Save behaviour** — single `writeBatch`:

1. Create or update `awayPeriods/{id}` doc with `updatedAt: serverTimestamp()`.
2. For each ticked **ad-hoc booking**: delete the booking doc and any `classExceptions` referencing it (matches existing one-time cancel logic at `dashboard/page.tsx:501-513`).
3. For each ticked **rescheduled exception**: update `type` from `'rescheduled'` to `'cancelled'`. Clear `newDate`, `newStartTime`, `newEndTime`, `newLocationId`, `newLocationName`, `newNote`, `newClassName`, `newStudentIds`, `newStudentPrices`, `newStudentWallets`. The class is now permanently cancelled — neither original-date nor moved-to-date occurrence happens.

**Editing rules:**
- **Extending into the future** — re-runs the conflict resolver, but only for newly-included dates (existing decisions stand).
- **Shrinking** — no resolver. Inline note: *"Shortening the range won't restore lessons you already cancelled."*
- **Past dates** — no floor on `startDate`. The coach can backfill historical away periods if desired.
- **Length cap** — soft cap at 365 days. If exceeded, show confirmation modal: *"That's over a year. Are you sure?"* Does not block.

**Delete** (footer button in edit modal):
- Uses `<Modal>` confirmation (CLAUDE.md: never `window.confirm`).
- Body: *"Delete '[label or date range]'? Lessons cancelled because of this away period won't be restored."*
- On confirm: deletes only the away period doc. No reversal of the ad-hoc deletions or exception type changes from creation.

**Overlap prevention** — on save, run `awayPeriodsOverlapping(startDate, endDate, others, excludeId=this.id)`. If non-empty, block with inline error: *"Overlaps with [label or date range]. Edit that one instead."* No partial overlaps allowed.

#### Dashboard treatment

`src/app/dashboard/page.tsx` — when today's date is inside an active away period:

- "Today's Classes" header gets a sibling chip: `Away — Bali holiday`.
- Class list area shows an empty state: large "You're away" + label + dates + a small "Edit in Settings" link.
- Bulk-mark-done UI is hidden (nothing to mark).
- The week strip continues to navigate normally; non-away days show classes as usual.
- For non-today dates inside an away period, the day's empty state shows the same "Away — [label]" treatment.

#### Schedule page

No changes. The Schedule page (`src/app/dashboard/bookings/page.tsx`) is a recurring-weekly **template** view (bookings grouped by `dayOfWeek`, not a calendar). Date-based overlays don't apply. The historical record lives in:
- **Settings → Time off** — the canonical list of past/current/upcoming away periods.
- **Dashboard date-picker** — navigating to a specific past date inside an away period shows the "You're away" empty state.

(Spec originally proposed an overlay here on the assumption that the page rendered calendar dates; it doesn't, so the overlay was dropped during implementation.)

### Security rules

`firestore.rules` — owner-only read/write on `coaches/{coachId}/awayPeriods/{id}`, same pattern as other coach subcollections. No portal access (the portal needs the data via Admin SDK in `fetchPortalData`, which bypasses owner rules).

### Indexes

No composite indexes needed for v1. Queries are by `startDate` range only, which Firestore handles with the default single-field index.

## Edge cases

- **Concurrency.** Two tabs editing the same period: last write wins. Acceptable for a solo coach.
- **Mark-as-done inside away period.** Cannot happen via UI — `getClassesForDate` returns `[]` so the class isn't in the list. No extra guard added.
- **Realtime updates.** `useAwayPeriods` is an `onSnapshot` listener; creating an away period in Settings updates the dashboard live.
- **One-time bookings whose `startDate === endDate` is one of the away days.** Handled by the conflict resolver — they appear as ad-hoc rows, default ticked.
- **Rescheduled-from-inside-the-range.** A class originally on (say) May 5 already moved to Apr 28 via a `rescheduled` exception whose `newDate=Apr 28`: this is *not* in the range and is left alone. Only exceptions whose `newDate` falls in the range are surfaced.

## Testing

New tests in `src/lib/__tests__/`:

- `away-periods.test.ts`
  - `isDateInAwayPeriod` — in-range, out-of-range, exact start, exact end, no periods.
  - `awayPeriodsOverlapping` — disjoint, identical, contained, partial overlap, touching boundaries (Apr 30 → May 1 = no overlap), `excludeId` honoured.

- Extend `class-schedule.test.ts`
  - `getClassesForDate` returns `[]` for date inside away period, even when bookings + exceptions exist.
  - `getScheduledRevenueForDateRange` excludes away dates from the sum.

- Extend `wallet-alerts.test.ts`
  - `getWalletHealth` lookahead skips away dates — wallet does not flip to `low` solely because of charges that won't happen.

No new e2e tests; manual smoke per project convention.

## Out of scope (future)

- Restoring soft-deleted ad-hoc bookings on shrink/delete (would require status='cancelled' instead of doc deletion).
- Public holiday presets / recurring annual leave.
- Notifying students automatically when an away period is created.
- Per-location away periods (e.g. "I'm not at Studio A this week, only Studio B").

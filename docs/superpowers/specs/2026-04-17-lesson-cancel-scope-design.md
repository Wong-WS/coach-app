# Lesson Cancel — Scope Picker + UI Cleanup

Date: 2026-04-17
Branch: `redesign`

## Problem

Two unresolved gaps in the lesson flow:

1. **No way to cancel a recurring lesson beyond a single occurrence.** The card overflow menu only offers "Cancel This Date," which writes a single `classException`. There is no option to stop the series going forward, and no option to wipe the series permanently.
2. **The "Primary" badge in the Edit Class modal is confusing.** It appears on the first student in the roster, but users don't understand what it means or why it matters — especially for solo lessons.

## Goals

- Give coaches a single "Cancel" button that works for one-time lessons and recurring lessons, with a Google Calendar–style scope picker for recurring.
- Remove the visible "Primary" label without changing how data is stored.
- Keep every other surface (card menu, Edit modal, Create modal) structurally identical.

## Non-Goals

- Any redesign of the Edit modal, Create modal, or card menu layout.
- Promoting/demoting students in the roster (the first student stays structurally primary — we're only hiding the label).
- Changes to Reschedule, Mark Done, Duplicate, or the lesson creation flow.

## Changes

### 1. Card overflow menu

**File:** `src/app/dashboard/page.tsx` (line ~1148)

- Rename the destructive menu item from **"Cancel This Date"** to **"Cancel"**.
- Tapping it behaves differently based on booking type:
  - **One-time lesson** (booking has no recurrence / is a single-date booking): show the existing simple confirm → cancel this occurrence.
  - **Recurring lesson:** open a new Cancel Scope modal (below).

### 2. Cancel Scope modal

New modal opened from the overflow menu. Uses the existing `<Modal>` component (per project convention — never `window.confirm`).

**Content:**
- Title: `Cancel recurring lesson?`
- Subtitle: `<Lesson name> — <Mon DD MMM>`
- Two radio options, stacked:
  - **This lesson** — "Only <date> — other dates unaffected." (default-selected)
  - **This and future lessons** — "Ends the recurring series from <date> onwards. Past lessons kept."
- Footer: `Back` (outlined) + `Cancel lesson` (red primary).

**Behavior per scope:**

| Scope | Write operation | Preserves |
|---|---|---|
| `this` | Existing: create `classException` with `type: 'cancelled'` and `originalDate = selected date` | Everything else untouched |
| `future` | Update booking: set `endDate = day before selected date` (YYYY-MM-DD). If `selectedDate ≤ booking.startDate`, delete the booking entirely (no occurrences would remain). | Past `lessonLogs`, past `classExceptions`, wallet history |

**Why no "All lessons" option?** Past completed lessons affected wallet balances and income totals. A full-series wipe would either silently reverse finances or leave orphaned `lessonLogs`. "This and future" from the first occurrence already removes the booking entirely while preserving income history — which is the right default. If the user somehow needs to truly purge a booking (e.g., accidental duplicate), that's a rare edge case handled by direct DB cleanup, not a user-facing action.

### 3. Remove "Primary" badge

**File:** `src/app/dashboard/page.tsx` (lines ~1482, 1489–1498)

- Delete the JSX block that renders the `Primary` pill on the first student row in the Edit Class modal roster.
- Keep the `const isPrimary = idx === 0` computation — it's still used on line ~1499 to hide the Remove button on the first student (structural primary).
- Keep `isPrimary` flags elsewhere (e.g., `handleMarkDone` computation) untouched.

### 4. One-time lesson cancel (clarification)

A "one-time" booking in the current model is a recurring booking with `startDate === endDate`. The existing `handleCancel` already works for it — it writes a `classException` on `selectedDateStr`, which equals the only occurrence.

For the Cancel Scope modal, the code detects one-time by:
- `booking.startDate && booking.endDate && booking.startDate === booking.endDate`, OR
- equivalently by checking `classSchedule.getClassesForDate` returns exactly one date across the booking's active range.

For one-time bookings, skip the scope picker entirely and run the existing `this` branch under a direct confirm (one modal, not two).

## Data model

No schema changes. Uses existing fields:
- `bookings/{id}.endDate` — already defined in `Booking` type
- `classExceptions/{id}` — already defined

## Firestore operations summary

All writes go through `writeBatch` where multiple docs are touched:

```ts
// 'this' — unchanged
batch.set(exRef, { bookingId, originalDate, type: 'cancelled', createdAt })

// 'future'
const dayBefore = <YYYY-MM-DD one day before originalDate>
if (booking.startDate && dayBefore < booking.startDate) {
  // Cutoff is before the booking ever started — delete outright and clean orphans
  batch.delete(doc(...'bookings', booking.id))
  for (const ex of classExceptions.filter(e => e.bookingId === booking.id)) {
    batch.delete(doc(...'classExceptions', ex.id))
  }
} else {
  batch.update(doc(...'bookings', booking.id), { endDate: dayBefore })
  // Clean exceptions on dates that no longer exist
  for (const ex of classExceptions.filter(e =>
    e.bookingId === booking.id && e.originalDate >= selectedDateStr
  )) {
    batch.delete(doc(...'classExceptions', ex.id))
  }
}
```

## UX details

- **Default radio:** `This lesson` is pre-selected (safest option).
- **Toast copy:**
  - `this` → "Class cancelled for this date" (unchanged)
  - `future` → "Recurring series ended"
- **Error handling:** Existing try/catch + toast pattern. No new error states.
- **Busy state:** `setCancelling(booking.id)` already exists; reuse while the batch commits.

## Testing plan

1. **Recurring lesson → Cancel → This lesson.** Single occurrence marked cancelled; other dates unaffected. Matches current behavior.
2. **Recurring lesson → Cancel → This and future.** Today + future dates no longer appear on calendar. Past dates + past `lessonLogs` remain. Wallet balances unchanged.
3. **Recurring lesson with no past occurrences → Cancel → This and future.** `selectedDate ≤ startDate`, booking deleted entirely along with its classExceptions. Any past `lessonLogs` still visible on `/dashboard/income`.
4. **One-time lesson → Cancel.** No scope picker; simple confirm; occurrence cancelled.
5. **Edit modal roster.** No "Primary" pill visible on the first student. First student still can't be removed (intentional).
6. **Undo cancel (single occurrence).** The existing "Undo" affordance still works after the rename.

## Out of scope (noted for future)

- Letting users remove the first student (requires promoting booking.clientName/walletId).
- A "Cancel" entry point from inside the Edit modal (currently only from card overflow menu).
- Reschedule also getting a scope picker (it remains per-occurrence only).

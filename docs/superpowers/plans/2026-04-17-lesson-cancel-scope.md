# Lesson Cancel Scope Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "Cancel This Date" action with a Cancel button that opens a scope picker for recurring lessons (This lesson / This and future), and a simple confirm for one-time lessons. Also remove the visible "Primary" badge from the Edit Class modal.

**Architecture:** One new pure helper (`src/lib/cancel-scope.ts`) computes the Firestore operations for "this and future" cancellation — deterministic, unit-tested. Dashboard page wires the helper into `writeBatch` calls and adds two new modals (scope picker + one-time confirm) using the existing `<Modal>` component. No schema changes. Backward compatible.

**Tech Stack:** Next.js 16 App Router · TypeScript 5 · Firebase Firestore (client SDK) · Tailwind CSS 4 · Vitest for unit tests · existing `@/components/ui/Modal` component.

**Spec:** `docs/superpowers/specs/2026-04-17-lesson-cancel-scope-design.md`

---

## File Structure

- **Create** `src/lib/cancel-scope.ts` — pure helper `computeCancelFuture(booking, exceptions, selectedDate)` returning the set of operations (update endDate OR delete booking, plus exception IDs to delete). Keeps business logic out of the React component so it's unit-testable.
- **Create** `src/lib/__tests__/cancel-scope.test.ts` — Vitest unit tests for the helper.
- **Modify** `src/app/dashboard/page.tsx`:
  - Rename menu label (line ~1148) from "Cancel This Date" → "Cancel"
  - Change menu onClick to open the appropriate confirm/picker modal
  - Add state for both modals
  - Add `handleCancelScoped` function that handles all three paths (one-time, recurring→this, recurring→future)
  - Add modal JSX for scope picker and one-time confirm
  - Delete the "Primary" badge JSX (lines ~1489–1493)

---

## Task 1: Pure helper for "this and future" math (TDD)

**Files:**
- Create: `src/lib/cancel-scope.ts`
- Create: `src/lib/__tests__/cancel-scope.test.ts`

This task establishes the deterministic rules for the `future` scope: set `endDate` to day-before-selected, or delete outright if the cutoff would precede the booking's start. Written test-first so the edge cases are pinned down before the React code touches them.

- [ ] **Step 1: Write the failing test file**

Create `src/lib/__tests__/cancel-scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeCancelFuture } from '@/lib/cancel-scope';
import type { Booking, ClassException } from '@/types';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    locationId: 'loc1',
    locationName: 'Court A',
    dayOfWeek: 'monday',
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    clientName: 'Alice',
    clientPhone: '+60123456789',
    lessonType: 'private',
    groupSize: 1,
    notes: '',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeException(overrides: Partial<ClassException> = {}): ClassException {
  return {
    id: 'ex1',
    bookingId: 'b1',
    originalDate: '2026-04-20',
    type: 'cancelled',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('computeCancelFuture', () => {
  it('sets endDate to the day before when cutoff is after the booking start', () => {
    const booking = makeBooking({ startDate: '2026-01-05' });
    const result = computeCancelFuture(booking, [], '2026-04-20');
    expect(result.action).toBe('endDate');
    expect(result.newEndDate).toBe('2026-04-19');
    expect(result.exceptionIdsToDelete).toEqual([]);
  });

  it('deletes the booking when the cutoff equals the booking start', () => {
    const booking = makeBooking({ startDate: '2026-04-20' });
    const result = computeCancelFuture(booking, [], '2026-04-20');
    expect(result.action).toBe('delete');
  });

  it('deletes the booking when the cutoff precedes the booking start', () => {
    const booking = makeBooking({ startDate: '2026-05-01' });
    const result = computeCancelFuture(booking, [], '2026-04-20');
    expect(result.action).toBe('delete');
  });

  it('keeps past exceptions and drops exceptions on or after the cutoff', () => {
    const booking = makeBooking({ startDate: '2026-01-05' });
    const exceptions: ClassException[] = [
      makeException({ id: 'past', originalDate: '2026-03-02' }),
      makeException({ id: 'cutoff', originalDate: '2026-04-20' }),
      makeException({ id: 'future', originalDate: '2026-05-04' }),
      makeException({ id: 'other-booking', bookingId: 'b2', originalDate: '2026-04-20' }),
    ];
    const result = computeCancelFuture(booking, exceptions, '2026-04-20');
    expect(result.action).toBe('endDate');
    expect(result.newEndDate).toBe('2026-04-19');
    expect(new Set(result.exceptionIdsToDelete)).toEqual(new Set(['cutoff', 'future']));
  });

  it('drops ALL exceptions for this booking when deleting outright', () => {
    const booking = makeBooking({ startDate: '2026-05-01' });
    const exceptions: ClassException[] = [
      makeException({ id: 'before', originalDate: '2026-04-10' }),
      makeException({ id: 'after', originalDate: '2026-06-01' }),
      makeException({ id: 'other', bookingId: 'b2', originalDate: '2026-04-10' }),
    ];
    const result = computeCancelFuture(booking, exceptions, '2026-04-20');
    expect(result.action).toBe('delete');
    expect(new Set(result.exceptionIdsToDelete)).toEqual(new Set(['before', 'after']));
  });

  it('treats a booking with no startDate as open-ended and updates endDate', () => {
    const booking = makeBooking({ startDate: undefined });
    const result = computeCancelFuture(booking, [], '2026-04-20');
    expect(result.action).toBe('endDate');
    expect(result.newEndDate).toBe('2026-04-19');
  });

  it('handles month-boundary dates correctly', () => {
    const booking = makeBooking({ startDate: '2026-01-05' });
    const result = computeCancelFuture(booking, [], '2026-05-01');
    expect(result.newEndDate).toBe('2026-04-30');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/lib/__tests__/cancel-scope.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cancel-scope'` or equivalent.

- [ ] **Step 3: Implement the helper**

Create `src/lib/cancel-scope.ts`:

```ts
import type { Booking, ClassException } from '@/types';

export type CancelFutureResult =
  | { action: 'endDate'; newEndDate: string; exceptionIdsToDelete: string[] }
  | { action: 'delete'; exceptionIdsToDelete: string[] };

function previousDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function computeCancelFuture(
  booking: Booking,
  exceptions: ClassException[],
  selectedDate: string,
): CancelFutureResult {
  const dayBefore = previousDay(selectedDate);
  const ownExceptions = exceptions.filter((e) => e.bookingId === booking.id);

  if (booking.startDate && dayBefore < booking.startDate) {
    return {
      action: 'delete',
      exceptionIdsToDelete: ownExceptions.map((e) => e.id),
    };
  }

  return {
    action: 'endDate',
    newEndDate: dayBefore,
    exceptionIdsToDelete: ownExceptions
      .filter((e) => e.originalDate >= selectedDate)
      .map((e) => e.id),
  };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/lib/__tests__/cancel-scope.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cancel-scope.ts src/lib/__tests__/cancel-scope.test.ts
git commit -m "Add computeCancelFuture helper for cancel-scope picker

Pure function returning the Firestore ops needed when cancelling a
recurring booking from a given date onwards: either set endDate to
the day before, or delete the booking if the cutoff precedes its
startDate. Covers exception cleanup in both branches."
```

---

## Task 2: Add state and rename the menu button

**Files:**
- Modify: `src/app/dashboard/page.tsx` around line 49 (state), line 1144–1150 (button)

Adds the state variables for the two new modals and renames the menu label. The onClick is rewired to open a modal instead of firing `handleCancel` directly. The actual modal JSX comes in Task 3 — this task just stages the wiring.

- [ ] **Step 1: Add new state variables**

In `src/app/dashboard/page.tsx`, find the existing `cancelling` state around line 49 and add three new state hooks directly after it:

```tsx
const [cancelling, setCancelling] = useState<string | null>(null);
const [cancelScopeBooking, setCancelScopeBooking] = useState<Booking | null>(null);
const [cancelScope, setCancelScope] = useState<'this' | 'future'>('this');
const [oneTimeCancelBooking, setOneTimeCancelBooking] = useState<Booking | null>(null);
```

- [ ] **Step 2: Rename the menu item and rewire onClick**

Find this block in `src/app/dashboard/page.tsx` (currently around line 1142–1150):

```tsx
{!isDone && (
<button
  onClick={() => handleCancel(booking)}
  disabled={cancelling === booking.id}
  className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-[#333] disabled:opacity-50"
>
  {cancelling === booking.id ? 'Cancelling...' : 'Cancel This Date'}
</button>
)}
```

Replace with:

```tsx
{!isDone && (
<button
  onClick={() => {
    const isOneTime = !!(booking.startDate && booking.endDate && booking.startDate === booking.endDate);
    if (isOneTime) {
      setOneTimeCancelBooking(booking);
    } else {
      setCancelScopeBooking(booking);
      setCancelScope('this');
    }
    setMenuOpen(null);
  }}
  disabled={cancelling === booking.id}
  className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-[#333] disabled:opacity-50"
>
  {cancelling === booking.id ? 'Cancelling...' : 'Cancel'}
</button>
)}
```

- [ ] **Step 3: Verify the app still compiles and the menu still opens (no functional change yet)**

Run: `npm run dev` in one terminal, then load `http://localhost:3000/dashboard`, open a class card's ⋯ menu. The item should now say "Cancel" (no confirm/modal yet — clicking it will just close the menu and do nothing user-visible since the modals aren't rendered yet).

Expected: page compiles cleanly, menu label reads "Cancel", clicking it closes the menu.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Rename 'Cancel This Date' to 'Cancel' and add modal state

Wires the menu onClick to set one of two pending-modal state
variables based on whether the booking is one-time (startDate ===
endDate) or recurring. Modals themselves come in the next commit."
```

---

## Task 3: Render the Cancel Scope modal (recurring lessons)

**Files:**
- Modify: `src/app/dashboard/page.tsx` — add modal JSX alongside the existing Reschedule modal (search `<Modal` for the location)

Adds the scope picker modal. Two radio options, visible only when `cancelScopeBooking` is set. Cancel button fires `handleCancelScoped` (built in Task 5) — for now it calls a placeholder and logs.

- [ ] **Step 1: Locate where existing modals live**

Run: `grep -n '<Modal' src/app/dashboard/page.tsx` and note the location of the Reschedule modal and the Mark Done modal. New modals should be rendered alongside them, typically near the end of the component's return JSX.

Expected: several `<Modal` opening tags with `isOpen={...}` props.

- [ ] **Step 2: Ensure `formatDateShort` and `parseDateString` are imported**

Check top of file: `formatDateFull, formatDateShort` should already be imported from `@/lib/date-format`. Also add `parseDateString` to the import — `formatDateShort` takes a `Date` not a string, so we need to parse `selectedDateStr` before passing it.

Find the existing import line (around line 15):

```tsx
import { formatDateFull, formatDateShort } from '@/lib/date-format';
```

Replace with:

```tsx
import { formatDateFull, formatDateShort, parseDateString } from '@/lib/date-format';
```

- [ ] **Step 3: Add the Cancel Scope modal JSX**

After the existing Reschedule modal (or at the end of the return statement's modal list), add:

```tsx
<Modal
  isOpen={!!cancelScopeBooking}
  onClose={() => setCancelScopeBooking(null)}
  title="Cancel recurring lesson?"
>
  {cancelScopeBooking && (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-zinc-400">
        {cancelScopeBooking.clientName} — {formatDateShort(parseDateString(selectedDateStr))}
      </p>

      <label className={`flex gap-3 p-3 rounded-lg cursor-pointer border-2 ${cancelScope === 'this' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-[#333]'}`}>
        <input
          type="radio"
          name="cancel-scope"
          value="this"
          checked={cancelScope === 'this'}
          onChange={() => setCancelScope('this')}
          className="mt-1"
        />
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">This lesson</p>
          <p className="text-xs text-gray-600 dark:text-zinc-400">
            Only {formatDateShort(parseDateString(selectedDateStr))} — other dates unaffected.
          </p>
        </div>
      </label>

      <label className={`flex gap-3 p-3 rounded-lg cursor-pointer border-2 ${cancelScope === 'future' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-[#333]'}`}>
        <input
          type="radio"
          name="cancel-scope"
          value="future"
          checked={cancelScope === 'future'}
          onChange={() => setCancelScope('future')}
          className="mt-1"
        />
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">This and future lessons</p>
          <p className="text-xs text-gray-600 dark:text-zinc-400">
            Ends the recurring series from {formatDateShort(parseDateString(selectedDateStr))} onwards. Past lessons kept.
          </p>
        </div>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => setCancelScopeBooking(null)}>
          Back
        </Button>
        <Button
          variant="danger"
          disabled={cancelling === cancelScopeBooking.id}
          onClick={() => handleCancelScoped(cancelScopeBooking, cancelScope)}
        >
          {cancelling === cancelScopeBooking.id ? 'Cancelling...' : 'Cancel lesson'}
        </Button>
      </div>
    </div>
  )}
</Modal>
```

The `Button` component already supports `variant="danger"` (verified in `src/components/ui/Button.tsx`).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Render Cancel Scope modal for recurring lessons

Two radio options — This lesson / This and future lessons. Wires
the Cancel button to handleCancelScoped (added next task)."
```

Note: at this point `handleCancelScoped` does not yet exist, so the app will not compile. The next task adds it.

---

## Task 4: Render the one-time cancel confirm modal

**Files:**
- Modify: `src/app/dashboard/page.tsx` — alongside the Cancel Scope modal from Task 3

Adds a minimal confirm modal for one-time bookings. Single message, Back + Cancel lesson buttons.

- [ ] **Step 1: Add the one-time confirm modal JSX**

Directly after the Cancel Scope modal (from Task 3), add:

```tsx
<Modal
  isOpen={!!oneTimeCancelBooking}
  onClose={() => setOneTimeCancelBooking(null)}
  title="Cancel this lesson?"
>
  {oneTimeCancelBooking && (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-zinc-400">
        {oneTimeCancelBooking.clientName} — {formatDateShort(parseDateString(selectedDateStr))}
      </p>
      <p className="text-sm text-gray-600 dark:text-zinc-400">
        The lesson will be cancelled for this date.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => setOneTimeCancelBooking(null)}>
          Back
        </Button>
        <Button
          variant="danger"
          disabled={cancelling === oneTimeCancelBooking.id}
          onClick={() => handleCancelScoped(oneTimeCancelBooking, 'this')}
        >
          {cancelling === oneTimeCancelBooking.id ? 'Cancelling...' : 'Cancel lesson'}
        </Button>
      </div>
    </div>
  )}
</Modal>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Render confirm modal for one-time lesson cancel

One-time bookings (startDate === endDate) skip the scope picker
and get a simple confirm instead."
```

Note: app still won't compile until Task 5 adds `handleCancelScoped`.

---

## Task 5: Implement `handleCancelScoped`

**Files:**
- Modify: `src/app/dashboard/page.tsx` — add function next to existing `handleCancel` (around line 542)

The function handles all three paths — one-time, recurring→this, recurring→future — and commits to Firestore in a single `writeBatch`.

- [ ] **Step 1: Add imports**

Near the top of `src/app/dashboard/page.tsx` (around line 13), add the helper import below the existing `resolveWallet` import:

```tsx
import { resolveWallet } from '@/lib/wallets';
import { computeCancelFuture } from '@/lib/cancel-scope';
```

Also confirm that `getDocs, query, where` are already in the Firestore import at line 4 — they should be (used elsewhere in the file).

- [ ] **Step 2: Add the `ClassException` type import**

Find the existing types import (around line 10):

```tsx
import { Booking, DayOfWeek } from '@/types';
```

Replace with:

```tsx
import { Booking, ClassException, DayOfWeek } from '@/types';
```

- [ ] **Step 3: Add `handleCancelScoped` function**

Directly after the existing `handleCancel` function (currently at line 542–564), add:

```tsx
const handleCancelScoped = async (
  booking: Booking,
  scope: 'this' | 'future',
) => {
  if (!coach || !db) return;
  setCancelling(booking.id);
  try {
    const firestore = db as Firestore;
    const batch = writeBatch(firestore);

    if (scope === 'this') {
      const exRef = doc(collection(firestore, 'coaches', coach.id, 'classExceptions'));
      batch.set(exRef, {
        bookingId: booking.id,
        originalDate: selectedDateStr,
        type: 'cancelled',
        createdAt: serverTimestamp(),
      });
    } else {
      // Fetch ALL exceptions for this booking (the in-scope `classExceptions`
      // is only a ±2 month window, which may miss orphans).
      const exQuery = query(
        collection(firestore, 'coaches', coach.id, 'classExceptions'),
        where('bookingId', '==', booking.id),
      );
      const exSnapshot = await getDocs(exQuery);
      const allExceptions: ClassException[] = exSnapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ClassException, 'id'>),
      }));

      const result = computeCancelFuture(booking, allExceptions, selectedDateStr);
      if (result.action === 'delete') {
        batch.delete(doc(firestore, 'coaches', coach.id, 'bookings', booking.id));
      } else {
        batch.update(doc(firestore, 'coaches', coach.id, 'bookings', booking.id), {
          endDate: result.newEndDate,
        });
      }
      for (const exId of result.exceptionIdsToDelete) {
        batch.delete(doc(firestore, 'coaches', coach.id, 'classExceptions', exId));
      }
    }

    await batch.commit();
    showToast(
      scope === 'this' ? 'Class cancelled for this date' : 'Recurring series ended',
      'success',
    );
    setCancelScopeBooking(null);
    setOneTimeCancelBooking(null);
  } catch (error) {
    console.error('Error cancelling class:', error);
    showToast('Failed to cancel class', 'error');
  } finally {
    setCancelling(null);
  }
};
```

- [ ] **Step 4: Remove the now-unused `handleCancel` function**

The old `handleCancel` at line 542 is no longer called anywhere (the menu button now opens a modal instead). Delete the full function block (`const handleCancel = async (booking: Booking) => { … };` and its body). If ESLint reports an unused import as a result, clean that up too.

Run: `grep -n 'handleCancel\b' src/app/dashboard/page.tsx`

Expected: zero matches after the deletion (only `handleCancelScoped` should remain).

- [ ] **Step 5: Verify app compiles and manually test all three cancel paths**

Run: `npm run lint && npm run build`
Expected: lint clean, build succeeds.

Then manually (per spec Testing plan):

1. **Recurring lesson → Cancel → This lesson.** Pick a recurring lesson. Click ⋯ → Cancel. Modal opens. Leave "This lesson" selected. Click "Cancel lesson". Toast: "Class cancelled for this date". Lesson moves to "Cancelled" section for that date. Future dates still show the lesson.
2. **Recurring lesson → Cancel → This and future.** Same setup. Select "This and future lessons". Click "Cancel lesson". Toast: "Recurring series ended". Today's date is cancelled and future dates no longer show the lesson. Past dates still show lessonLogs in `/dashboard/income`.
3. **Recurring lesson from its first occurrence → This and future.** Create a recurring lesson, navigate to its `startDate`, cancel with "This and future". The booking should be deleted entirely (check Firestore) and the lesson no longer appears anywhere on the calendar.
4. **One-time lesson → Cancel.** Click ⋯ → Cancel on a one-time lesson. Scope picker does NOT open; the single-confirm modal opens. Click "Cancel lesson". Toast: "Class cancelled for this date". Lesson moves to Cancelled section.
5. **Undo cancel.** For the "This lesson" case, the existing Undo button in the Cancelled section should still work (the classException doc was created by the same code path as before).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Implement handleCancelScoped for three cancel paths

One-time and recurring→this create a classException (cancelled).
Recurring→future uses computeCancelFuture to either update endDate
or delete the booking outright, cleaning up orphaned exceptions."
```

---

## Task 6: Remove the "Primary" badge JSX

**Files:**
- Modify: `src/app/dashboard/page.tsx` around line 1489–1493

Deletes the visible `Primary` pill from the Edit Class modal. `const isPrimary = idx === 0` stays because the Remove button below still uses it. `isPrimary` elsewhere (e.g., `handleMarkDone` attendee computation) also stays.

- [ ] **Step 1: Delete the Primary pill JSX**

Find this block (around line 1487–1494):

```tsx
<p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
  {student?.clientName ?? '(unknown)'}
  {isPrimary && (
    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
      Primary
    </span>
  )}
</p>
```

Replace with:

```tsx
<p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
  {student?.clientName ?? '(unknown)'}
</p>
```

- [ ] **Step 2: Verify the Edit modal still works**

Run: `npm run dev` and open an existing group lesson's Edit Class modal. The first student row should still render normally with no Remove button. Subsequent rows should still have their Remove buttons. No "Primary" pill is visible.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Remove 'Primary' badge from Edit Class roster

First-student-is-primary is retained as a structural rule (they
still can't be removed), but the visible label is dropped since
coaches found it confusing — especially on solo lessons."
```

---

## Task 7: Full regression sweep and push

**Files:** none — validation only.

- [ ] **Step 1: Re-run the unit tests**

Run: `npx vitest run`
Expected: all tests pass (including the 7 new tests for `computeCancelFuture`).

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no errors. (Pre-existing warnings are OK — just don't introduce new ones.)

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Final manual QA pass in the browser**

Load the Vercel preview for the `redesign` branch (per memory: "always use live Vercel URL, not localhost" — once pushed, test on preview). Walk through the six scenarios in the spec's Testing plan. For each, confirm the expected state matches.

- [ ] **Step 5: Push**

```bash
git push origin redesign
```

Watch the Vercel preview deploy, then re-run Step 4 against the live preview URL.

---

## Self-review checklist

- [x] **Cancel button rename** — Task 2 Step 3
- [x] **Recurring scope picker modal** — Task 3
- [x] **One-time confirm modal** — Task 4
- [x] **`this` scope behavior** — Task 5 Step 3 (creates classException, same as existing)
- [x] **`future` scope behavior** — Task 5 Step 3 + Task 1 (uses `computeCancelFuture`)
- [x] **Exception cleanup on `future`** — Task 1 tests + implementation
- [x] **Delete booking when cutoff ≤ startDate** — Task 1 tests + Task 5
- [x] **Remove Primary badge** — Task 6
- [x] **Keep structural `isPrimary` logic** — Task 6 Step 1 only deletes the pill span
- [x] **Toast copy matches spec** — Task 5 Step 3
- [x] **Testing plan covered** — Task 5 Step 5 + Task 7 Step 4

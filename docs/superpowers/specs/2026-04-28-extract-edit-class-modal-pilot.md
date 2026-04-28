# Extract EditClassModal — Pilot Refactor

**Date:** 2026-04-28
**Status:** Spec — pending implementation plan

## Goal

Extract `EditClassModal` from `src/app/dashboard/page.tsx` into its own file as a low-risk pilot for the broader effort to break up the 3,317-line dashboard page (architecture concern #2).

This pilot establishes the extraction pattern, file location convention, and verification workflow before tackling higher-stakes modals (`MarkDoneModal`, `AddLessonModal`).

## Context

`src/app/dashboard/page.tsx` has grown to 3,317 lines with 39 `useState` hooks. Several modal components are already declared as named functions inside the file:

- `EditClassModal` (line 1937, ~85 visible lines, ~430 lines incl. body)
- `MarkDoneModal` (line 2370) — touches money (wallet charges, lesson logs)
- `AddLessonModal` (line 2580) — largest, ~365 lines

These are pure props-in/callbacks-out components — they do not close over parent state — so extraction is mechanical. The 38-prop interface on `EditClassModal` is a code smell, but redesigning it is **out of scope** for this pilot.

## Scope

- Extract **only** `EditClassModal` and its helper `FieldLabel` (used by both `EditClassModal` and `AddLessonModal`).
- Leave `MarkDoneModal` and `AddLessonModal` in `page.tsx` for follow-up work.
- No prop-shape changes, no logic changes — pure file move.

## Files

- **Create** `src/app/dashboard/_components/FieldLabel.tsx`
  - Houses the existing `FieldLabel` function from `page.tsx` line 1914.
  - Co-located in `_components/` so future extracted modals can share it without round-tripping through page.tsx.
  - The Next.js `_` prefix excludes the folder from routing.

- **Create** `src/app/dashboard/_components/EditClassModal.tsx`
  - Houses the existing `EditClassModal` function from `page.tsx` line 1937.
  - Imports: `PaperModal`, `Btn`, `Input` (from existing component libs), `IconClose`, `IconSearch` (from `@/components/paper`), `parseDateString` (from `@/lib/date-format`), the new local `FieldLabel`, and types `Booking`, `Student`, `Wallet`, `Location` from `@/types`.
  - No prop signature changes.

- **Modify** `src/app/dashboard/page.tsx`
  - Remove the local `EditClassModal` and `FieldLabel` function definitions.
  - Add `import { EditClassModal } from './_components/EditClassModal'` and `import { FieldLabel } from './_components/FieldLabel'` (the latter still needed because `AddLessonModal` references it).
  - Expected size after extraction: ~2,820 lines (drop of ~500).

## Verification

1. `npm run lint` — clean.
2. `npx tsc --noEmit` — clean.
3. `npm run build` — clean (catches Next.js routing/server-component issues).
4. Manual smoke test on live site (or `npm run dev`):
   - Open dashboard → click an existing class → "Edit class".
   - Change the class name → Save → choose "Just this date" → confirm exception persists and dashboard re-renders correctly.
   - Reopen → change start time → Save → choose "All future" → confirm booking row updates.
5. Single commit, single push. If a regression surfaces post-merge, `git revert` the commit.

## Out of Scope

- Redesigning the 38-prop interface on `EditClassModal`.
- Extracting `MarkDoneModal`, `AddLessonModal`, or any of the 3 still-inline confirm modals (bulk mark-done, cancel-scope picker, etc.).
- Any change to behaviour, types, or imports unrelated to the move.
- Tests for the modal — there are none today, and adding unit tests for a React modal that depends on Firebase would require Firebase emulator setup (separate project, see prior NOTES discussion).

## Success Criteria

- `dashboard/page.tsx` shrinks by ~500 lines.
- All three verification commands pass.
- Manual smoke test confirms Edit Class behaves identically (this-date and future scopes).
- Pattern is clear enough to repeat for `MarkDoneModal` and `AddLessonModal` in follow-up work.

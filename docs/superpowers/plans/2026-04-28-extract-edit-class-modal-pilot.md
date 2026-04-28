# Extract EditClassModal — Pilot Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `EditClassModal` from `src/app/dashboard/page.tsx` into its own file under `src/app/dashboard/_components/`, establishing the pattern for splitting up the 3,317-line dashboard page.

**Architecture:** Pure code move. `EditClassModal` is already a props-in/callbacks-out component (38 props, no closure over parent state), so the only changes are (a) creating two new files (`FieldLabel.tsx` + `EditClassModal.tsx`), (b) adding imports in `page.tsx`, and (c) removing the local definitions. No behaviour change, no prop signature change, no type change.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Tailwind CSS 4, Paper & Ink design system in `src/components/paper/`.

---

## Pre-flight

- [ ] **Read the spec** in `docs/superpowers/specs/2026-04-28-extract-edit-class-modal-pilot.md` to confirm scope.
- [ ] **Verify branch** is `main`:

```bash
git branch --show-current
```

Expected: `main`

- [ ] **Verify clean working tree:**

```bash
git status
```

Expected: `nothing to commit, working tree clean` (or only unrelated changes you intend to keep separate).

---

## Task 1: Create FieldLabel component file

`FieldLabel` is currently defined inline in `page.tsx` at line 1914 and used by both `EditClassModal` and `AddLessonModal`. Extracting it first lets the next task import it cleanly.

**Files:**
- Create: `src/app/dashboard/_components/FieldLabel.tsx`

- [ ] **Step 1: Create the file with the existing `FieldLabel` function verbatim**

Write `src/app/dashboard/_components/FieldLabel.tsx` with this exact content:

```tsx
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11.5px] font-semibold uppercase mb-1.5"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
    >
      {children}
    </label>
  );
}
```

Note: this is identical to `src/app/dashboard/page.tsx:1914-1923` except for the leading `export`. Do not change classes, styles, or markup.

- [ ] **Step 2: Type-check passes**

```bash
npx tsc --noEmit
```

Expected: no output (clean). The new file is unused but should compile.

- [ ] **Step 3: Lint passes**

```bash
npm run lint
```

Expected: no warnings or errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/_components/FieldLabel.tsx
git commit -m "$(cat <<'EOF'
dashboard: extract FieldLabel into _components

First step of breaking up dashboard/page.tsx — shared between
EditClassModal and AddLessonModal so it lives in its own file.
EOF
)"
```

---

## Task 2: Create EditClassModal component file

The modal function spans `src/app/dashboard/page.tsx:1937-2366` (430 lines). The two style constants `paperInputClass` and `paperInputStyle` (lines 1925-1935) are used **only** inside `EditClassModal`, so they travel with it.

**Files:**
- Create: `src/app/dashboard/_components/EditClassModal.tsx`

- [ ] **Step 1: Confirm exact source line ranges before copying**

```bash
sed -n '1925,1935p' src/app/dashboard/page.tsx
sed -n '1937,1937p' src/app/dashboard/page.tsx
sed -n '2366,2366p' src/app/dashboard/page.tsx
```

Expected:
- Line 1925: `const paperInputClass =`
- Line 1937: `function EditClassModal({`
- Line 2366: `}` (closing brace of the `EditClassModal` function)

If line numbers differ from expected (e.g., because the file was edited concurrently), STOP and re-read the spec to find the correct ranges before continuing.

- [ ] **Step 2: Create the new file scaffold with the imports + the required exports**

Write `src/app/dashboard/_components/EditClassModal.tsx` with this header and structure:

```tsx
'use client';

import { Btn, PaperModal, IconClose, IconSearch } from '@/components/paper';
import { parseDateString } from '@/lib/date-format';
import type { Booking, Student, Wallet, Location } from '@/types';
import { FieldLabel } from './FieldLabel';

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

export function EditClassModal({
  // ... full prop destructuring + types from page.tsx:1938-2015
}) {
  // ... full body from page.tsx:2016-2365
}
```

- [ ] **Step 3: Copy the `EditClassModal` function body verbatim from page.tsx:1937-2366**

Open `src/app/dashboard/page.tsx`, copy the entire function body from line 1937 (`function EditClassModal({`) through line 2366 (the closing `}`), and paste it into the new file replacing the placeholder `export function EditClassModal({...}) { ... }` block.

Then add the keyword `export` in front of `function EditClassModal` so the final declaration reads:

```tsx
export function EditClassModal({
```

Do not change anything else in the function body. No prop renames, no logic tweaks, no formatting changes — pure copy.

- [ ] **Step 4: Type-check passes**

```bash
npx tsc --noEmit
```

Expected: no output. If TypeScript complains about a missing identifier (e.g., `FieldLabel` not imported, or a Paper icon not imported), check that all of these are present in the imports block:

- From `@/components/paper`: `Btn`, `PaperModal`, `IconClose`, `IconSearch`
- From `@/lib/date-format`: `parseDateString`
- From `@/types`: `Booking`, `Student`, `Wallet`, `Location`
- From `./FieldLabel`: `FieldLabel`

If any other identifier is referenced inside the body (search the body of the function for capitalized names that aren't standard React/HTML), add it to the imports.

- [ ] **Step 5: Lint passes**

```bash
npm run lint
```

Expected: no warnings or errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/_components/EditClassModal.tsx
git commit -m "$(cat <<'EOF'
dashboard: extract EditClassModal into _components

Pure code move from dashboard/page.tsx. paperInputClass +
paperInputStyle travel with it (used only by this modal). No prop
signature or behaviour change.
EOF
)"
```

---

## Task 3: Cut over page.tsx to use the extracted files

This is the only task that modifies `page.tsx`. After this commit, `page.tsx` should drop from ~3317 lines to ~2820 lines.

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add imports for the two extracted components**

In `src/app/dashboard/page.tsx`, locate the existing import block ending at line 65 (the closing `} from '@/components/paper';`). Immediately after that block, add:

```tsx
import { FieldLabel } from './_components/FieldLabel';
import { EditClassModal } from './_components/EditClassModal';
```

- [ ] **Step 2: Delete the local `FieldLabel` definition**

Delete lines that currently define `FieldLabel` (page.tsx:1914-1923):

```tsx
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11.5px] font-semibold uppercase mb-1.5"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
    >
      {children}
    </label>
  );
}
```

- [ ] **Step 3: Delete the local `paperInputClass` and `paperInputStyle` constants**

Delete lines that currently define these (page.tsx:1925-1935):

```tsx
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
```

- [ ] **Step 4: Delete the local `EditClassModal` function definition**

Delete the entire `EditClassModal` function (page.tsx:1937-2366), starting from `function EditClassModal({` through the matching closing `}` immediately before the `// ────────...` comment separator at line 2368.

After this deletion, the file should flow from the previous component (e.g., `QuickActionsCard`) directly into the `// ────────...` separator and then `MarkDoneModal`.

- [ ] **Step 5: Type-check passes**

```bash
npx tsc --noEmit
```

Expected: no output. If TypeScript complains:

- "Cannot find name 'FieldLabel'" → import block in Step 1 is missing or wrong path.
- "Cannot find name 'paperInputClass'" / "'paperInputStyle'" → some other component in `page.tsx` is using them. Re-check (`grep -n paperInputClass src/app/dashboard/page.tsx`); if so, leave the constants in `page.tsx` and remove them from the new file instead. (Audit done at planning time showed only `EditClassModal` uses them, but verify.)
- "Cannot find name 'EditClassModal'" → the JSX usage at page.tsx:1206 still needs the import; re-check Step 1.

- [ ] **Step 6: Lint passes**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 7: Production build passes**

```bash
npm run build
```

Expected: `✓ Compiled successfully` and `✓ Generating static pages` complete without errors. Pre-existing `metadataBase` warning is fine.

- [ ] **Step 8: Confirm line count dropped**

```bash
wc -l src/app/dashboard/page.tsx
```

Expected: roughly 2820 lines (down from 3317). Exact number doesn't matter; if it's still above 3000 or unexpectedly below 2700, something was deleted incorrectly — review the diff.

- [ ] **Step 9: Review the diff before committing**

```bash
git diff src/app/dashboard/page.tsx | head -120
```

Sanity check:
- Two new `import` lines at the top.
- Three deletions: `FieldLabel`, `paperInputClass` + `paperInputStyle`, `EditClassModal`.
- No other changes.

If anything else changed (whitespace storms, accidental re-formatting), revert and try again.

- [ ] **Step 10: Commit + push**

```bash
git add src/app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
dashboard: cut over page.tsx to use extracted EditClassModal + FieldLabel

Drops ~500 lines from dashboard/page.tsx (3317 → ~2820). No behaviour
change — pure import swap.
EOF
)"
git push
```

---

## Task 4: Smoke-test on live

Per project rules, smoke testing happens on the live Vercel URL, not localhost.

- [ ] **Step 1: Wait for Vercel deploy to finish**

After `git push`, Vercel auto-deploys main. Watch the deployment in the Vercel dashboard or wait ~60–90 seconds.

- [ ] **Step 2: Open the live dashboard**

Navigate to https://coach-simplify.com/test-coach (login as `testcoach@example.com` / `Test123!` if not already authed).

- [ ] **Step 3: Verify Edit Class — "Just this date" path**

1. On Today's Classes (or any day with a class), click the `…` menu on a class → "Edit class".
2. The modal opens. Verify it looks identical to before (Paper & Ink styling, all fields populated).
3. Change the **Class name** to a temporary value (e.g., append " TEST").
4. Click **Save**.
5. The save-options screen appears. Click **Just this date**.
6. Modal closes. Verify the class card on the dashboard now shows the new name.
7. Reload the page. Verify the change persisted.
8. Re-open Edit, restore the original name, save → Just this date, to clean up.

- [ ] **Step 4: Verify Edit Class — "All future" path**

1. Click `…` on a recurring class → "Edit class".
2. Change the **Start time** to a different time (e.g., shift by 30 minutes).
3. Click **Save** → **All future**.
4. Modal closes. Verify the booking row reflects the new time on this date and on next week's instance.
5. Re-open Edit, restore the original time, save → All future, to clean up.

- [ ] **Step 5: Verify Add Lesson still works (regression check)**

`AddLessonModal` still uses the now-imported `FieldLabel`. Quick sanity check:

1. Click **Add lesson** on the dashboard.
2. The modal opens. Verify field labels render correctly (small uppercase grey text above each field).
3. Cancel out — no need to actually create a lesson.

- [ ] **Step 6: Mark task complete**

If all four smoke tests pass, the pilot is done. Append a note to `NOTES.md` Architecture Question #2 capturing the result, e.g.:

```markdown
2. (2026-04-28) **Giant page components** — Pilot extraction of `EditClassModal` + `FieldLabel` shipped (commit on main). `dashboard/page.tsx` dropped from 3317 → ~2820 lines. Pattern works; remaining modals (`MarkDoneModal`, `AddLessonModal`, 3 inline confirm modals) can be extracted in follow-up.
```

If any smoke test fails, revert with:

```bash
git revert HEAD~2..HEAD
git push
```

(That reverts Tasks 2 and 3 — Task 1's `FieldLabel.tsx` is harmless to leave behind, but you can also revert it with one more `git revert`.)

---

## Out of Scope (explicit non-goals)

- Redesigning the 38-prop interface on `EditClassModal`.
- Extracting `MarkDoneModal`, `AddLessonModal`, or any inline confirm modal.
- Adding unit tests (no Firebase emulator infrastructure exists; testing this modal would require setup that's a separate project).
- Any change unrelated to the move.

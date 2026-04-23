# Schedule Page Redesign — Paper & Ink

## Goal

Port the read-only recurring-schedule page (`/dashboard/bookings`) into the Paper & Ink design system so it matches the already-shipped Overview and Payments pages. Source of truth for the visual design: `/Users/wongweisiang/Downloads/coach-redesign/project/src/page-schedule.jsx`.

This is a pure visual port — no data model changes, no new interactions.

## Scope

- Rewrite `src/app/dashboard/bookings/page.tsx` using the `@/components/paper` primitives and CSS vars (`--ink`, `--panel`, `--line`, `--accent`, …).
- Desktop: 7-column grid with hour-of-day rows and absolutely-positioned booking blocks.
- Mobile (`sm:` breakpoint and below): day-by-day list of cards — one card per booking, time on the left, class name + location + student names in the middle, weekly RM total on the right.
- Recurring-only filter stays: `b.status === 'confirmed' && !b.endDate` (same as today).
- Purely read-only. Blocks are not clickable. Matches the mock's "Read-only · To change, open the class on Overview" hint.

## Out of scope

- Navigating from a block into the Overview edit modal (flagged as a possible follow-up).
- Showing ad-hoc / one-time bookings.
- Any changes to the Booking type, Firestore shape, or `useBookings` hook.
- Adding edit/cancel/duplicate controls here. Those live on Overview.

## Design

### Desktop layout

Header row (matches mock):
- Eyebrow label `SCHEDULE` — 11px, uppercase, `var(--ink-3)`.
- Title `Recurring weekly` — 28px, semibold, `letter-spacing: -0.8px`.
- Subtitle: `<N> slots · RM <weeklyTotal>/week` — 13px, `var(--ink-3)`, with the numbers promoted to `var(--ink)` and the `mono tnum` class.
- Right side: a `Chip tone="soft"` reading "Read-only" followed by the text "To change, open the class on Overview" in `var(--ink-3)`.

Weekly grid (wrapped in a `.card`, no inner padding, `overflow-hidden`):
- Top header row: 52px gutter + 7 equal columns. Each column shows the day abbreviation (`MON`, `TUE`, …) as an 11px uppercase eyebrow and `<count> class(es)` as 13px below it.
- Body grid: same column template, with an hour gutter on the left.
- Hour rows: `HOUR_PX = 56`. The mock hardcodes 8–21. **This spec extends it to be adaptive** (see below).
- Each day column has 1px horizontal hour lines and absolutely-positioned booking blocks.
- Block visual:
  - Group booking (`studentIds.length > 1`): background `var(--accent-soft)`, border `var(--accent)`, 3px left border `var(--accent)`, text `var(--accent-ink)`.
  - Private booking: background `var(--line)`, border `var(--line-2)`, 3px left border `var(--ink-3)`, text `var(--ink)` / `var(--ink-2)`.
  - Content: class name (11px, semibold, ellipsis) + `startTime–endTime` (10px, mono tnum) + a third line showing the first word of `locationName` (plus `· <count>` for groups) when the block is taller than 48px.
  - Block position: `top = ((sh - gridStart) + sm/60) * HOUR_PX + 2`, `height = ((eh - sh) + (em - sm)/60) * HOUR_PX - 4`, `left: 4, right: 4`.

Legend (below grid):
- Two swatches matching private and group block styles, with text "Private" and "Group".

### Mobile layout

When the viewport is below `sm` (640px), render a simple list instead of the grid:
- Subtitle: `<N> recurring · RM <weeklyTotal>/week` at the top.
- For each day (Mon → Sun):
  - Eyebrow `MONDAY` (full name, 11px uppercase).
  - If no bookings: italic "No classes" row.
  - Otherwise: stack of `RecurringCard` rows. Each card is a flex row:
    - Fixed-width (64px) mono start time.
    - Middle: class name (with `· <count>` for groups) on line 1, `locationName · <first-name, first-name, …>` on line 2.
    - Right: `RM <weeklyTotalForThisBooking>` in mono.
    - Same left-border color treatment as desktop blocks (accent for group, ink-3 for private).

Implementation note: the mock's `compact` prop is a runtime flag. In the React port we use Tailwind responsive classes so both views are rendered and CSS hides the wrong one (`hidden sm:block` / `sm:hidden`). This avoids needing a window-size hook.

### Adaptive grid hours

Instead of the mock's fixed 8–21:

```ts
const starts = confirmedBookings.map(b => parseInt(b.startTime.slice(0, 2), 10));
const ends = confirmedBookings.map(b => {
  const [h, m] = b.endTime.split(':').map(Number);
  return m > 0 ? h + 1 : h;               // round up so the block fits
});
const gridStart = Math.min(8, ...starts);       // default 8, go earlier if needed
const gridEnd = Math.max(21, ...ends);          // default 21 (9pm), go later if needed
const hours = range(gridStart, gridEnd);        // inclusive of gridStart, exclusive of gridEnd
```

Keeps the mock's 8–21 as the floor for empty/light schedules, but expands when a booking starts at 6am or ends at 10pm so nothing clips.

### Student name lookup

The mock reads `students.find(s => s.id === sid)?.clientName.split(' ')[0]`. We do the same via the existing `useStudents(coach?.id)` hook and a `Map<string, Student>` built once per render.

### Weekly totals

- Per-booking: `b.studentIds.reduce((s, sid) => s + (b.studentPrices[sid] ?? 0), 0)` — matches the mock.
- Weekly: sum of all per-booking totals.

### Loading state

Keep the existing spinner (same as current bookings page) — not shown in the mock but needed for the live hook. Match the spinner style used on the Payments page (`border-[color:var(--accent)]`).

### Dark mode

Nothing page-specific. Paper & Ink vars are already dark-mode aware, so using them gives dark mode for free.

## Units and components

This page is small enough to live in a single file — same shape as the current `bookings/page.tsx`. Internal helpers:

- `BookingsPage` (default export) — data loading, memoized per-day grouping, and top-level layout switch.
- `WeeklyGrid` — desktop grid component.
- `DayList` — mobile list component.
- `RecurringCard` — single list row used by `DayList`.
- `fmtTimeShort(t)` — `"14:00" → "2p"`, `"14:30" → "2:30p"`. Currently defined locally inside `src/app/dashboard/page.tsx`. Duplicate the same implementation locally in `bookings/page.tsx` to keep this PR single-file. A follow-up can hoist it to `@/lib/time-format`.

No new files in `@/components/paper`. Reuse `Chip`.

## Files changed

- `src/app/dashboard/bookings/page.tsx` — full rewrite.

Nothing else. No new files, no other edits.

## Testing

- Manual smoke test on the live Vercel URL with the test coach:
  - Empty state (no recurring bookings): renders header, grid with 8–21 rows and "0 classes" headers, no blocks, legend visible.
  - Typical schedule: blocks positioned correctly, private/group colours correct, mobile list matches.
  - Edge: a booking starting at 7:30am (grid should extend to 7am) and one ending at 9:30pm (grid should extend to 10pm).
  - Dark mode toggle works.
- No new unit tests — this is a presentational rewrite of a read-only view, and the project has no existing tests for dashboard pages.

## Risks

- **Clipped blocks** if the adaptive-hours logic has an off-by-one. Mitigated by rounding `endTime` up to the next hour and testing with an edge-case booking.
- **Student name misses** if a `studentId` on a booking no longer exists in `students` (orphaned reference). The mock silently filters with `.filter(Boolean)`; we do the same.
- **Very tall blocks** (2h+ private) render fine with the existing padding; no overflow needed.

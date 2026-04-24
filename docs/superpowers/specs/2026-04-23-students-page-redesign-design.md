# Students Page Redesign — Paper & Ink

## Goal

Port the Students page (`/dashboard/students`) into the Paper & Ink design system to match the already-shipped Overview, Payments, and Schedule pages. Visual source of truth: `/Users/wongweisiang/Downloads/coach-redesign/project/src/page-students.jsx`.

This is primarily a visual + layout port. One new behavior ships: the desktop layout becomes side-by-side master-detail. All existing actions (edit, delete lesson log with refund, delete student with cascade) are preserved.

## Scope

- Rewrite `src/app/dashboard/students/page.tsx` using `@/components/paper` primitives and CSS vars.
- Desktop (`sm:` and wider, 640px+): two-column layout — 360px list on the left, detail pane on the right.
- Mobile (< 640px): list only. Tapping a row opens a `PaperModal` whose body is the same detail content.
- New filter chip `Owing` (students with negative wallet balance) alongside the existing day filter.
- All data hooks and Firestore writes unchanged.

## Out of scope

- No data model or Firestore schema changes.
- No manual "New student" button — auto-create via `findOrCreateStudent` remains the only path.
- No Message/SMS/WhatsApp button.
- No wallet top-up from this page (top-up lives on Payments and stays there).
- No hoisting `fmtTimeShort` to `@/lib/time-format` — duplicate locally like the Schedule page did; a follow-up PR can consolidate.
- No changes to `useLessonLogs`, `useBookings`, `useStudents`, `useWallets` hooks.

## Design

### Page header

Matches Schedule/Overview/Payments:

- Eyebrow `STUDENTS` — 11px, uppercase, `var(--ink-3)`, `letter-spacing: 0.06em`.
- Title `<N> on the roster` — 22px on mobile / 28px on desktop, semibold, `letter-spacing: -0.6px`. `N` is the total student count (not the filtered count — matches mock).
- No right-side content in the header. (Mock shows `+ New student` there; we dropped it.)

### Toolbar

One row, flex layout, `gap: 10px`, `margin-bottom: 14px`:

- Left: search input (Paper & Ink text-input styling with `IconSearch` leading) — `max-width: 340px`, `flex: 1`. Placeholder `Search by name or phone…`. Filters on `clientName` OR `clientPhone` (case-insensitive).
- Right: chip filter row. Buttons are rendered as segmented-pill chips (not the `Segmented` component, because the chips come and go based on `activeDays`). Layout:
  - `[All]`
  - `[Owing]` — shows students with any wallet where `balance < 0`.
  - `[No booking]` — students with no recurring bookings.
  - `[Mon]` `[Tue]` …`[Sun]` — only for days that have at least one recurring booking (current behavior).

Active chip: `background: var(--ink)`, `color: var(--panel)`. Inactive: `background: var(--line)`, `color: var(--ink-3)`. Shared: 12.5px text, rounded-full, `padding: 5px 12px`.

### List (left pane on desktop, full-width on mobile)

Wrapped in a `.card` (rounded 12px, `background: var(--panel)`, border `var(--line)`) with `padding: 4` so rows sit flush.

Each row is a `<button>`:

- `Avatar` (32px) from `@/components/paper` — auto-initials + deterministic colour from `clientName`.
- Middle: primary line `clientName` (13.5px, medium, `var(--ink)`, truncate); secondary line (11.5px, `var(--ink-3)`, truncate) — `<N> weekly` when student has recurring bookings, `No recurring` otherwise.
- Right: `BalancePill balance={wallet.balance} compact` from `@/components/paper` when the student has a linked wallet. Omitted otherwise.
- Row container: `gap: 10px`, `padding: 10px`, `border-radius: 8px`, `text-align: left`.
- Selected row: `background: var(--line)`.
- Hover (non-selected): subtle — `background: rgba(0,0,0,0.03)` via a `.row-hover` utility, or inline on-hover style.

Sort:

- When `dayFilter` is a day: by earliest class `startTime` on that day (keeps current day-view usefulness).
- Otherwise: by `clientName` ASC (`localeCompare`).

Empty state (inside the card):

- If `students.length === 0`: "No students yet." + hint "Students are created automatically when you add a booking or mark a class done."
- If filter/search yields 0: "No students found."

### Detail content (rendered in both the desktop right pane and the mobile modal body)

Wrapped in a `.card` on desktop (`padding: 20`); on mobile the `PaperModal` already provides padding.

**Header row** (`display: flex, align-items: flex-start, gap: 14, margin-bottom: 20`):

- `Avatar` 56px (left).
- Middle: name (20px, semibold, `letter-spacing: -0.4px`); subline (13px, `var(--ink-3)`, `gap: 10`) with `<IconPhone size={12} /> {clientPhone}` and mono `joined {Mmm D, YYYY}` formatted from `student.createdAt`.
- Right: single outline icon button (`IconEdit` 13px) — opens **Edit details** modal.

**Three MiniStat cards** (`grid-template-columns: repeat(3, 1fr)`, gap 10):

- `WALLET` — value `RM {balance.toFixed(0)}` in mono tnum. Negative balances render with `tone="bad"` (colour `var(--bad)`). Renders `—` if no wallet linked.
- `WEEKLY` — value is the count of this student's confirmed, non-ended recurring bookings.
- `ALL-TIME` — value is `studentLogs.length` (from the already-subscribed `useLessonLogs` for the selected student). Sub-label `lessons done`.

MiniStat shape: `padding: 12`, `background: var(--bg)`, border `var(--line)`, `border-radius: 10`. Label 10.5px uppercase `var(--ink-3)`. Value 18px mono tnum semibold, `letter-spacing: -0.4px`. Sub 11px `var(--ink-3)`.

**Notes card** (only if `student.notes` is non-empty):

- `IconSparkle` 14px `var(--ink-3)` + notes text 13px `var(--ink-2)` on `var(--bg)`, border `var(--line)`, rounded 10, `padding: 14`, `gap: 10`.

**Weekly schedule section**:

- Eyebrow `WEEKLY SCHEDULE`.
- Rows (sorted Mon→Sun), each showing:
  - Day abbrev (`MON`, uppercase, 11px, `var(--ink-3)`, 36px fixed width).
  - Mono time range `{fmtTimeShort(start)}–{fmtTimeShort(end)}`, 12.5px, 90px fixed width.
  - `locationName` (12.5px, `var(--ink-2)`, flex 1, truncate).
  - Right-aligned `RM {studentPrices[student.id] || 0}` in mono tnum.
- Empty: italic "No recurring bookings." in `var(--ink-4)`.

**Recent lessons section**:

- Eyebrow `RECENT LESSONS`.
- Rows, each showing: mono date (`MMM D` format, 84px fixed), mono start time (`fmtTimeShort`), `locationName` (flex 1, truncate), `RM {price}` in mono, `✕` delete icon button (11px, `var(--ink-3)` → `var(--bad)` on hover).
- Row separator: `border-bottom: 1px solid var(--line)` (last row drops it).
- Paging: keep existing behaviour — 20 rows per page via `logLimit`, with a `Load more` text button at the bottom when `studentLogs.length >= logLimit`.
- Empty: italic "Nothing yet." in `var(--ink-4)`.
- Delete flow: clicking `✕` opens the existing confirm `PaperModal`; on confirm, calls the unchanged `handleDeleteLog(logId)` which writes a `refund` transaction and deletes the log.

**Danger footer**:

- Full-width top border `1px solid var(--line)`, `padding-top: 16`, `margin-top: 20`.
- Right-aligned small link: `Delete student` in `var(--bad)`, 12.5px, no background. Click → opens the existing cascade-confirm `PaperModal` preserving today's wording ("This removes the student record. Lesson history will be lost. Their N active booking(s) will also be cancelled.").

### Mobile layout

Below `sm` (640px):

- Hide the detail pane entirely.
- List renders full-width.
- Tapping a row sets `selectedId` and opens a `PaperModal` titled with `clientName`. Modal body: the same `StudentDetail` subtree.
- Closing the modal sets `selectedId = null`.

Implementation: a single `StudentDetail` component is rendered in two places but only one ever displays content.

1. Desktop right pane: a `<div className="hidden sm:block">` containing `<StudentDetail … />` — Tailwind removes it from layout below `sm`.
2. Mobile modal: a `<PaperModal>` whose `open` prop is `selectedId !== null && isMobile`. `isMobile` comes from a `useIsMobile()` hook that wraps `window.matchMedia('(max-width: 639px)')` and subscribes to changes (standard pattern — fallback to `false` during SSR).

`PaperModal` itself returns `null` when `open` is false, so the modal does not render on desktop even if `selectedId` is set. The two trees never show simultaneously.

### Selection behaviour

- `const [selectedId, setSelectedId] = useState<string | null>(null);`
- On desktop (`!isMobile`), auto-select the first filtered student so the detail pane is never empty when data exists. Use a `useEffect` whose deps are `[isMobile, filtered, selectedId]`: when `!isMobile` and either `selectedId === null` or `selectedId` is not in `filtered`, set it to `filtered[0]?.id ?? null`.
- On mobile, `selectedId` doubles as the modal-open signal. No auto-select — it only gets set when the user taps a row.

### Adaptive filter

`owingStudentIds`: computed once via `useMemo` from `wallets` — the set of student IDs where any linked wallet has `balance < 0`. A student appears in the Owing view when their id is in that set.

### fmtTimeShort

Same helper as the Schedule page. Duplicate locally:

```ts
function fmtTimeShort(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'p' : 'a';
  const h12 = hh % 12 || 12;
  if (mm === 0) return `${h12}${period}`;
  return `${h12}:${String(mm).padStart(2, '0')}${period}`;
}
```

### Date formatting

Use the existing `formatDateMedium` from `@/lib/date-format` for lesson-row dates and the header `joined` line. `student.createdAt` is a Firestore `Timestamp` — call `.toDate()` first (or handle if already a Date; match what current file does).

## Units and components

Single file, same shape as Schedule page:

- `StudentsPage` (default export) — data loading, all memos, top-level layout switch, modal state.
- `StudentListRow` — one row in the list. Props: `student`, `wallet`, `bookingCount`, `selected`, `onClick`.
- `StudentDetail` — the full detail content block. Props: `student`, `wallet`, `studentBookings`, `studentLogs`, `logsLoading`, `logLimit`, `onEdit`, `onDeleteLog`, `onDeleteStudent`, `onLoadMore`.
- `MiniStat` — label + value + optional sub + optional `tone="bad"`. Props: `label`, `value`, `sub?`, `tone?`.
- `EditDetailsModal` — name + phone + notes form in a `PaperModal`.
- `DeleteLessonModal`, `DeleteStudentModal` — confirmation dialogs in `PaperModal`.

No new files under `@/components/paper`.

## Files changed

- `src/app/dashboard/students/page.tsx` — full rewrite.

Nothing else. No new files.

## Testing

Manual smoke on the live Vercel URL (test coach):

- Empty state (no students): renders header + hint.
- Typical roster: list sorted alphabetically, first student auto-selected on desktop, detail pane populated.
- Search by name and phone both filter correctly.
- Each filter chip works: `All`, `Owing` (matches wallets with negative balance), `No booking` (students with no recurring), each active day (sorted by `startTime`).
- Desktop: clicking a list row swaps the detail pane content. Selected row is highlighted.
- Mobile (< 640px): list full-width; tapping a row opens modal; closing returns to list.
- Edit icon → modal opens, save writes to Firestore, toast fires.
- Delete lesson log → confirm modal, on confirm the lesson disappears and the wallet balance increases by the refunded amount in real time.
- Delete student → confirm modal shows cascade warning, on confirm student disappears and their bookings flip to cancelled.
- Dark mode toggles cleanly.

No new unit tests — project has none for dashboard pages.

## Risks

- **Auto-select on initial load / filter change** could flicker if `filtered` recomputes between renders. Mitigated by a single `useEffect` with `selectedId` and `filtered` as deps that only updates when `selectedId` is invalid.
- **Owing filter** depends on `wallets` loading before students are filterable — if wallets hook hasn't resolved, Owing shows 0 temporarily. Acceptable — matches how `studentsWithBookings` already depends on `bookings`.
- **PaperModal body scroll on long lesson histories** — handled by `PaperModal`'s built-in `overflow-y: auto` on the body.
- **Student with `notes: ""` vs `notes: undefined`** — Notes card condition is `student.notes?.trim()` to avoid rendering an empty card for whitespace-only notes.

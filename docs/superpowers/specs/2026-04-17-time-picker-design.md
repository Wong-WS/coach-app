# TimePicker Component — Design Spec

**Date:** 2026-04-17
**Status:** Approved, ready for implementation planning

## Problem

Three time-input spots in the app use inconsistent, clunky patterns:

1. **Add Class modal** — native `<select>` with 216 options (5-min slots × 18 hours). Produces a full-screen scrolling list — the screenshot that motivated this work.
2. **Reschedule Class modal** — native `<input type="time">`.
3. **Edit Class modal** — native `<input type="time">`.

Native controls render wildly differently across OS/browser and the giant `<select>` is unusable. No unified UX.

## Goal

One shared `<TimePicker>` component used in all three spots, with a UX that feels good on both desktop and mobile.

## Approach

**Desktop:** typeable input with smart parsing + a short dropdown of nearby 5-min slots.
**Mobile:** iOS-style wheel picker in a bottom sheet (three scrollable columns: hour, minute, AM/PM).

Device selection via `matchMedia('(pointer: coarse)')`, re-evaluated on resize.

## Component API

```tsx
<TimePicker
  value="09:05"              // "HH:MM" 24h format, always
  onChange={(v: string) => void}
  label?: string
  id?: string
  step?: number              // minute granularity for the dropdown; default 5
  contextHalfDay?: 'AM' | 'PM'   // optional, biases typed AM/PM inference
  ariaLabel?: string
/>
```

- **Storage format:** `"HH:MM"` in 24h (unchanged from today). Callers don't change how they store/read times.
- **Display format:** uses existing `formatTimeDisplay` helper (e.g. `"9:05 AM"`).
- The component is **isolated** — it does not know about paired start/end fields, min/max bounds, or form validation. Those stay in the parent (caller retains `shiftEndTime`, `checkOverlap`, etc.).

## Desktop Behavior

**Visual:** input field showing formatted time (e.g. `9:05 AM`) in monospace. Right-side caret glyph.

**On focus / click:** dropdown opens beneath the input showing ~6–8 5-min slots near the current value. Currently-selected slot is highlighted. Scrollable within the dropdown; not full-screen.

**On typing:** field switches to raw typing mode. Parser handles:

| Typed input    | Parses to |
|----------------|-----------|
| `9`            | 09:00     |
| `9a` / `9am`   | 09:00     |
| `9p` / `9pm`   | 21:00     |
| `905` / `9:05` | 09:05     |
| `9 30`         | 09:30     |
| `13` / `1300`  | 13:00     |
| `21:05`        | 21:05     |

**AM/PM inference when no suffix typed:**
- `0` interpreted as midnight (`00:00`).
- `12` interpreted as noon (`12:00`).
- Numbers `13`–`23` interpreted as 24-hour (e.g. `21` → 21:00). `24` and above are invalid.
- Otherwise (`1`–`11`):
  - If `contextHalfDay` prop is set (end-time fields pass the start-time's half-day), use that.
  - Else default to AM.
- Explicit `a`/`p`/`am`/`pm` suffix always overrides all inference.

**Keyboard:**
- `↑ / ↓` — navigate dropdown suggestions.
- `Enter` — commit currently-highlighted value; close dropdown.
- `Esc` — revert to last valid value; close dropdown.
- `Tab` — commit + move focus to next field.

**Invalid input:** red border, tooltip `"Couldn't understand 'xyz'"`. On blur, field reverts to last valid value — never stores or emits invalid values.

**Step vs typing:** `step={5}` controls what the dropdown shows, but typed input can land on any minute (e.g. `9:07` is accepted if typed explicitly). When the current value is off-step (e.g. `9:07`), the dropdown highlights the nearest step slot (`9:05`) but does not change the value.

## Mobile Behavior

**Trigger:** tapping the input opens a bottom sheet that slides up and dims the page.

**Sheet header:** `Cancel` (left) · label text, e.g. `Start time` (center) · `Done` (right, accent color).

**Sheet body:** three wheel columns side-by-side:
- **Hour** — 1 through 12. (24h `value` prop is converted to 12h for display; wheel selection is converted back to 24h on commit.)
- **Minute** — 00, 05, 10, … 55 (based on `step`).
- **AM / PM** — two rows.

Each column is independently scrollable. Center row of each column is the selected value, indicated by accent-colored horizontal rules above and below.

**Interaction:**
- Swipe a column to scroll; CSS `scroll-snap-type: y mandatory` snaps to rows.
- `Done` commits the centered values and emits `onChange`.
- `Cancel` or tap-outside dismisses without change.

**Layout:**
- Sheet height ~60% of viewport.
- Wheel columns ~200px tall.
- Safe-area padding at bottom (`env(safe-area-inset-bottom)`) for iPhone.

## Edge Cases

| Case | Behavior |
|---|---|
| Value prop updated externally | Component re-syncs display from the new `value` |
| User types invalid text, then blurs | Revert to last valid value; no `onChange` fired |
| User types valid but non-step minute (e.g. 9:07) | Accept; emit `"09:07"` |
| Dropdown would render off-screen (bottom) | Flip to render above the input |
| Mobile sheet opens when keyboard already up | Dismiss keyboard first, then show sheet |
| `step` changes mid-session | Dropdown re-computes; typed value is untouched |

## Rollout

All three call sites are in `src/app/dashboard/page.tsx`. Swap:

1. **Add Class modal** — lines ~1843 and ~1852. Replaces both `<select>` with `<TimePicker>`. Delete `generateTimeOptions` helper (line 225) after swap.
2. **Reschedule modal** — lines ~1330 and ~1337. Replaces `<Input type="time">`.
3. **Edit Class modal** — lines ~1488 and ~1501. Replaces `<Input type="time">`.

End-time fields pass `contextHalfDay` derived from the current start-time value.

No data model changes. No Firestore schema changes. Storage format remains `"HH:MM"`.

## Files Changed

- **New:** `src/components/ui/TimePicker.tsx` — component.
- **New:** `src/components/ui/TimePicker.test.tsx` — unit tests for the parser and inference logic at minimum.
- **Updated:** `src/components/ui/index.ts` — export.
- **Updated:** `src/app/dashboard/page.tsx` — swap 6 time-input usages; delete `generateTimeOptions`.

## Out of Scope

- Changing how times are stored in Firestore.
- Reworking `shiftEndTime` / `checkOverlap` / overlap-warning logic.
- Working-hours time configuration (settings page uses a different UI).
- Time-zone handling — app remains single-timezone (per coach).
- Any `min` / `max` bounding — component stays dumb; bounds are a parent-form concern if ever needed.

## Success Criteria

- All three time-input spots use `<TimePicker>` with identical look, keyboard behavior, and mobile presentation.
- No scrolling list longer than ~8 items on desktop; no native `<select>` time dropdowns anywhere.
- Mobile users get a one-handed bottom-sheet wheel instead of a system time picker.
- Parser accepts every format listed above; rejects anything else without losing prior value.

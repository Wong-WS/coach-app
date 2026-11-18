# Portal Replacement Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show parents, on their existing portal page, the coach's real free slots for a replacement class at their child's main pool over the next 3 weeks.

**Architecture:** A pure module `src/lib/replacement-slots.ts` turns the bookings, exceptions and time off that `fetchPortalData` already loads into a small, safe list of sections and dated slots. Only that list is added to `PortalPayload` and passed to a client component on the portal page. No new Firestore reads.

**Tech Stack:** Next.js 16 App Router (server component + one client component), TypeScript, Firebase Admin SDK (existing), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-portal-replacement-slots-design.md`

## Global Constraints

- No new Firestore reads; reuse `bookings`, `exceptions`, `awayPeriods` already loaded in `fetchPortalData`.
- Only `{ poolName, lessonMinutes, forClass, hideWeekdayMornings, days: [{ date, slots: [{ start, end, weekdayMorning }] }] }` may reach the client. Never pass bookings, exceptions, ids, other pools, names or prices as props.
- Day bounds 08:00–21:00 and travel 30 min come from `DAY_START`, `DAY_END`, `TRAVEL_MIN` in `src/lib/schedule-gaps.ts`.
- Weekday-morning rule: section hides weekday (Mon–Fri) slots starting before **12:00** behind "Show morning slots" when its weekly class starts at or after **14:00**. Weekends always show everything.
- Dates: tomorrow (Malaysia time) through Sunday of the week after next. Skip dates inside time off.
- Placement: a folded row **after Recent lessons, before Top-ups**. Copy: "Need a replacement class?" / "See {coach}'s free slots at {pool}"; opened: "Free {n}-minute slots at {pool}" (use "1-hour" when 60, "1½-hour" when 90); footer "Message {coach} with the time you'd like." and "Updated live — check back if nothing fits."
- Paper & Ink tokens only; `.mono .tnum` on times; never `window.alert/confirm`.
- Commit + push to `main` after each task (check `git branch --show-current`).

## Review Focus

1. Two classes at different pools with a 1-hour gap: nothing may be offered there (travel). Test in Task 1.
2. A date where a class was cancelled, moved in, or a one-off added: slots must reflect that date, not the weekly pattern. Test in Task 1.
3. Dates inside the coach's time off: absent from the list. Test in Task 2.
4. Server runs in UTC: between midnight and 8 am in Malaysia, "tomorrow" must still be Malaysia's tomorrow. Test in Task 3.
5. Page data leak: the section list must contain no booking ids, student ids or other pools. Test in Task 2, plus the page-payload check in Task 4.

---

### Task 1: Free slots on one date

**Files:**
- Modify: `src/lib/schedule-gaps.ts` (export `toMin`, `toTime`)
- Create: `src/lib/replacement-slots.ts`
- Test: `src/lib/__tests__/replacement-slots.test.ts`

**Interfaces:**
- Produces: `slotsForDate(classes: Booking[], poolId: string, lessonMinutes: number): { start: string; end: string }[]`. `classes` are that date's classes (from `getClassesForDate`). Times are "HH:MM".

Rule: walk classes by start time with a running latest end. Each window between `DAY_START`, the classes and `DAY_END` is usable at `poolId` after subtracting `TRAVEL_MIN` on a side whose neighbouring class is at a different `locationId` (no subtraction at the day's start/end or for the same pool). In a usable window `[s, e]`, offer slots starting at s, s+L, s+2L… that end ≤ e, plus the slot ending exactly at e if it's not already offered. Return them sorted, with no duplicates.

- [ ] **Step 1: Write failing tests**

```ts
// helper: cls(start, end, locationId)
slotsForDate([], 'permai', 60)                         // 13 slots 08:00–09:00 … 20:00–21:00
slotsForDate([cls('16:30','17:30','permai')], 'permai', 60)
  // includes { start:'15:30', end:'16:30' } and { start:'17:30', end:'18:30' }; first is 08:00–09:00
slotsForDate([cls('12:00','13:00','granito'), cls('14:30','15:30','quavside')], 'granito', 60)
  // contains 13:00–14:00 (same pool before, travel only before Quavside)
slotsForDate([cls('12:00','13:00','granito'), cls('14:30','15:30','quavside')], 'quavside', 60)
  // contains 13:30–14:30
slotsForDate([cls('12:00','13:00','granito'), cls('14:00','15:00','quavside')], 'permai', 60)
  // nothing between 13:00 and 14:00 (Review Focus 1)
slotsForDate([cls('16:00','16:45','permai')], 'permai', 45)  // 45-min slots; includes 15:15–16:00 and 16:45–17:30
slotsForDate([cls('07:00','08:30','permai')], 'permai', 60)  // first slot 08:30–09:30
slotsForDate([cls('20:30','21:30','permai')], 'permai', 60)  // last slot ends ≤ 20:30
// overlapping classes 10:00–11:00 and 10:30–11:30 at permai → next slot starts 11:30
```

Review Focus 2 (in the same file, via `getClassesForDate`): build a weekly Thursday booking at permai 16:30–17:30 plus a cancelled exception for `2026-11-20` → `slotsForDate(getClassesForDate('2026-11-20', …), 'permai', 60)` includes 16:30–17:30; and a one-off booking on that date at 10:00–11:00 → 10:00–11:00 is not offered.

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/replacement-slots.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `slotsForDate`, after exporting `toMin` and `toTime` from `schedule-gaps.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npx vitest run`: all pass.
- [ ] **Step 5: Commit** `portal: free replacement slots for one date`.

---

### Task 2: Sections for a family

**Files:**
- Modify: `src/lib/replacement-slots.ts`
- Test: `src/lib/__tests__/replacement-slots.test.ts`

**Interfaces:**
- Consumes: `slotsForDate` (Task 1); `getClassesForDate`, `isDateInAwayPeriod`, `getDayOfWeekForDate`.
- Produces:
  - `type ReplacementSlot = { start: string; end: string; weekdayMorning: boolean }`
  - `type ReplacementSection = { poolName: string; lessonMinutes: number; forClass: string | null; hideWeekdayMornings: boolean; days: { date: string; slots: ReplacementSlot[] }[] }`
  - `mainWeeklyClass(studentId: string, bookings: Booking[], today: string): Booking | null`: confirmed bookings containing the student, weekly (`startDate !== endDate` or no `startDate`), still running (`!endDate || endDate >= today`). Prefer the pool with the most such classes, then the earliest `startTime`.
  - `replacementSections(a: { studentIds: string[]; bookings: Booking[]; exceptions: ClassException[]; awayPeriods: AwayPeriod[]; today: string }): ReplacementSection[]`. Dates run from `today + 1` through the Sunday of the week after today's week. Sections are merged by (locationId, lessonMinutes). `hideWeekdayMornings` is true when every merged main class starts at or after 14:00. `forClass` is "Thu 4:30pm" only when there is more than one section. Each slot has `weekdayMorning = Mon–Fri && start < '12:00'`.
  - `weekLabel(date: string, today: string): string`: "This week" | "Next week" | "Week of 1 Dec" (Mon-based weeks).

- [ ] **Step 1: Write failing tests**

```ts
// mainWeeklyClass: two weekly classes at Permai + one at Quavside → a Permai one; ended series and one-offs ignored; none → null
// replacementSections, today '2026-11-18' (Wed): dates run 2026-11-19 … 2026-11-30 (Sun of the week after next)
// time off 2026-11-21..2026-11-23 → those dates absent (Review Focus 3)
// one student with weekly Thu 16:30 → hideWeekdayMornings true; forClass null; a weekday 09:00 slot has weekdayMorning true; Sat 09:00 false
// weekly class at 13:00 → hideWeekdayMornings false
// siblings s1, s2 on the same Permai 60-min class → one section; s1 Permai + s2 Quavside → two sections, forClass 'Thu 4:30pm' / 'Sat 9am'
// no weekly class for anyone → []
// Review Focus 5: JSON.stringify(sections) contains no booking id, no student id, no other pool's name
// weekLabel('2026-11-20','2026-11-18') 'This week'; ('2026-11-24',…) 'Next week'; ('2026-12-01',…) 'Week of 1 Dec'
```

- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test file, then `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `portal: replacement sections per family`.

---

### Task 3: Add to the portal payload

**Files:**
- Modify: `src/lib/portal-data.ts` (`PortalPayload`, `fetchPortalData`)
- Create: `src/lib/time-zone.ts`
- Test: `src/lib/__tests__/time-zone.test.ts`

**Interfaces:**
- Produces: `isoDateInTimeZone(at: Date, timeZone: string): string` (via `Intl.DateTimeFormat('en-CA', { timeZone })`); `PortalPayload.replacement: ReplacementSection[]`.

- [ ] **Step 1: Write failing test.** `isoDateInTimeZone(new Date('2026-11-18T17:30:00Z'), 'Asia/Kuala_Lumpur')` → `'2026-11-19'`; `new Date('2026-11-18T15:00:00Z')` → `'2026-11-18'` (Review Focus 4).
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/time-zone.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `isoDateInTimeZone`. In `fetchPortalData`, add `replacement: replacementSections({ studentIds: ctx.studentIds, bookings, exceptions, awayPeriods, today: isoDateInTimeZone(new Date(), 'Asia/Kuala_Lumpur') })` to the returned payload. Don't change the existing `today` used for wallet health.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: pass (ignore the stale `.next` `reset-account` error).
- [ ] **Step 5: Commit** `portal: include replacement slots in portal data`.

---

### Task 4: Portal UI and ship

**Files:**
- Create: `src/app/portal/[token]/ReplacementSlots.tsx` (client)
- Modify: `src/app/portal/[token]/page.tsx` (insert between the Recent lessons and Top-ups sections)

**Interfaces:**
- Consumes: `ReplacementSection[]`, `weekLabel` (Task 2); `coach.displayName`.
- `ReplacementSlots({ sections: ReplacementSection[]; coachName: string; today: string })`. It renders nothing when `sections` is empty. Folded: a single panel row the size of a lesson row. Open: per section, the label, then days grouped by `weekLabel`. Only the first two week groups show at first, plus a "+ {third label} ›" button. Each date row shows its times as green pill labels (not buttons), or "Fully booked". When `hideWeekdayMornings` is set, it hides `weekdayMorning` slots until "Show morning slots" is tapped (per section). A date whose only slots are hidden mornings shows "Mornings only".

- [ ] **Step 1: Implement** the component and the page insert (pass `today` from the server, the same Malaysia date used in Task 3).
- [ ] **Step 2: Verify:** `npm run lint` clean; `npm run build` passes (unsandboxed).
- [ ] **Step 3: Commit + push**, then wait for Vercel `success` on the commit (`gh api repos/Wong-WS/coach-app/commits/<sha>/status`).
- [ ] **Step 4: Payload leak check** (Review Focus 5). Fetch the live portal for a test-account wallet with weekly classes, using its token from the test account, and grep the HTML/RSC payload for any booking id or `studentIds` value, which must be absent. Ask the coach to open one of their real portal links on a phone.
- [ ] **Step 5:** Update `NOTES.md` (mark the ⭐ replacement-availability item ✅ with the date) and the CLAUDE.md portal description. Commit and push.

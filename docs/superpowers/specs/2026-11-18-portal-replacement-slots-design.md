# Portal: replacement-class slots — design

Date: 2026-11-18
Status: mockup approved (`.superpowers/brainstorm/50167-1794987833/content/portal-v3.html`); builder-checked; awaiting the coach's approval

## Why

When a parent asks to reschedule ("they can't make Thursday for the next 3 weeks"), the coach currently needs about a day to work out free slots, types them into WhatsApp, and often the parent can't make any — "let me know if other slots open up later", which puts the job back on the coach. The parent already has a portal link (`/portal/[token]`). Let them see the coach's real free slots there, any time, then message the coach as usual with the time they want. The coach still books it themselves.

The coach's priorities: the portal's main job is still balance + recent lessons; replacements are occasional and must not push that down. Keep it simple ("if it works, it's good").

## Goals

- A folded row on the portal, **below Recent lessons and above Top-ups**: "Need a replacement class? See Coach Wong's free slots at Permai ›". Tapping it opens the list in place.
- Opened: free slots grouped by week ("This week", "Next week", then "+ Week of 1 Dec ›" reveals the third week), one line per date with the times as green buttons; a date with nothing free says "Fully booked" (only for dates in range that have no slot). Footer: "Updated live — check back if nothing fits."
- Times are plain labels, not buttons (no tap-to-WhatsApp — dropped by the coach). A line under the list: "Message Coach Wong with the time you'd like."
- Slots are real dated slots: they reflect one-off classes, cancellations, reschedules and time off on that date — not the weekly pattern.
- Only slots at the student's **main pool**, of the student's **usual lesson length**, with travel counted so the coach is never double-booked across pools.

## Non-goals

- Parents booking directly into the schedule. Nothing is written by the portal; the coach adds the class as today.
- A pre-filled WhatsApp message / coach WhatsApp number (considered, dropped by the coach).
- Notifications when a slot opens up. Parents check back themselves.
- Per-pool-pair travel times. One fixed 30-minute travel time between different pools (coach: "when travel buffer is shorter, just leave it as it is").
- Coach-side curation of which slots to offer (e.g. hiding some). Every free slot that passes the rules is shown.

## Anti-goals

- Offering a slot the coach can't actually make (overlap, or not enough travel time between pools).
- Showing anything about other students (names, classes) — parents see only free times.
- **Leaking the schedule through page data.** Slots must be computed on the server (in `fetchPortalData` or the server component) and only the finished list — `{ date, start, end }` per slot, plus the section label and the morning flag — may be passed to any client component. Never pass bookings, exceptions, other pools, names or prices as props: React Server Component props are serialized into the page and readable by anyone with the link. Verify before shipping by checking the page's HTML/RSC payload contains no booking IDs, student IDs or other pools.
- Making the portal slower or costlier: no new Firestore reads — everything comes from what `fetchPortalData` already loads.

## Rules (decided)

- **Main pool & lesson length** per student: from the student's confirmed weekly booking(s) (`startDate !== endDate`, i.e. not one-off, and still running: no `endDate` or `endDate >= today`). If a student has weekly bookings at more than one pool, use the pool with the most weekly classes; tie → the earliest-starting weekly class *(my call)*. Lesson length = that booking's `endTime − startTime`.
- **Who gets a section**: each student in the wallet with a weekly booking. Students sharing the same main pool and lesson length are combined into one section. Students with no weekly booking get none. If nobody has one, the row is hidden *(my call)*.
- **Section label** (no names, so no extra reads): "Free 1-hour slots at Permai". Only when a wallet has more than one section, add the weekly class it replaces: "… for the Thu 4:30pm class" *(my call)*.
- **Dates**: tomorrow through 3 weeks (Mon–Sun weeks: the rest of this week, next week, the week after). Skip dates inside the coach's time off (`awayPeriods`).
- **Day hours**: 8 am – 9 pm every day, the same fixed values as the Schedule page (`DAY_START`, `DAY_END` in `src/lib/schedule-gaps.ts`). Days with no classes are offered too (coach chose "everything").
- **Weekday mornings (coach's rule)**: if a section's weekly class starts at or after **2 pm**, weekday (Mon–Fri) slots starting **before 12 pm** are hidden behind a "Show morning slots" button in that section (one tap reveals them for all dates). If the weekly class starts before 2 pm, everything is shown — they're likely a morning/adult student. Weekends always show everything. "Morning" = before 12 pm *(interpretation: the coach offered 1–2 pm weekday slots to an afternoon family, so early-afternoon slots must stay visible)*.
- **Busy time** on a date = `getClassesForDate(date, confirmedBookings, exceptions, awayPeriods)` (`src/lib/class-schedule.ts`) — includes one-offs and moved classes, drops cancellations.
- **Free windows at pool P with length L**: between consecutive classes (and from DAY_START / to DAY_END), the usable window at P shrinks by 30 min on a side where the neighbouring class is at a different pool (none for the same pool; none at the day's start/end).
- **Shown as free windows, not individual slots** *(changed 2026-11-18 after the coach saw 7–8pm missing between 6:30–7:30 and 7:30–8:30)*: each date lists its free windows at P that are at least L long, e.g. "8am–3pm", "6:30–9pm"; any lesson-length time inside works. When weekday mornings are hidden, a window starting before 12 pm is shown from 12 pm (or dropped if less than L remains).
- **Mobile first**: the portal is used on phones; the slot buttons must be easy to tap.

## Reuse

- `getClassesForDate`, `isDateInAwayPeriod` for busy time.
- `fetchPortalData` (`src/lib/portal-data.ts`) already loads confirmed bookings, exceptions ±120 days and away periods via the Admin SDK — compute slots server-side from those and pass them to the page. No new queries.
- Travel constant `TRAVEL_MIN`, day bounds from `src/lib/schedule-gaps.ts` (share, don't duplicate).
- Portal styling: Paper & Ink tokens, `.mono`/`.tnum` for times.

## Left to the builder

- File/function names; whether the folded row is a small client component (it needs open/close state).
- Exact copy beyond the strings above; empty-state wording.
- Tests: the slot algorithm should be a pure function with unit tests (same-pool vs different-pool travel, day start/end, time off, one-off and cancelled classes on a date, lesson length 45/60/90 min, multi-pool student main-pool choice, sibling combining, the weekday-morning rule at the 2 pm / 12 pm boundaries).

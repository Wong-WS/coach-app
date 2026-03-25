# CoachApp Notes

## Bugs / Broken Things

- ✅ (2026-03-24) Memory leak in `useCoachBySlug` — nested `onSnapshot` inside outer `onSnapshot` never gets unsubscribed. Inner listener accumulates on every outer update. (`src/hooks/useCoachData.ts`)

## Architecture Questions

1. (2026-03-23) **Payment–lesson log coupling is fragile** — credit, pendingPayment, and prepaidUsed are derived counters on the student doc, updated incrementally on each mark-as-done / delete. Deleting and re-adding lessons can desync these values (e.g., credit lost). Need a more robust approach — e.g., recompute totals from lessonLogs + payments on the fly, or link payments directly to lesson logs, so the source of truth is always the raw records rather than mutable counters.

2. (2026-03-23) **Giant page components** — `dashboard/page.tsx` (1646 lines, 48 useState) and `students/page.tsx` (1592 lines, 46 useState) are doing too much. Should we extract modal flows into separate components/hooks? What's the right split?

3. (2026-03-23) **No pagination on Firestore queries** — all hooks (`useBookings`, `useStudents`, `useLessonLogs`, etc.) load entire collections into memory with no limits. Fine for now with one coach, but won't scale. When should we add pagination, and which collections first?

4. (2026-03-23) **ClassExceptions grow unbounded** — every single-date cancellation or reschedule creates a `classException` doc that's never cleaned up. A coach cancelling one class per week = 52 docs/year per booking. Should we add a cleanup strategy or TTL?

5. (2026-03-23) **No global error boundary** — errors are handled per-action with try/catch + toast. An unhandled error in any component crashes the whole app. Should we add `error.tsx` files and/or a global error boundary?

6. (2026-03-23) **Client-side Firebase on every page** — Firebase SDK bundles on all pages even public ones that only use API routes. Should we lazy-load or tree-shake it for public pages?

7. (2026-03-23) **No caching on availability API** — every public page load recalculates availability from scratch. Should we add Cache-Control headers or client-side caching?

8. (2026-03-23) **Multiple entry points for creating students/bookings** — bookings can be created from both the Bookings page and the Overview (Today's Classes) page via ad-hoc classes. Students get auto-created in multiple places too. This risks inconsistent data (e.g., pricing, package tracking, lesson logs). Should we consolidate to a single flow for each? Need to balance simplicity vs. convenience — the ad-hoc class feature on Overview is handy, but it bypasses the full booking form. Think about: what's the ideal flow where data stays clean (lesson logs, prepaid tracking, payments) without making the coach jump between pages?

9. (2026-03-23) **Recurring booking model vs. individual instances** — currently bookings are recurring (one doc per weekly slot) with exceptions tracked separately. This requires loading all bookings + all exceptions to render any single day. Would flattening to individual booking instances be better as data grows?

## Next Session

- ✅ (2026-03-24) Edge case: Woojin + 3 kids class — 4 kids as one student record, one parent pays for all. Holiday scenario (2 kids away) handled by adjusting price on mark-as-done. Switching to pay-per-lesson now clears pending balance. Renamed "due" → "unpaid" labels.

## Ideas (not urgent)

- ✅ (2026-03-25) Run full E2E bug hunt using Chrome MCP — fixed 12 UI/UX bugs, wrote 65 unit tests, fixed prepaidUsed increment bug for non-package students
- (2026-03-23) UI/UX design overhaul — revisit the overall app design
- WhatsApp/SMS notifications
- Custom domains
- ✅ (2026-03-24) Production guardrails: prevent marking done for future dates
- Production guardrails: restrict prepaid package editing (admin mode or audit log)
- Production guardrails: lesson log deletion safeguards (confirmation dialog, soft-delete, time-limited)
- ✅ (2026-03-25) Income page: projected collected income — shows current & next month projections based on package renewals (day-by-day exhaustion calculation) and pay-per-lesson charges (primary bookings only, remaining days for current month)

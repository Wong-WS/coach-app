# CoachApp Notes

## Bugs / Broken Things

- ✅ (2026-03-24) Memory leak in `useCoachBySlug` — nested `onSnapshot` inside outer `onSnapshot` never gets unsubscribed. Inner listener accumulates on every outer update. (`src/hooks/useCoachData.ts`)

## Architecture Questions

1. ✅ (2026-04-28) **Payment–lesson log coupling is fragile** — old derived counters (credit, pendingPayment, prepaidUsed) fully removed by 2026-04-16 wallet system. Lesson delete flow had regressed to non-atomic sequential awaits in `students/page.tsx` (commit 79de2a6) — restored to `writeBatch` so refund txn + balance bump + lessonLog delete now commit atomically. Wallet ledger and balance counter can no longer desync.

2. (2026-03-23) **Giant page components** — `dashboard/page.tsx` and `students/page.tsx` are doing too much.
   - (2026-04-28) **Dashboard fully refactored:** extracted 6 components into `src/app/dashboard/_components/` (`FieldLabel`, `EditClassModal`, `AddLessonModal`, `MarkDoneModal`, `BulkMarkDoneConfirmModal`, `DepletedWalletAlert`). `dashboard/page.tsx` dropped 3317 → 1929 lines (-1388, -42%). Each modal lifts its state via props rather than closing over parent state. Skipped the 16-line cancel-scope wrapper (already calls standalone `CancelScopeBody`, not worth a pass). Remaining presentational helpers (`DesktopHero`, `WeekStrip`, `ClassCard`, `StatCard`, `LowWalletsCard`, etc.) still inline — extract later if friction warrants it. `payments/page.tsx` (1887) and `students/page.tsx` (1193) still untouched.

3. (2026-03-23) **No pagination on Firestore queries** — all hooks (`useBookings`, `useStudents`, `useLessonLogs`, etc.) load entire collections into memory with no limits. Fine for now with one coach, but won't scale. When should we add pagination, and which collections first?

4. (2026-03-23) **ClassExceptions grow unbounded** — every single-date cancellation or reschedule creates a `classException` doc that's never cleaned up. A coach cancelling one class per week = 52 docs/year per booking. Should we add a cleanup strategy or TTL?

5. ✅ (2026-04-28) **No global error boundary** — added `error.tsx` at root, `/dashboard`, and `/portal/[token]`. Unhandled errors now show a Paper & Ink fallback card with "Try again" + escape link instead of a white screen. Logs to console with error digest for debugging.

6. (2026-03-23) **Client-side Firebase on every page** — Firebase SDK bundles on all pages even public ones that only use API routes. Should we lazy-load or tree-shake it for public pages?

7. (2026-03-23) **No caching on availability API** — every public page load recalculates availability from scratch. Should we add Cache-Control headers or client-side caching?

8. ✅ (2026-04-16) **Multiple entry points for creating students/bookings** — resolved by unified booking creation. Overview page is now the single entry point for both one-time and recurring lessons. Bookings page renamed to Schedule (read-only). Students page creation forms removed.

9. (2026-03-23) **Recurring booking model vs. individual instances** — currently bookings are recurring (one doc per weekly slot) with exceptions tracked separately. This requires loading all bookings + all exceptions to render any single day. Would flattening to individual booking instances be better as data grows?

## Next Session

- ✅ (2026-04-28) **Add Vercel domains to Firebase Authorized Domains** — done. Google sign-in works on prod/preview URLs.
- ✅ (2026-03-24) Edge case: Woojin + 3 kids class — 4 kids as one student record, one parent pays for all. Holiday scenario (2 kids away) handled by adjusting price on mark-as-done. Switching to pay-per-lesson now clears pending balance. Renamed "due" → "unpaid" labels.

## Ideas (not urgent)

- ✅ (2026-03-25) Run full E2E bug hunt using Chrome MCP — fixed 12 UI/UX bugs, wrote 65 unit tests, fixed prepaidUsed increment bug for non-package students
- ✅ (2026-04-28) UI/UX design overhaul — full Paper & Ink redesign shipped across dashboard, portal, auth, and landing.
- ✅ (2026-04-28) **Consider migrating component primitives to shadcn/ui** — decided against shadcn; went with the hand-rolled Paper & Ink design system in `src/components/paper/` instead.
- WhatsApp/SMS notifications
- Custom domains
- ✅ (2026-03-24) Production guardrails: prevent marking done for future dates
- ✅ (2026-04-16) Production guardrails: restrict prepaid package editing — no longer relevant, UI migrated to wallet system, prepaid fields no longer exposed
- ✅ (2026-04-16) Production guardrails: lesson log deletion safeguards — confirmation modal added, wallet refund on delete works
- ✅ (2026-03-25) Income page: projected collected income — shows current & next month projections based on package renewals (day-by-day exhaustion calculation) and pay-per-lesson charges (primary bookings only, remaining days for current month)
- ✅ (2026-04-16) **Consolidate booking creation to one place** — unified form on Overview page handles both one-time and recurring. Schedule page is read-only.
- (2026-03-31) **Student self-service replacement scheduling** — let students check available replacement times and schedule via their portal page (`/student/[token]`).
- ✅ (2026-04-16) **Show full credit balance (total paid minus total used)** — superseded by wallet system. Each student has a wallet with live RM balance (top-ups credit, lesson charges debit).
- (2026-03-31) **Cancellation reasons/data** — track who cancelled (coach, student, weather, etc.) on class exceptions. Add a `reason` or `cancelledBy` field to `classExceptions` so coaches can see patterns.
- ✅ (2026-03-31) **Early package renewal** — "Renew Early" feature: queue next package + record payment before current package finishes. Auto-rollover on exhaustion.
- ✅ (2026-04-16) **Pagination for lesson logs & payments** — default to 1 month, "Load more" adds a month. Applied to Students page lesson history, Payments page wallet transactions, and History tab. Removed dead usePayments hook and Payment type.
- ✅ (2026-04-16) **Refund tracking for mid-package cancellations** — handled by wallet adjustment (deduct + "Refund" description). No special UI needed.
- ✅ (2026-04-16) **Linked student package exhaustion — payment due behavior** — resolved by wallet system. Each linked student has their own wallet charged independently on mark-done. Negative balances surface per-student via wallet balance badge.

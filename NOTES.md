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

8. ✅ (2026-04-16) **Multiple entry points for creating students/bookings** — resolved by unified booking creation. Overview page is now the single entry point for both one-time and recurring lessons. Bookings page renamed to Schedule (read-only). Students page creation forms removed.

9. (2026-03-23) **Recurring booking model vs. individual instances** — currently bookings are recurring (one doc per weekly slot) with exceptions tracked separately. This requires loading all bookings + all exceptions to render any single day. Would flattening to individual booking instances be better as data grows?

## Next Session

- (2026-04-17) **Add Vercel domains to Firebase Authorized Domains** — Google sign-in will fail on prod/preview URLs until done. Path: Firebase Console → Authentication → Settings tab → Authorized domains → Add: `coach-app-ashen-delta.vercel.app` + the redesign branch preview URL. Without this, Google sign-in throws `auth/unauthorized-domain`.
- ✅ (2026-03-24) Edge case: Woojin + 3 kids class — 4 kids as one student record, one parent pays for all. Holiday scenario (2 kids away) handled by adjusting price on mark-as-done. Switching to pay-per-lesson now clears pending balance. Renamed "due" → "unpaid" labels.

## Ideas (not urgent)

- (2026-04-20) **Rework auth flow** — current email/password + Google coexistence has a silent footgun: if a user signs up with unverified email/password and later signs in with Google (same email), Firebase's account-takeover protection *drops* the password provider and leaves a Google-only account. User's data/UID are preserved but password login stops working with no warning. Options being considered: (a) Google-only; (b) magic-link only (email, no password); (c) keep email/password but also offer magic-link as a fallback. Until this is decided, consider adding `sendEmailVerification` at signup so the password provider can't be silently replaced.
- ✅ (2026-03-25) Run full E2E bug hunt using Chrome MCP — fixed 12 UI/UX bugs, wrote 65 unit tests, fixed prepaidUsed increment bug for non-package students
- (2026-03-23) UI/UX design overhaul — revisit the overall app design
- (2026-04-17) **Consider migrating component primitives to shadcn/ui** — user likes the look. Would replace the hand-rolled Button/Input/Select/Modal in `src/components/ui/` with shadcn's copy-paste components (Radix primitives + Tailwind). Good pairing with the react-day-picker popover we're adding now. Weight the refactor cost against visual polish + accessibility gains before doing it.
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

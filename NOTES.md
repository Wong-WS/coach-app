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

## Security — Before Public Launch / Marketing

Security review on 2026-10-28. Fine for now: users are just me plus a few coaches I invite personally. Revisit these before marketing the app or opening it to strangers.

- ✅ (2026-10-28) **Unauthenticated `/api/reset-account`** — anyone who sent a coach's UID could wipe that coach's whole ledger through the Admin SDK. Route + Settings Danger Zone removed (cabb9f8). Verified 404 on coach-simplify.com.
- (2026-10-28) **Free-tier quota can be burned by strangers** — the Firebase web config is public by design, so anyone can sign up from a script (bypassing `/signup`) and write unlimited docs into their own `coaches/{uid}`. Spark limits (50k reads / 20k writes per day) are shared by every coach, so one bad actor = whole-app outage until ~3 PM MYT. Not a money risk on Spark; it becomes one on Blaze. `/portal/<anything>` also costs ≥1 read per hit, dozens per refresh of a real link (force-dynamic). Options, cheapest first:
  1. Firebase console → Authentication → Settings → uncheck "Enable create (sign-up)" — only if onboarding stays invite-only.
  2. Cache `/portal/[token]` (~60s revalidate) so refreshes cost ~0 reads.
  3. Firebase App Check (reCAPTCHA) — Firestore/Auth only accept requests from the real site. Proper fix if keeping self-serve signup.
  4. If upgrading to Blaze: set a budget alert first (it warns, doesn't cap), and do App Check before upgrading.
- (2026-10-28) **Backup JSONs not gitignored** — `.gitignore` covers `money-migration-backup-*.json` but not `money-repair-backup-*.json` (5 untracked files in repo root, tiny: a few doc paths with coach UIDs + prices). Repo is public, so a careless `git add .` would publish them. Fix: add `money-*-backup-*.json` to `.gitignore`, or delete the files.
- (2026-10-28) **Test account password is public** — `CLAUDE.md` holds `testcoach@example.com` / `Test123!` and the GitHub repo is public, so anyone can log in to the test account (not other coaches — rules block that). Removing the line isn't enough; it's in git history. Fix: change the password in Firebase console → Authentication. Also consider making the repo private (one click in GitHub, Vercel keeps deploying).

Already solid: owner-only Firestore rules; `walletPortalTokens` not readable from the client; portal tokens are 10-char nanoid, scoped to one wallet, dead on archive, and don't leak coachId; Admin key server-only and never committed; no XSS sinks; security headers set (framing blocked, HSTS).

## Next Session

- ✅ (2026-04-28) **Add Vercel domains to Firebase Authorized Domains** — done. Google sign-in works on prod/preview URLs.
- ✅ (2026-03-24) Edge case: Woojin + 3 kids class — 4 kids as one student record, one parent pays for all. Holiday scenario (2 kids away) handled by adjusting price on mark-as-done. Switching to pay-per-lesson now clears pending balance. Renamed "due" → "unpaid" labels.

## Ideas (not urgent)

- ✅ (2026-03-25) Run full E2E bug hunt using Chrome MCP — fixed 12 UI/UX bugs, wrote 65 unit tests, fixed prepaidUsed increment bug for non-package students
- ✅ (2026-04-28) UI/UX design overhaul — full Paper & Ink redesign shipped across dashboard, portal, auth, and landing.
- ✅ (2026-04-28) **Consider migrating component primitives to shadcn/ui** — decided against shadcn; went with the hand-rolled Paper & Ink design system in `src/components/paper/` instead.
- WhatsApp/SMS notifications
- Custom domains
- (2026-04-28) **Continue component extraction for `payments/page.tsx` (1887 lines) and `students/page.tsx` (1193 lines)** — same pattern as the dashboard refactor (commits `5e1520f`..`fb97f30` on main). Pull modals/forms into `src/app/payments/_components/` and `src/app/students/_components/`. Pick up next time you feel friction in those files. Reference: `src/app/dashboard/_components/` for the established pattern (each modal lifts state via props rather than closing over parent state).
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

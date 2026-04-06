# CoachApp Deep Dive Audit

**Date:** 2026-04-06
**Audited by:** 4 specialized agents (Debugger, Security Auditor, Architect Reviewer, Performance Engineer)

---

## Bugs & Edge Cases

### CRITICAL

- [ ] **B1** — `lessonRate` never read from Firestore in `useStudents` hook
  - **File:** `src/hooks/useCoachData.ts:179-195`
  - **Impact:** Credit system silently broken — `student.lessonRate` is always `undefined`. Discounts are never detected. Credit calculation falls back to booking price everywhere.
  - **Fix:** Add `lessonRate: d.data().lessonRate ?? undefined` to the student mapping. **1 line.**

- [ ] **B2** — `pendingPayment` absolute set overwrites `increment()` on package exhaustion
  - **File:** `src/app/dashboard/page.tsx:298-326`
  - **Impact:** If a pay-per-lesson student also has a prepaid package that exhausts on the same lesson, the per-lesson charge (line 299, `increment(price)`) is overwritten by the absolute package price (line 325). The current lesson's charge is lost.
  - **Fix:** Use `increment()` instead of absolute set on package exhaustion, or accumulate both values.

- [ ] **B3** — Ad-hoc delete ignores `paySeparately`, drives `prepaidUsed` negative
  - **File:** `src/app/dashboard/page.tsx:691-730`
  - **Impact:** For pay-separately lessons, `prepaidUsed` was never incremented on mark-as-done (skipped at line 279), but delete always decrements it (line 706). Also, `pendingPayment` reversal only checks `payPerLesson` flag, missing pay-separately lessons.
  - **Fix:** Check `log.paySeparately` first — skip `prepaidUsed` decrement and reverse `pendingPayment` directly.

### MEDIUM

- [ ] **B4** — Availability API ignores booking `startDate`/`endDate`
  - **File:** `src/app/api/availability/[coachId]/route.ts:37-60`
  - **Impact:** One-time ad-hoc classes (which have `endDate` set) permanently block that time slot on the public availability page every week.
  - **Fix:** Read `startDate`/`endDate` from Firestore and filter bookings by the target date in the availability engine.

- [ ] **B5** — Rescheduled classes can appear outside booking date range
  - **File:** `src/lib/class-schedule.ts:36-58`
  - **Impact:** A booking active only in January that was rescheduled to February still appears on the February date.
  - **Fix:** Add date-range validation when checking rescheduled-to dates.

- [ ] **B6** — Race condition in `findOrCreateStudent`
  - **File:** `src/lib/students.ts:1-42`
  - **Impact:** Simultaneous calls (e.g., sync students + mark-as-done) can both read `snapshot.empty === true` and create duplicate student records with different `linkToken` values.
  - **Fix:** Use a Firestore transaction or add a deduplication check.

- [ ] **B7** — Record Payment does not decrement `pendingPayment`
  - **File:** `src/app/dashboard/students/page.tsx:974-998`
  - **Impact:** "Payment Due" badge never clears after recording a payment. Payments are purely informational records.
  - **Fix:** Decrement `pendingPayment` by the payment amount when recording.

- [ ] **B8** — Package exhaustion overwrites existing `pendingPayment` balance
  - **File:** `src/app/dashboard/page.tsx:325`
  - **Impact:** If a student had accumulated `pendingPayment` from prior pay-per-lesson charges, package exhaustion sets it to an absolute value, losing the prior balance.
  - **Fix:** Use `increment()` to add the package price to existing `pendingPayment`.

- [ ] **B9** — `handleAddLesson` always increments `prepaidUsed` even for non-package students
  - **File:** `src/app/dashboard/students/page.tsx:438-439`
  - **Impact:** For students with `prepaidTotal === 0`, `prepaidUsed` becomes 1, 2, 3... triggering false "needs renewal" warnings (`prepaidUsed >= prepaidTotal` → `1 >= 0` = true).
  - **Fix:** Guard with `if ((student?.prepaidTotal ?? 0) > 0)` before incrementing.

- [ ] **B10** — Delete lesson log zeroes `pendingPayment` when un-exhausting package
  - **File:** `src/app/dashboard/students/page.tsx:544-551`
  - **Impact:** When deleting a log causes a package to go from exhausted to non-exhausted, `pendingPayment` is set to 0, wiping any accumulated pay-per-lesson charges.
  - **Fix:** Only decrement `pendingPayment` by the relevant amount instead of zeroing it.

### LOW

- [ ] **B11** — Debug `console.log` statements left in production
  - **File:** `src/app/dashboard/page.tsx:270, 273, 277, 335`
  - **Impact:** Exposes internal data structures (student paths, payment amounts) in browser console.
  - **Fix:** Remove all `console.log('[MarkDone]...')` statements.

- [ ] **B12** — `useMemo` dependency on `selectedDate` is by reference, not value
  - **File:** `src/app/dashboard/page.tsx:115`
  - **Impact:** `setSelectedDate(new Date())` creates a new Date object even if the date hasn't changed, causing unnecessary memoization recomputation.

- [ ] **B13** — Potential duplicate reschedule exception processing
  - **File:** `src/lib/class-schedule.ts:36-58`
  - **Impact:** If multiple reschedule exceptions point the same booking to the same date, both are processed. Last-write-wins — benign but unintended.

- [ ] **B14** — Timezone-dependent income projection loop
  - **File:** `src/app/dashboard/income/page.tsx:106-125`
  - **Impact:** `checkDate.setDate(checkDate.getDate() + 1)` uses local time. Near midnight or timezone changes, day count could be off by one.

---

## Security

### CRITICAL

- [ ] **S1** — `studentTokens` collection is world-readable — enables full token enumeration
  - **File:** `firestore.rules:27-28`
  - **Impact:** Any unauthenticated user can list ALL student tokens across ALL tenants. Combined with the student portal API, this gives full read access to student names, financial balances, and lesson history.
  - **Fix:** Change `allow read: if true` → `allow read: if false`. Only the Admin SDK API route reads this collection, and Admin SDK bypasses rules. **1 line.**

- [ ] **S2** — No rate limiting on any API route
  - **Files:** All routes in `src/app/api/`
  - **Impact:** Waitlist POST can be spammed endlessly. Student tokens can be probed. Coach profiles can be scraped.
  - **Fix:** Add rate limiting via Vercel Firewall/WAF rules or Upstash Redis.

### HIGH

- [ ] **S3** — All Firestore writes are client-side with no field validation in rules
  - **Files:** All dashboard pages, `firestore.rules`
  - **Impact:** An authenticated coach can set `prepaidUsed` to negative, `pendingPayment` to arbitrary values, or write arbitrary fields. No `hasOnly()` validation on owner writes.
  - **Fix:** Add field-level validation in Firestore rules. For financial operations, consider moving to server-side API routes.

- [ ] **S4** — Signup slug race condition (TOCTOU)
  - **File:** `src/lib/auth-context.tsx:91-102`
  - **Impact:** Two simultaneous signups can claim the same slug. Auth user gets created but slug write may fail, leaving an orphaned user.
  - **Fix:** Use a Firestore transaction for the slug check + claim.

- [ ] **S5** — No security headers configured
  - **File:** `next.config.ts`
  - **Impact:** Missing CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
  - **Fix:** Add `headers()` function to `next.config.ts`.

### MEDIUM

- [ ] **S6** — Waitlist API lacks input sanitization and length validation
  - **File:** `src/app/api/waitlist/route.ts:8-31`
  - **Impact:** Admin SDK bypasses Firestore rules — no validation on string lengths, day values, or time preferences. Attacker can submit megabytes of text.
  - **Fix:** Add server-side validation matching the Firestore rules.

- [ ] **S7** — Coach API exposes WhatsApp number publicly (scrapable)
  - **File:** `src/app/api/coach/[slug]/route.ts:41`
  - **Impact:** Any bot can scrape all coach phone numbers by iterating slugs.
  - **Fix:** Consider rate limiting + CAPTCHA before revealing phone number.

- [ ] **S8** — Internal Firebase UID exposed in availability API URL
  - **File:** `src/app/api/availability/[coachId]/route.ts`
  - **Impact:** Leaks internal user IDs to the public.
  - **Fix:** Use coach slug instead of UID in public URLs, resolve server-side.

### LOW

- [ ] **S9** — No CSRF protection on waitlist POST endpoint
  - **File:** `src/app/api/waitlist/route.ts`
  - **Impact:** Malicious sites can auto-submit waitlist entries. Limited to spam.
  - **Fix:** Validate `Origin`/`Referer` header or implement CSRF token.

- [ ] **S10** — Client-side only auth guard on dashboard
  - **File:** `src/app/dashboard/layout.tsx:26-29`
  - **Impact:** Unauthenticated users briefly see loading spinner before redirect. Data is protected by Firestore rules, but page shell and JS bundle are served.
  - **Fix:** Consider Next.js middleware for server-side redirect.

---

## Architecture & Refactoring

### Component Decomposition

#### `dashboard/page.tsx` (1,778 lines, 42 useState) → Extract:

- [ ] **R1** — `WeekNavigator` — week strip + date selection (~lines 762-816)
- [ ] **R2** — `ClassCard` — single class row with status, info, price, action menu (~lines 839-971)
- [ ] **R3** — `CancelledClassCard` — cancelled class row with undo/reschedule (~lines 984-1031)
- [ ] **R4** — `AdHocClassCard` — ad-hoc lesson log group display (~lines 1041-1098)
- [ ] **R5** — `MarkDoneModal` — mark-done confirmation with attendee list, pricing (~lines 1339-1478)
- [ ] **R6** — `EditBookingModal` — edit class form with this/future/all save options (~lines 1224-1336)
- [ ] **R7** — `AddClassModal` — add ad-hoc class with student picker (~lines 1481-1690)
- [ ] **R8** — `RescheduleModal` — reschedule date/time picker (~lines 1163-1221)

#### `students/page.tsx` (1,849 lines, 46 useState) → Extract:

- [ ] **R9** — `StudentCard` — single student card in grid (~lines 784-852)
- [ ] **R10** — `StudentFilterBar` — search + day/status filter tabs (~lines 698-753)
- [ ] **R11** — `StudentDetailModal` — detail panel (decompose further) (~lines 857-end)
- [ ] **R12** — `PrepaidPackageSection` — package display, progress, add/renew/edit (~lines 1027-1297)
- [ ] **R13** — `PaymentSection` — payment due banner, record, history (~lines 896-1007, 1442-1556)
- [ ] **R14** — `LessonHistorySection` — lesson log list with credit audit (~lines 1388-1440)
- [ ] **R15** — `AddLessonForm` — inline lesson creation form (~lines 1558-1648)

### Custom Hooks to Extract

- [ ] **R16** — `useMarkDone(coachId, students, bookings)` — the ~170-line mark-done business logic from dashboard/page.tsx
- [ ] **R17** — `useClassActions(coachId)` — cancel, undo-cancel, reschedule, edit-save handlers
- [ ] **R18** — `useAddClass(coachId, students, locations)` — add class + toggle student handlers
- [ ] **R19** — `useStudentActions(coachId)` — delete, unlink, save, sync handlers
- [ ] **R20** — `useStudentPrepaid(coachId, studentId)` — add prepaid, save prepaid, renew, cancel next
- [ ] **R21** — `useStudentPayments(coachId, studentId)` — record, edit, delete payments

### Business Logic Extraction

- [ ] **R22** — Create `src/lib/pricing.ts` with:
  - `resolveStudentPrice(student, booking)` — duplicated in 5+ places
  - `calculateCreditDiff(basePrice, actualPrice)` — duplicated in 3+ places
  - `computePackageUpdate(student, price, booking)` — package exhaustion/rollover logic
  - `computePendingPayment(student, price)` — pending payment calculation

- [ ] **R23** — Add `toISODateString(date)` to `src/lib/date-format.ts` — duplicated inline in 5+ places as `getDateString`

### Hook Infrastructure

- [ ] **R24** — Create generic `useFirestoreCollection<T>` hook — deduplicate the identical guard/subscribe/cleanup boilerplate repeated 8 times in `useCoachData.ts`
- [ ] **R25** — Add `onError` callbacks to all `onSnapshot` subscriptions — errors are currently silently swallowed
- [ ] **R26** — Split `useLessonLogs` into purpose-specific hooks (it accepts 3 mutually exclusive filter params)

### Type Safety

- [ ] **R27** — Replace 17 uses of `Record<string, unknown>` with typed update interfaces (`StudentUpdate`, `LessonLogCreate`, `BookingCreate`)
- [ ] **R28** — Fix `useCoachBySlug` to return the `Coach` type instead of an anonymous inline type

### State Management

- [ ] **R29** — Collapse modal state into single state objects (e.g., `AddClassState | null` instead of 12 separate useState)
- [ ] **R30** — Use `useReducer` for the mark-done flow (interdependent state transitions)

### Missing Infrastructure

- [ ] **R31** — Add `src/app/error.tsx` and `src/app/dashboard/error.tsx` error boundaries
- [ ] **R32** — Add pagination to `useStudents` and `useBookings` (cursor-based)

---

## Performance

### Quick Wins (< 1 hour)

- [ ] **P1** — Add `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` to `/api/availability/`
  - **Impact:** 90%+ reduction in public Firestore reads
  - **Effort:** 15 min

- [ ] **P2** — Parallelize 3 sequential Firestore reads in `/api/availability/` with `Promise.all()`
  - **Impact:** ~200ms faster API response
  - **Effort:** 5 min

- [ ] **P3** — Add `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` to `/api/coach/[slug]/`
  - **Impact:** Same benefit for coach profile endpoint
  - **Effort:** 5 min

- [ ] **P4** — Parallelize coach doc + locations fetch in `/api/coach/[slug]/` after slug lookup
  - **Impact:** ~100ms faster
  - **Effort:** 5 min

### Medium Term

- [ ] **P5** — Add date-range filter to `useClassExceptions` hook
  - **Impact:** Prevents unbounded growth (1000+ docs/year per active coach)
  - **Effort:** 30 min

- [ ] **P6** — Use `getDocs` instead of `onSnapshot` for income/settings pages
  - **Impact:** Fewer WebSocket connections, less Firestore reads, less battery usage
  - **Effort:** 30 min

- [ ] **P7** — Lazy-load Firebase SDK on public pages / use `next/dynamic` for modals
  - **Impact:** Better FCP/LCP for public visitors
  - **Effort:** 1-2 hours

- [ ] **P8** — Add default limits to `useStudents`, `useBookings`, `usePayments` queries
  - **Impact:** Prevents scaling problems as data grows
  - **Effort:** 30 min

- [ ] **P9** — Use `writeBatch` for signup's 7 sequential working hour writes
  - **File:** `src/lib/auth-context.tsx:119-125`
  - **Impact:** ~700ms faster signup
  - **Effort:** 10 min

---

## Recommended Fix Order

### Phase 1: Immediate (high-value, low-effort)

1. **B1** — Read `lessonRate` from Firestore (1 line, unlocks credit system)
2. **S1** — Lock down `studentTokens` read access (1 line Firestore rule)
3. **P1+P2** — Cache + parallelize availability API (20 min)
4. **B11** — Remove debug console.logs
5. **S5** — Add security headers to next.config.ts
6. **P3+P4** — Cache + parallelize coach profile API

### Phase 2: Bug fixes (this week)

7. **B3** — Fix ad-hoc delete for paySeparately
8. **B7** — Make Record Payment decrement pendingPayment
9. **B9** — Guard prepaidUsed increment behind package check
10. **B4** — Filter availability API by booking date ranges
11. **B2/B8/B10** — Fix pendingPayment absolute-set-vs-increment cluster

### Phase 3: Architecture (next sprint)

12. **R22** — Extract `src/lib/pricing.ts`
13. **R5-R8** — Extract modal components from dashboard
14. **R11-R15** — Extract StudentDetailModal + sub-sections
15. **R31** — Add error boundaries
16. **P5** — Date-range filter for classExceptions
17. **R25** — Add onError to all Firestore subscriptions

### Phase 4: Polish (backlog)

18. **R16-R21** — Extract custom hooks
19. **R24** — Generic useFirestoreCollection hook
20. **R27** — Typed Firestore update interfaces
21. **R29-R30** — State consolidation
22. **P6-P8** — Performance optimizations
23. **S2-S4** — Remaining security hardening

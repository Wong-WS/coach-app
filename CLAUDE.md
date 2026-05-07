# Claude Code Configuration

## Project: CoachApp - Multi-Tenant Scheduling SaaS

Solo-freelance-coach scheduling + wallet app. Not built for academies, gyms, or multi-coach orgs.

### UI/UX Rules

- **Card lists must have uniform height.** Never add extra lines (subtitles, secondary text) that make some cards taller than others. Keep card content single-line. Move metadata like "Linked to X" into badges on the right side, not subtitles below the name.
- **Badges/pills must have proper spacing.** When placing multiple badges side-by-side, use `gap-2` or similar. Never let them touch or cramp together.
- **Hide detail-panel-only info from list cards.** Phone numbers, notes, and other details belong in the detail panel, not the card list.
- **Never use `window.confirm` or `window.alert`.** Always use the app's `<Modal>` component for confirmations and dialogs. Destructive actions that affect future recurrences (e.g. cancel lesson) should ask scope: this date vs. future — see `src/lib/cancel-scope.ts`.
- **Use design tokens, not hex.** The dashboard and portal use a "Paper & Ink" palette defined in `src/app/globals.css`: `--bg`, `--panel`, `--ink`, `--ink-2`, `--ink-3`, `--ink-4`, `--line`, `--line-2`, `--good`/`--good-soft`, `--warn`/`--warn-soft`, `--bad`/`--bad-soft`. Reference these via `style={{ color: 'var(--ink)' }}`. Dark mode swaps the values — hex leaks through.
- **Mono type for money + dates.** Use the `.mono` and `.tnum` utility classes on numeric cells so columns align.

### Workflow Rules

- **Check `git branch --show-current` before committing.** A parallel session can flip HEAD out from under you (happened with `redesign/landing-page` vs `main`). Verify branch before every commit batch.
- **Commit + push after each completed change** — don't batch across unrelated features. Revert is cheap if something's wrong.

### Notes System

- At the start of every session, read `NOTES.md` and briefly summarize any open items.
- When the user asks about current status, open items, or what to work on (e.g., "what's on the table", "what's the plan", "status update", "what are we working on"), read `NOTES.md` and give a concise briefing of open bugs, next session items, and any relevant ideas.
- When the user says "add a note", append it to the most relevant section in `NOTES.md` with today's date.
- When an item is resolved, mark it with ✅ and the date rather than deleting it.

### Useful Commands

- `npm run dev` — Run development server (http://localhost:3000)
- `npm run build` — Build for production
- `npm run lint` — Run ESLint
- `npx vitest run` — Run the unit test suite (vitest; tests in `src/lib/__tests__/`)
- `firebase deploy --only firestore:rules` — Deploy Firestore security rules
- `firebase deploy --only firestore:indexes` — Deploy composite indexes (`firestore.indexes.json`)
- `vercel` — Deploy to Vercel (after connecting repo)

### Project Structure

```
src/
├── app/
│   ├── layout.tsx                          # Root layout + ToastProvider + ThemeProvider
│   ├── page.tsx                            # Landing page
│   ├── globals.css                         # Design tokens (Paper & Ink palette, dark mode)
│   ├── _components/                        # Landing-page-only components
│   │   ├── FounderNote.tsx
│   │   ├── OverviewPreview.tsx
│   │   └── PricingSection.tsx
│   ├── login/page.tsx
│   ├── signup/page.tsx                     # Slug creation
│   ├── dashboard/
│   │   ├── layout.tsx                      # Auth guard + sidebar + mobile bottom nav
│   │   ├── page.tsx                        # Today's Classes — mark-as-done, bulk, cancel-scope, duplicate
│   │   ├── bookings/page.tsx               # Recurring + ad-hoc schedule mgmt
│   │   ├── students/page.tsx               # Student list + wallet top-up + lesson history
│   │   ├── payments/page.tsx               # Wallets + health alerts + portal link share
│   │   └── settings/page.tsx               # Danger Zone (reset account)
│   ├── portal/[token]/                     # Parent/student-facing wallet portal (public via token URL)
│   │   ├── page.tsx                        # Server component: header, balance card, suggestion
│   │   ├── ChargesList.tsx                 # Client: paginated lesson charges (Load more)
│   │   ├── TopUpsList.tsx                  # Client: paginated top-ups (Load more)
│   │   └── not-found.tsx
│   └── api/
│       ├── portal/[token]/transactions/route.ts   # Portal pagination endpoint
│       └── reset-account/route.ts                 # Dev/testing nuke
├── lib/
│   ├── firebase.ts                         # Web SDK init
│   ├── firebase-admin.ts                   # Admin SDK init (server-only)
│   ├── auth-context.tsx                    # React auth context
│   ├── auth-redirect.tsx                   # Redirect helpers
│   ├── theme-context.tsx                   # Dark-mode toggle
│   ├── class-schedule.ts                   # getClassesForDate + rescheduling helpers
│   ├── cancel-scope.ts                     # computeCancelFuture (cancel-this vs cancel-future)
│   ├── wallets.ts                          # resolveWallet helper
│   ├── wallet-alerts.ts                    # getWalletHealth: healthy/low/empty/owing/tab/inactive
│   ├── portal-data.ts                      # Admin-SDK fetcher for /portal/[token] + pagination
│   ├── portal-suggestion.ts                # getSuggestedTopUp (coach-set usualTopUp anchor)
│   ├── students.ts                         # findOrCreateStudent
│   ├── time-format.ts                      # formatTimeDisplay, getDayDisplayName
│   ├── time-input.ts                       # 5/30-min snapping helpers
│   ├── date-format.ts                      # en-MY date formatters
│   └── __tests__/                          # vitest: cancel-scope, class-schedule, date-format, time-input, wallet-alerts
├── components/
│   ├── ui/                                 # Button, Input, Select, Modal, DatePicker, TimePicker, PhoneInput, Toast, GoogleButton
│   └── paper/                              # Paper & Ink design-system: Avatar, Button, Chip, Icons, Modal, Segmented
├── hooks/
│   ├── useCoachData.ts                     # Firestore hooks: useLocations/useBookings/useStudents/useLessonLogs/useClassExceptions/useWallets/useWalletTransactions
│   └── usePointerType.ts                   # touch vs. mouse detection
└── types/index.ts                          # TypeScript types
```

### Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **DB**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Admin SDK**: Firebase Admin SDK 13 (server-only, used by portal + reset route)
- **Tests**: Vitest 4
- **Dates**: date-fns 4
- **Tokens**: nanoid 5 (10-char portal tokens)
- **Date UI**: react-day-picker 9
- **Hosting**: Vercel

### Firestore Data Model

```
coachSlugs/{slug}                          # Top-level lookup: slug → coachId
  coachId: string

walletPortalTokens/{token}                 # Top-level: maps portal URL token → coach+wallet
  coachId: string
  walletId: string
  createdAt: timestamp

coaches/{coachId}                          # Coach profile & settings
  displayName, slug, email, serviceType
  lessonDurationMinutes, travelBufferMinutes
  whatsappNumber, createdAt, updatedAt

coaches/{coachId}/workingHours/{day}       # 7 docs (monday–sunday). Schema kept for data; UI removed.
  enabled: boolean
  timeRanges: [{ startTime, endTime }]     # 24h format; legacy startTime/endTime at doc level still supported

coaches/{coachId}/locations/{locationId}
  name, address, notes, createdAt

coaches/{coachId}/bookings/{bookingId}     # Recurring weekly OR ad-hoc single-date lessons
  locationId, locationName, dayOfWeek
  startTime, endTime, status               # status: 'confirmed' | 'cancelled'
  clientName, clientPhone, lessonType, groupSize, notes
  price, linkedStudentIds[], studentPrices{}
  walletId, studentWallets{}               # wallet attachment drives mark-as-done charge target
  startDate, endDate                       # ad-hoc lesson = startDate === endDate
  createdAt, cancelledAt

coaches/{coachId}/students/{studentId}
  clientName, clientPhone, notes, createdAt, updatedAt

coaches/{coachId}/lessonLogs/{logId}       # Completed lesson records (written by mark-as-done)
  date, bookingId, studentId, studentName
  locationName, startTime, endTime
  price, note, createdAt

coaches/{coachId}/classExceptions/{exceptionId}   # Per-date overrides of recurring bookings
  bookingId, originalDate
  type                                     # 'cancelled' | 'rescheduled'
  newDate, newStartTime, newEndTime, newLocationId, newLocationName, newPrice
  createdAt

coaches/{coachId}/awayPeriods/{periodId}   # Coach travel/leave — full-day blackouts
  startDate, endDate                       # YYYY-MM-DD inclusive on both ends
  label                                    # optional free text, e.g. "Bali holiday"
  createdAt, updatedAt

coaches/{coachId}/wallets/{walletId}       # Shared balance for one or more students
  name, balance, studentIds[]
  archived?                                # hides from default list, disables alerts
  tabMode?                                 # pay-after-lesson; skip Low alerts
  portalToken?                             # 10-char nanoid, set when coach shares portal link
  usualTopUp?                              # coach-set default (RM) — anchors portal suggestion
  createdAt, updatedAt

coaches/{coachId}/wallets/{walletId}/transactions/{txnId}
  type                                     # 'top-up' | 'charge' | 'refund' | 'adjustment'
  amount, balanceAfter, description
  studentId, lessonLogId, date, createdAt
```

**Composite indexes** (`firestore.indexes.json`):
- `transactions` on `(type ASC, createdAt DESC)` — powers portal pagination.

### Key Features

- **Scheduling**: recurring weekly bookings + ad-hoc single-date lessons; multi-timerange working hours (data layer only); travel-buffer-aware availability
- **Locations**: multiple per coach
- **Students**: add/edit/delete/search/filter; linked students (group lessons with separate-paying parents via `linkedStudentIds[]` + `studentPrices{}`)
- **Today's Classes** (dashboard home): mark-as-done (single + bulk), duplicate (prefilled Add Lesson modal), cancel-scope (this date vs. future), class exceptions (per-date cancel/reschedule of recurring bookings)
- **Wallets**: named multi-student balance; top-up / charge / refund / adjust / archive; tab mode; health states = `healthy / low / empty / owing / tab / inactive` (see `getWalletHealth`); depletion alert is a popup (not toast)
- **Wallet portal**: parent/student-facing at `/portal/[token]` (shareable via WhatsApp). Shows balance, status chip, coach-set top-up suggestion, paginated charges + top-ups (10 per page with Load more). Read-only; uses Admin SDK to bypass owner rules.
- **Income dashboard**: projected (from recurring bookings) vs. actual (from lessonLogs)
- **Time off (away periods)**: full-day blackouts for travel/leave (Settings → Time off). Recurring classes inside the range are skipped automatically; ad-hoc + rescheduled lessons surface in a conflict resolver. Persists indefinitely as a labelled record visible on dashboard + schedule.
- **Account reset** (settings → Danger Zone): dev-only nuke via API route

### Security Rules

- `coachSlugs`: authenticated read; create only with own uid
- `walletPortalTokens`: **no direct client access** — reads happen server-side via Admin SDK in `resolvePortalToken`
- `coaches/*` + all subcollections: owner read/write

### Test Account

- **Email**: testcoach@example.com
- **Password**: Test123!
- **Slug**: test-coach
- **Live (custom domain)**: https://coach-simplify.com/test-coach
- **Live (Vercel)**: https://coach-app-ashen-delta.vercel.app/test-coach

### Environment Variables (.env.local)

```
# Web SDK (client)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Admin SDK (server-only — portal data, reset route)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

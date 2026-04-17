# Claude Code Configuration

## Project: CoachApp - Multi-Tenant Scheduling SaaS

### UI/UX Rules

- **Card lists must have uniform height.** Never add extra lines (subtitles, secondary text) that make some cards taller than others. Keep card content single-line. Move metadata like "Linked to X" into badges on the right side, not subtitles below the name.
- **Badges/pills must have proper spacing.** When placing multiple badges side-by-side, use `gap-2` or similar. Never let them touch or cramp together.
- **Hide detail-panel-only info from list cards.** Phone numbers, notes, and other details belong in the detail panel, not the card list.
- **Never use `window.confirm` or `window.alert`.** Always use the app's `<Modal>` component for confirmations and dialogs.

### Notes System

- At the start of every session, read `NOTES.md` and briefly summarize any open items.
- When the user asks about current status, open items, or what to work on (e.g., "what's on the table", "what's the plan", "status update", "what are we working on"), read `NOTES.md` and give a concise briefing of open bugs, next session items, and any relevant ideas.
- When the user says "add a note", append it to the most relevant section in `NOTES.md` with today's date.
- When an item is resolved, mark it with ✅ and the date rather than deleting it.

### Useful Commands

- `npm run dev` - Run development server (http://localhost:3000)
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `vercel` - Deploy to Vercel (after connecting repo)
- `firebase deploy --only firestore:rules` - Deploy Firestore security rules

### Project Structure

```
coach-app/src/
├── app/
│   ├── layout.tsx                    # Root layout + ToastProvider + ThemeProvider
│   ├── page.tsx                      # Landing page
│   ├── globals.css                   # Global styles
│   ├── login/page.tsx                # Login page
│   ├── signup/page.tsx               # Signup page with slug creation
│   ├── dashboard/
│   │   ├── layout.tsx                # Auth guard + sidebar + mobile bottom nav
│   │   ├── page.tsx                  # Today's Classes — mark-as-done, class exceptions
│   │   ├── settings/page.tsx         # Danger Zone (reset account)
│   │   ├── bookings/page.tsx         # Read-only recurring schedule
│   │   ├── students/page.tsx         # Student list + wallet top-up + lesson history
│   │   └── payments/page.tsx         # Wallet management + transaction history
│   ├── [slug]/page.tsx               # Public coach page with availability
│   ├── student/[token]/page.tsx      # Student portal (read-only lesson history)
│   └── api/
│       ├── availability/[coachId]/route.ts  # Available slots API (GET)
│       ├── student/[token]/route.ts         # Student portal API (Admin SDK, GET)
│       ├── migrate-wallets/route.ts         # One-off migration: legacy prepaid → wallets
│       └── reset-account/route.ts           # Dev/testing nuke
├── lib/
│   ├── firebase.ts                   # Firebase client init
│   ├── firebase-admin.ts             # Firebase Admin SDK (server-side)
│   ├── auth-context.tsx              # Auth React context
│   ├── theme-context.tsx             # Dark-mode toggle
│   ├── availability-engine.ts        # Core slot calculation algorithm
│   ├── class-schedule.ts             # getClassesForDate, rescheduling helpers
│   ├── cancel-scope.ts               # computeCancelFuture (cancel-this vs cancel-future)
│   ├── wallets.ts                    # resolveWallet helper
│   ├── students.ts                   # findOrCreateStudent utility
│   └── date-format.ts                # en-MY date formatters
├── components/
│   └── ui/                           # Button, Input, Select, Modal, PhoneInput, Toast, GoogleButton
├── hooks/
│   └── useCoachData.ts               # Firestore hooks: useLocations, useBookings, useStudents, useLessonLogs, useClassExceptions, useWallets, useWalletTransactions
└── types/index.ts                    # TypeScript types
```

### Technology Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Admin SDK**: Firebase Admin SDK 13
- **Hosting**: Vercel

### Firestore Data Model

```
coachSlugs/{slug}                        # Top-level lookup: slug → coachId
  coachId: string

studentTokens/{linkToken}               # Student portal token → coachId + studentId
  coachId, studentId

coaches/{coachId}                        # Coach profile & settings
  displayName, slug, email, serviceType
  lessonDurationMinutes, travelBufferMinutes
  whatsappNumber, createdAt, updatedAt

coaches/{coachId}/workingHours/{day}     # 7 docs (monday–sunday)
  enabled: boolean
  timeRanges: [{ startTime, endTime }]   # Multiple ranges per day (24h format)
  # Legacy format (backward compatible): startTime, endTime at doc level

coaches/{coachId}/locations/{locationId}
  name, address, notes, createdAt

coaches/{coachId}/bookings/{bookingId}   # Recurring weekly bookings
  locationId, locationName, dayOfWeek
  startTime, endTime, status             # status: 'confirmed' | 'cancelled'
  clientName, clientPhone, lessonType, groupSize, notes
  price, linkedStudentIds[], studentPrices{}
  walletId, studentWallets{}             # Wallet attachment for mark-as-done charges
  startDate, endDate                     # Optional date range filtering
  createdAt, cancelledAt

coaches/{coachId}/students/{studentId}   # Student records
  clientName, clientPhone, linkToken
  lessonRate, notes, createdAt, updatedAt
  # Legacy fields (pre-wallet): prepaidTotal, prepaidUsed, credit, pendingPayment,
  # useMonetaryBalance, monetaryBalance — still read by /student/[token] portal

coaches/{coachId}/lessonLogs/{logId}     # Completed lesson records
  date, bookingId, studentId, studentName
  locationName, startTime, endTime
  price, note, createdAt

coaches/{coachId}/classExceptions/{exceptionId}  # Per-date overrides
  bookingId, originalDate
  type                                   # 'cancelled' | 'rescheduled'
  newDate, newStartTime, newEndTime, newLocationId, newLocationName, newPrice
  createdAt

coaches/{coachId}/wallets/{walletId}     # Shared balance for one or more students
  name, balance, studentIds[], createdAt, updatedAt

coaches/{coachId}/wallets/{walletId}/transactions/{txnId}  # Wallet history
  type                                   # 'top-up' | 'charge' | 'refund' | 'adjustment'
  amount, balanceAfter, description
  studentId, lessonLogId, date, createdAt
```

### Key Features

#### Phase 1 (Implemented)
1. Coach signup with unique slug (public URL)
2. Working hours configuration with multiple time ranges per day
3. Overlap and invalid time range validation before saving
4. Lesson duration and travel buffer settings
5. Multiple location management
6. Booking creation/cancellation by coach (5-minute time increments)
7. Public page showing availability by location
8. After 3 PM time filter on public schedule page
9. WhatsApp contact button for clients
10. Availability engine with smart travel buffer calculation

#### Phase 2 (Implemented)
11. Student tracking — auto-created on booking creation and mark-as-done
12. Student portal — public read-only page at /student/[token] (via Admin SDK API)
13. Linked students — for group lessons with separate-paying parents (linkedStudentIds[], studentPrices{})
14. Class exceptions — cancel or reschedule individual occurrences of recurring bookings
15. Lesson logging — mark-as-done creates lessonLog + wallet charge transaction
16. Wallet system — shared balance per student group, top-up/charge/refund/adjustment transactions

### Availability Engine Logic

- Takes: workingHours, lessonDuration, travelBuffer, confirmedBookings, clientLocationId
- Supports multiple time ranges per day (timeRanges array)
- For each day and each range, finds gaps between bookings
- Applies travel buffer only when adjacent booking is at DIFFERENT location than clientLocationId
- Generates available start times in 30-minute increments
- Backward compatible with old single startTime/endTime format

### Security Rules

- coachSlugs: authenticated read, create own uid only
- studentTokens: no public read (Admin SDK only); owner create/delete
- coaches + all subcollections: owner read/write (public data served via API routes using Admin SDK)

### Test Account

- **Email**: testcoach@example.com
- **Password**: Test123!
- **Slug**: test-coach
- **Public page**: https://coach-app-ashen-delta.vercel.app/test-coach

### Environment Variables (.env.local)

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```
# Claude Code Configuration

## Project: CoachApp - Multi-Tenant Scheduling SaaS

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
│   ├── layout.tsx                    # Root layout + AuthProvider + ToastProvider
│   ├── page.tsx                      # Landing page
│   ├── globals.css                   # Global styles
│   ├── login/page.tsx                # Login page
│   ├── signup/page.tsx               # Signup page with slug creation
│   ├── dashboard/
│   │   ├── layout.tsx                # Auth guard + sidebar + mobile bottom nav
│   │   ├── page.tsx                  # Today's Classes — mark-as-done, class exceptions
│   │   ├── settings/page.tsx         # Working hours (multiple time ranges), duration, buffer, WhatsApp
│   │   ├── locations/page.tsx        # Manage locations
│   │   ├── bookings/page.tsx         # Create/view/cancel bookings (5-min time increments)
│   │   ├── students/page.tsx         # Student management — prepaid, credits, payments, portal links
│   │   ├── income/page.tsx           # Income tracking and projections
│   │   └── waitlist/page.tsx         # View and manage waitlist entries
│   ├── [slug]/page.tsx               # Public coach page with availability + waitlist join
│   ├── student/[token]/page.tsx      # Student portal (read-only lesson history)
│   └── api/
│       ├── coach/[slug]/route.ts     # Public coach profile API (GET)
│       ├── availability/[coachId]/route.ts  # Available slots API (GET)
│       └── student/[token]/route.ts  # Student portal API (Admin SDK, GET)
├── lib/
│   ├── firebase.ts                   # Firebase client init
│   ├── firebase-admin.ts             # Firebase Admin SDK (server-side)
│   ├── auth-context.tsx              # Auth React context + signup/signin/signout
│   ├── availability-engine.ts        # Core slot calculation algorithm (multi-range aware)
│   ├── class-schedule.ts             # Schedule helpers (getClassesForDate, rescheduling)
│   └── students.ts                   # findOrCreateStudent utility (name+phone match)
├── components/
│   └── ui/                           # Button, Input, Select, Modal, PhoneInput, Toast
├── hooks/
│   └── useCoachData.ts               # Firestore hooks: useWorkingHours, useLocations, useBookings, useWaitlist, useStudents, useLessonLogs, useClassExceptions, usePayments, useCoachBySlug
└── types/index.ts                    # TypeScript types (Coach, Booking, Student, LessonLog, ClassException, Payment, etc.)
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
  startDate, endDate                     # Optional date range filtering
  createdAt, cancelledAt

coaches/{coachId}/waitlist/{entryId}     # Waitlist entries from public page
  locationId, locationName, dayOfWeek
  preferredTime                          # 'morning' | 'afternoon' | 'evening' | 'any'
  clientName, clientPhone, notes
  status                                 # 'waiting' | 'contacted' | 'booked'
  createdAt, contactedAt, bookedAt

coaches/{coachId}/students/{studentId}   # Student records with prepaid tracking
  clientName, clientPhone, linkToken
  prepaidTotal, prepaidUsed, credit, pendingPayment
  lessonRate, payPerLesson, linkedToStudentId
  notes, createdAt, updatedAt

coaches/{coachId}/lessonLogs/{logId}     # Completed lesson records
  date, bookingId, studentId, studentName
  locationName, startTime, endTime
  price, note, createdAt

coaches/{coachId}/classExceptions/{exceptionId}  # Per-date overrides
  bookingId, originalDate
  type                                   # 'cancelled' | 'rescheduled'
  newDate, newStartTime, newEndTime, newLocationId, newLocationName, newPrice
  createdAt

coaches/{coachId}/payments/{paymentId}   # Payment collection records
  studentId, studentName, amount
  collectedAt, createdAt
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
11. Waitlist system — clients can join from public page; coach manages via dashboard
    - Public page: modal form (location, day, preferred time, name, phone, notes)
    - Dashboard: tab filtering (Waiting/Contacted/Booked), status transitions, WhatsApp prefill, delete

#### Phase 3 (Implemented)
12. Student tracking — auto-created on booking creation and mark-as-done
13. Prepaid packages — prepaidTotal/prepaidUsed per student, credit balance
14. Lesson logging — mark-as-done creates lessonLog, increments prepaidUsed
15. Student portal — public read-only page at /student/[token] (via Admin SDK API)
16. Linked students — for group lessons with separate-paying parents (linkedToStudentId, linkedStudentIds[], studentPrices{})
17. Class exceptions — cancel or reschedule individual occurrences of recurring bookings
18. Income dashboard — projected vs. actual income, payment tracking
19. Payment collection — record payments per student, pending payment tracking
20. Per-student pricing — lessonRate, payPerLesson flag on Student

### Availability Engine Logic

- Takes: workingHours, lessonDuration, travelBuffer, confirmedBookings, clientLocationId
- Supports multiple time ranges per day (timeRanges array)
- For each day and each range, finds gaps between bookings
- Applies travel buffer only when adjacent booking is at DIFFERENT location than clientLocationId
- Generates available start times in 30-minute increments
- Backward compatible with old single startTime/endTime format

### Security Rules

- coachSlugs: public read, authenticated create (own uid only)
- coaches: public read, owner write
- workingHours/locations: public read, owner write
- bookings: public read (for availability engine), owner write
- waitlist: public create, owner read/write/delete
- students/lessonLogs/classExceptions/payments: owner read/write

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
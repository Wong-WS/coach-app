# Claude Code Configuration

## Project: CoachApp - Multi-Tenant Scheduling SaaS

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
│   │   ├── page.tsx                  # Overview (stats, weekly view, copy public link)
│   │   ├── settings/page.tsx         # Working hours (multiple time ranges), duration, buffer, WhatsApp
│   │   ├── locations/page.tsx        # Manage locations
│   │   ├── bookings/page.tsx         # Create/view/cancel bookings (5-min time increments)
│   │   └── waitlist/page.tsx         # View and manage waitlist entries
│   └── [slug]/page.tsx               # Public coach page with availability + waitlist join
├── lib/
│   ├── firebase.ts                   # Firebase client init
│   ├── auth-context.tsx              # Auth React context + signup logic
│   └── availability-engine.ts        # Core slot calculation algorithm (multi-range aware)
├── components/
│   └── ui/                           # Button, Input, Select, Modal, Toast
├── hooks/
│   └── useCoachData.ts               # Firestore hooks: useWorkingHours, useLocations, useBookings, useWaitlist, useCoachBySlug
└── types/index.ts                    # TypeScript types
```

### Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Hosting**: Vercel (planned)

### Firestore Data Model

```
coachSlugs/{slug}                        # Top-level lookup: slug → coachId
  coachId: string

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
  createdAt, cancelledAt

coaches/{coachId}/waitlist/{entryId}     # Waitlist entries from public page
  locationId, locationName, dayOfWeek
  preferredTime                          # 'morning' | 'afternoon' | 'evening' | 'any'
  clientName, clientPhone, notes
  status                                 # 'waiting' | 'contacted' | 'booked'
  createdAt, contactedAt, bookedAt
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

### Phase 3 (Future)

- WhatsApp/SMS notifications
- Holiday/exception handling
- Payments/subscriptions
- Custom domains

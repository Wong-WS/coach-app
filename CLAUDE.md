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
│   │   ├── layout.tsx                # Auth guard + sidebar navigation
│   │   ├── page.tsx                  # Overview (stats, weekly view)
│   │   ├── settings/page.tsx         # Working hours, duration, buffer
│   │   ├── locations/page.tsx        # Manage locations
│   │   └── bookings/page.tsx         # Create/view/cancel bookings
│   └── [slug]/page.tsx               # Public coach page (view-only)
├── lib/
│   ├── firebase.ts                   # Firebase client init
│   ├── auth-context.tsx              # Auth React context + signup logic
│   └── availability-engine.ts        # Core slot calculation algorithm
├── components/
│   └── ui/                           # Button, Input, Select, Modal, Toast
├── hooks/
│   └── useCoachData.ts               # Firestore hooks for data fetching
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
  enabled, startTime, endTime

coaches/{coachId}/locations/{locationId}
  name, address, notes, createdAt

coaches/{coachId}/bookings/{bookingId}   # Recurring weekly bookings
  locationId, locationName, dayOfWeek
  startTime, endTime, status
  clientName, clientPhone, lessonType, groupSize, notes
  createdAt, cancelledAt
```

### Key Features (Phase 1)

1. Coach signup with unique slug (public URL)
2. Working hours configuration (per day)
3. Lesson duration and travel buffer settings
4. Multiple location management
5. Booking creation/cancellation by coach
6. Public page showing availability by location
7. WhatsApp contact button for clients
8. Availability engine with travel buffer calculation

### Availability Engine Logic

- Takes: workingHours, lessonDuration, travelBuffer, confirmedBookings, clientLocationId
- For each day, finds gaps between bookings
- Applies travel buffer only when adjacent booking is at DIFFERENT location
- Generates available start times in 30-minute increments

### Security Rules

- coachSlugs: public read, authenticated create (own uid only)
- coaches: public read, owner write
- workingHours/locations: public read, owner write
- bookings: public read (for availability engine), owner write

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

### Phase 2 (Future)

- Waitlist system
- WhatsApp/SMS notifications
- Holiday/exception handling

### Phase 3 (Future)

- Payments/subscriptions
- Custom domains

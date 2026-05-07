# Activation Onboarding — Design

**Date:** 2026-05-07
**Status:** Approved (pending written-spec review)

## Problem

Of 4 real beta testers, only 1 (lewcas) actually used the product — added students, bookings, and marked lessons done. The other 3 either bounced after signup or set up partial data and never returned:

- **Xiang Rong Chua** — registered, did literally nothing, never returned.
- **Wilfred Yeap** — added 1 student, 1 wallet, 1 booking on signup day, never returned. Never marked a lesson done, so likely never felt the product's "aha" moment.
- **Isaac Cheng** — came back the next day but only created an empty wallet.

The current signup flow is a single name/email/password form (or Google) that drops the user straight into `/dashboard`. For a brand-new user, the dashboard is the empty "Today's Classes" view — no welcome, no guidance, no explanation of what wallets are or how the product expects them to work. Users have to figure out the mental model on their own.

The Add Lesson modal already does most of the heavy lifting (auto-creates students, lets users create wallets inline) — but new users never discover this because nothing points them at it.

## Goals

1. A brand-new user's first session should result in at least one booking + one student + one wallet.
2. Before the user closes the tab, they should understand what a wallet is and what happens when they mark a lesson done — the product's "aha" moment.
3. Reuse the existing Add Lesson modal as the canonical creation flow. Don't build a parallel onboarding wizard that fragments the mental model.
4. Don't trap users in a flow they can't escape. Guidance, not gating.

## Non-Goals

- **Reactivation of the existing 4 testers.** Different problem (probably a personal email or WhatsApp from the founder, not a product change).
- **Slug capture during signup.** The `coachSlugs/{slug}` lookup exists but no `/[slug]` page is shipped, so a slug currently does nothing user-facing. Don't add ceremony for invisible state.
- **Sample data, video tour, or interactive product tour.** Out of scope — the user picked option B (empty-state CTAs) over A (wizard) and C (sample data).
- **A formal analytics funnel.** The Firestore data we already write (bookings, lessonLogs, wallets) is enough to eyeball activation for the next batch of testers. Revisit instrumentation later if we want a real chart.
- **Retention nudges** (e.g. "you haven't been back in 3 days"). The user picked activation (A) over retention (B) for the first pass.

## User Flow

```
Signup
  → /dashboard
  → "Today's Classes" empty
  → Welcome card (NEW)
       primary CTA → opens Add Lesson modal (with first-time inline hints, NEW)
  → modal saved → first booking exists
  → Welcome card replaced by Post-creation explainer (NEW, shows once)
  → User dismisses explainer
  → Normal dashboard from here on
```

Side path: if a brand-new user clicks Students / Schedule / Payments from the sidebar before adding their first lesson, each page shows a redirect nudge (NEW) pointing them back to `/dashboard`. After the first lesson exists, those pages show their normal content / existing empty states.

## Components

### 1. Welcome card on `/dashboard`

**File:** `src/app/dashboard/page.tsx` (or extract to `src/app/dashboard/_components/WelcomeCard.tsx`).

Visible only when `bookings.length === 0`. (No need to also gate on the explainer flag — once a booking exists, this card is hidden by the booking-count check anyway.)

Replaces the empty "Today's Classes" content area. Single Paper & Ink card:

- **Title:** "Welcome, {coach.displayName}"
- **Body:** "Let's set up your first lesson. You'll learn how students and wallets work along the way."
- **Primary CTA:** "Add my first lesson" — opens the existing Add Lesson modal.
- **Footnote (muted):** "Takes about a minute"

Uses existing `Btn` and Paper & Ink tokens (`--bg`, `--panel`, `--ink`, etc.). No new design language.

### 2. Inline first-time hints in the Add Lesson modal

**File:** `src/app/dashboard/_components/AddLessonModal.tsx`.

A new prop, e.g. `showFirstTimeHints?: boolean`, passed in from `dashboard/page.tsx` based on `bookings.length === 0`. When true, the modal renders two extra info callouts:

- **Above the Student field:** "Type your student's name — if they're new, we'll create them automatically. No separate Students page setup needed."
- **Above the Wallet field:** "Each student gets a wallet — a running balance of money they've paid you. Top it up when they pay, and lessons auto-charge the wallet when you mark them done. Don't worry about the amount yet, just create one."

Callouts use a muted paper-style info box (e.g. `--panel` with `--ink-3` text and a small icon). They disappear once `bookings.length > 0`.

### 3. Post-creation explainer modal

**Trigger:** fires once when `bookings` flips from 0 → 1 in the dashboard's lifetime, AND the `coachapp:firstLessonExplained` localStorage flag is not set.

**File:** new `src/app/dashboard/_components/FirstLessonExplainerModal.tsx`. Uses the existing `<PaperModal>` component.

**Content:**

- **Title:** "Your first lesson is on the calendar 🎉"
- **Body** (templated with the just-created booking):
  - "When this class actually happens on {dayOfWeek} at {startTime}, tap **Mark done** on the card."
  - "We'll automatically deduct {price formatted as RM} from {studentName}'s wallet."
  - "Their wallet balance might go negative — that's fine, it just means they owe you. Top up anytime they pay."
- **CTA:** "Got it" — sets `localStorage.setItem('coachapp:firstLessonExplained', '1')` and closes.

**Fallback for missing data:**
- If no wallet was attached to the booking: drop the "deduct from wallet" line and the "negative balance" line. Replace with a single line: "Tap **Mark done** when the class happens — that's how you'll track completed lessons. You can attach a wallet later for automatic balance tracking."
- If `price` is 0 but a wallet exists: keep the structure but show "RM 0" — preserves the mental model that wallets are how charges work.

Keep the explainer one-shot — never re-show on this device.

**Trigger detection:** a `useEffect` in `dashboard/page.tsx` (or the welcome-card host component) that watches `bookings.length`. When it transitions from 0 → 1, capture the new booking ref, check the localStorage flag, and open the modal if appropriate. Use a `useRef` to remember the previous length so we don't re-fire on subsequent renders.

### 4. Empty-state nudges on Students / Schedule / Payments

**Files:**
- `src/app/dashboard/students/page.tsx`
- `src/app/dashboard/bookings/page.tsx`
- `src/app/dashboard/payments/page.tsx`

Each page already has some form of empty list when there's no data. Add a check at the top of the empty branch: if `bookings.length === 0`, render the **onboarding nudge** instead of (or above) the page's existing empty state.

Nudge content (per page):

- **Students:** "Students show up here once you've added a lesson. Start on **Today's Classes →**"
- **Schedule:** "Your weekly schedule lives here once you've added a lesson. Start on **Today's Classes →**"
- **Payments:** "Wallets show up here once you've added a lesson with a wallet. Start on **Today's Classes →**"

The "Today's Classes" link is a real `<Link href="/dashboard">`.

Once `bookings.length > 0`, the nudge disappears and the page renders its normal content (or its native empty state — e.g. Payments stays in its existing empty state if the user added a lesson without a wallet).

## State Tracking

| State | Where stored |
|---|---|
| "Has activated" (used to gate welcome card + modal hints + sidebar nudges) | Derived from `bookings.length > 0`. No new field. |
| "Has dismissed the post-creation explainer" | `localStorage` key `coachapp:firstLessonExplained`. |

Why localStorage for the explainer flag: re-showing on a new device is a tolerable edge case (it's a teaching moment, not a setting). Saves a Firestore round-trip and a write.

## Edge Cases

- **User signs up, adds a booking, deletes the booking.** Welcome card returns (`bookings.length === 0` again), but the post-creation explainer flag is set in localStorage so the explainer won't re-fire. Acceptable.
- **User signs up on phone, completes flow, signs in on desktop.** Localstorage flag is per-device, so the explainer fires again on desktop if they happen to add a lesson there for the first time on that device. Rare, harmless.
- **User adds a booking without a wallet.** Post-creation explainer renders the shorter version (no deduction line). Payments page later shows its existing empty state, not the onboarding nudge.
- **User clicks Students / Schedule / Payments before clicking the welcome card CTA.** They see the redirect nudge. Click the link, land on dashboard, see welcome card. Smooth.
- **Existing users with `bookings.length === 0`** (e.g. Xiang Rong if she logs back in). They'll see the new welcome card and inline hints. That's the desired behavior — treat them as if they're starting fresh.

## Out of Scope (deliberately)

- Activation analytics / funnel charts
- Retention nudges
- Slug capture
- Welcome video / interactive tour
- Sample seeded data
- Reactivation outreach

## Open Questions

None at design time.

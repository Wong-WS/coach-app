# Unified Booking Creation

## Goal

Consolidate 3 separate booking/lesson creation points into one unified form on the Overview page. Rename the Bookings page to "Schedule" as a read-only weekly reference view.

## Current State

Three creation points exist today:

1. **Overview page "+ Add Class"** — creates ad-hoc one-time bookings (date, location, time, multi-student, note)
2. **Bookings page "Add Booking"** — creates recurring weekly bookings (location, day, time, student, phone, wallet, price, prepaid, split payment, notes)
3. **Students page "Add Lesson"** — creates standalone lesson logs for past dates (date, location, time, price, note); also has "Bulk Add Lessons"

## Design

### 1. Unified "Add Lesson" Form

The "+ Add Class" button on the Overview page opens a single modal that handles both one-time and recurring creation.

**Fields:**

- **Type toggle**: "One-time" (default) | "Recurring"
- **Date** (one-time mode): date picker, defaults to currently selected day on Overview
- **Day of week** (recurring mode): dropdown (Monday-Sunday), replaces the date picker when "Recurring" is selected
- **Location**: dropdown of coach's locations
- **Start / End time**: dropdowns in 5-minute increments
- **Lesson type**: Private (default) | Group
- **Student**: search/autocomplete for existing students, or type a new name
- **Phone**: auto-fills for existing students, required for new
- **Wallet**: dropdown with options:
  - Existing wallets the student is linked to (auto-selected if one exists)
  - Other existing wallets (for linking to a shared family wallet)
  - "+ Create new wallet" — reveals an editable **Wallet name** text field, defaulting to the student's name
  - "No wallet"
- **Wallet name** (only when "+ Create new wallet" is selected): text input, auto-filled with student's name, editable (e.g. coach can change "Sarah Wong" to "Mrs. Wong")
- **Price (RM)**: number input
- **Notes**: optional textarea

**Auto-create wallet for new students:**

When a new student is entered (not found in existing records), the wallet dropdown defaults to "+ Create new wallet" with the wallet name pre-filled as the student's name. The coach can edit the name (e.g. to a parent's name) or pick an existing wallet instead.

**Overlap warning:**

When saving a recurring booking, the form checks for time conflicts with existing recurring bookings on the same day. If an overlap is found, a warning is shown (e.g. "This overlaps with Sarah Wong (Thu 9:00-10:00)") but the coach can still save.

**Group lesson behavior:**

When "Group" is selected, an "+ Add Student" button appears below the first student row. Each student row contains: student name, wallet dropdown, and price. Multiple students can share the same wallet with different prices.

Example:
```
Student 1: Sarah Wong  | [+ Create new] "Mrs. Wong" | RM 80
Student 2: James Wong  | Mrs. Wong (from above)     | RM 60
                               [+ Add Student]
```

When adding a second student in a group, the dropdown includes any wallet created by a prior student row in the same form — so the coach can immediately share a wallet without leaving the form.

On mark-done, each student's wallet gets charged individually (separate charge transactions per student).

**What it creates:**

- One-time mode: a booking with `startDate === endDate` set to the selected date (same as current ad-hoc behavior)
- Recurring mode: a recurring booking with `dayOfWeek` and no `endDate` (same as current Bookings page behavior)

### 2. Schedule Page (renamed from Bookings)

- Rename the nav item from "Bookings" to "Schedule"
- Remove the "Add Booking" button and creation modal entirely
- Display a read-only weekly view of recurring bookings grouped by day (Monday-Sunday)
- Each entry shows: time, student name, location, price
- No edit, cancel, or any action buttons — purely a reference view
- Recurring bookings created via the unified form appear here automatically

Purpose: quick-glance reference for coaches to see their permanent weekly template and spot availability when onboarding new students.

### 3. Recurring Icon on Overview Class Cards

Add a repeat/loop icon (↻) on class cards in the Overview page to distinguish recurring lessons from one-time lessons.

- Recurring lessons: show the ↻ icon next to the time or student name
- One-time lessons: no icon (default appearance)

### 4. Removals

The following creation points are removed:

1. **Bookings page "Add Booking" button and modal** — creation moves to Overview
2. **Overview page current "+ Add Class" modal** — replaced by the new unified form
3. **Students page "Add Lesson" expandable form** — removed
4. **Students page "Bulk Add Lessons" expandable form** — removed

The Students page detail panel retains: Lesson History (read-only with delete/refund), wallet info, rate, portal link, linked students, and "Delete Student".

### 5. Interaction with Existing Features

- **Mark-done flow**: unchanged. Three-dot menu on Overview class cards still triggers the mark-done modal, which charges wallets.
- **Edit/Cancel/Reschedule recurring bookings**: unchanged. Three-dot menu on Overview class cards handles these actions.
- **Wallet refund on lesson delete**: unchanged. Deleting a lesson from the Students page Lesson History triggers a wallet refund.
- **Student auto-creation**: unchanged. Creating a booking with a new student name still calls `findOrCreateStudent`.

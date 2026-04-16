# Unified Booking Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 3 booking creation points into one unified form on the Overview page, rename Bookings to Schedule (read-only), and add a recurring icon to class cards.

**Architecture:** Replace the existing "+ Add Class" modal on `dashboard/page.tsx` with a new unified form that handles both one-time and recurring bookings, including wallet creation and group lessons. Strip `bookings/page.tsx` down to a read-only weekly view. Remove creation forms from `students/page.tsx`.

**Tech Stack:** Next.js 16, TypeScript 5, Tailwind CSS 4, Firebase Firestore

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/dashboard/layout.tsx` | Modify | Rename "Bookings" nav to "Schedule" |
| `src/app/dashboard/bookings/page.tsx` | Modify | Strip to read-only weekly view |
| `src/app/dashboard/page.tsx` | Modify | Replace "+ Add Class" modal with unified form, add recurring icon |
| `src/app/dashboard/students/page.tsx` | Modify | Remove "Add Lesson" and "Bulk Add Lessons" forms |

---

### Task 1: Rename "Bookings" to "Schedule" in Navigation

**Files:**
- Modify: `src/app/dashboard/layout.tsx:10-17`

- [ ] **Step 1: Update nav item label**

In `src/app/dashboard/layout.tsx`, find the `navItems` array (around line 10-17). Change the entry for `/dashboard/bookings`:

```typescript
// BEFORE:
{ href: '/dashboard/bookings', label: 'Bookings', icon: /* calendar SVG path */ }

// AFTER:
{ href: '/dashboard/bookings', label: 'Schedule', icon: /* calendar SVG path */ }
```

Change only the `label` from `'Bookings'` to `'Schedule'`. Keep the same `href` and icon.

- [ ] **Step 2: Verify the nav renders correctly**

Run `npm run dev` and check both the desktop sidebar and mobile bottom nav show "Schedule" instead of "Bookings".

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "Rename Bookings nav item to Schedule"
```

---

### Task 2: Strip Bookings Page to Read-Only Schedule

**Files:**
- Modify: `src/app/dashboard/bookings/page.tsx`

**Context:** The current Bookings page has: (1) a weekly view of recurring bookings grouped by day, (2) an "Add Booking" button + modal form, and (3) Edit/Cancel actions on each booking card. We keep only the weekly view, remove everything else.

- [ ] **Step 1: Update page title**

Change the page heading from "Bookings" to "Schedule":

```tsx
// BEFORE:
<h1 className="text-2xl font-bold ...">Bookings</h1>

// AFTER:
<h1 className="text-2xl font-bold ...">Schedule</h1>
```

- [ ] **Step 2: Remove the "Add Booking" button**

Find and remove the `<Button>` with text "Add Booking" (around line 471). Remove the button element entirely.

- [ ] **Step 3: Remove the modal and form**

Remove the entire modal JSX block that renders the Add Booking form (the `<Modal>` component containing the booking creation form, around lines 612-973). Also remove the edit confirmation modal if there is one.

- [ ] **Step 4: Remove Edit/Cancel action buttons from booking cards**

In the weekly view rendering (around lines 472-548), each booking card has Edit and Cancel buttons. Remove these action buttons from each card, keeping only the display content: time, student name, location, lesson type badge, and price.

- [ ] **Step 5: Remove unused state and handlers**

Remove all state variables and handler functions that are no longer needed:
- Modal state: `isModalOpen`, `editingBookingId`, `formData`, `selectedWalletId`, and any related state
- Handler functions: `handleSubmit`, `handleEdit`, `handleCancel`, `resetForm`, and any other functions only used by the creation/edit flow
- Remove unused imports (e.g., `Modal`, `Input`, `PhoneInput`, form-related Firestore imports like `addDoc`, `updateDoc`, `writeBatch`)

Keep: the `useBookings` hook, the weekly view rendering logic, and any imports needed for display.

- [ ] **Step 6: Verify the page renders correctly**

Run `npm run dev`, navigate to `/dashboard/bookings`. Confirm:
- Page title says "Schedule"
- Weekly view shows recurring bookings grouped by day (Monday-Sunday)
- No "Add Booking" button
- No Edit/Cancel buttons on booking cards
- Each card shows: time range, student name, location, lesson type (Private/Group), price

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/bookings/page.tsx
git commit -m "Strip Bookings page to read-only Schedule view"
```

---

### Task 3: Add Recurring Icon to Overview Class Cards

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Context:** The Overview page renders class cards for each day. Recurring bookings come from the `bookings` collection and are matched to the selected date by `dayOfWeek`. Ad-hoc bookings have `startDate === endDate`. We need to add a repeat icon (↻) to distinguish recurring from one-time.

- [ ] **Step 1: Identify how to detect recurring vs one-time**

A booking is recurring if it does NOT have `startDate === endDate`. Check the class card rendering section (around lines 893-1040 for recurring cards). The booking object has `startDate` and `endDate` fields — if both are set and equal, it's one-time; otherwise it's recurring.

- [ ] **Step 2: Add the recurring icon to class cards**

In the class card JSX where the time range is displayed (e.g., "9:00 AM - 10:00 AM"), add a repeat icon SVG right before or after the time text for recurring bookings:

```tsx
{/* Inside the class card, next to the time display */}
<div className="flex items-center gap-1.5">
  {!(booking.startDate && booking.startDate === booking.endDate) && (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0">
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-9.624-2.848a5.5 5.5 0 019.201-2.466l.312.311H12.768a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V3.537a.75.75 0 00-1.5 0v2.033l-.312-.311A7 7 0 003.628 8.397a.75.75 0 001.449.39z" clipRule="evenodd" />
    </svg>
  )}
  <p className="font-semibold ...">
    {formatTimeDisplay(booking.startTime)} – {formatTimeDisplay(booking.endTime)}
  </p>
</div>
```

Apply this to BOTH the recurring booking cards section AND the done-card section (done recurring cards also need the icon). Do NOT add the icon to ad-hoc class cards (those at the bottom of the page which come from `adHocLogs`).

- [ ] **Step 3: Verify visually**

Run `npm run dev`. On the Overview page:
- Recurring booking cards should show a small blue ↻ icon next to the time
- Ad-hoc/one-time class cards should NOT show the icon
- Done recurring cards should also show the icon

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Add recurring icon to class cards on Overview page"
```

---

### Task 4: Build Unified Form — Basic Structure with Type Toggle

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Context:** Replace the current "+ Add Class" modal (lines 1477-1690) with the new unified form. This task builds the basic form: type toggle (One-time/Recurring), date or day-of-week picker, location, start/end time, single student with phone, price, and notes. Wallet and group features come in later tasks.

- [ ] **Step 1: Add new state variables**

Replace the existing add-class state variables (lines 68-89) with new unified form state. Keep the state in the same location:

```typescript
// Unified form state
const [showAddLesson, setShowAddLesson] = useState(false);
const [lessonType, setLessonType] = useState<'one-time' | 'recurring'>('one-time');
const [lessonMode, setLessonMode] = useState<'private' | 'group'>('private');
const [lessonDate, setLessonDate] = useState(''); // for one-time
const [lessonDayOfWeek, setLessonDayOfWeek] = useState<string>('monday'); // for recurring
const [lessonLocationId, setLessonLocationId] = useState('');
const [lessonStartTime, setLessonStartTime] = useState('09:00');
const [lessonEndTime, setLessonEndTime] = useState('10:00');
const [lessonNote, setLessonNote] = useState('');
const [addingLesson, setAddingLesson] = useState(false);

// Student rows — each row is a student entry with wallet + price
interface StudentRow {
  studentId: string; // existing student ID or empty for new
  displayName: string;
  phone: string;
  isNew: boolean;
  walletOption: 'none' | 'existing' | 'create'; // wallet selection mode
  existingWalletId: string; // when walletOption === 'existing'
  newWalletName: string; // when walletOption === 'create'
  price: number;
}
const [studentRows, setStudentRows] = useState<StudentRow[]>([{
  studentId: '', displayName: '', phone: '', isNew: true,
  walletOption: 'none', existingWalletId: '', newWalletName: '', price: 0,
}]);
const [studentSearch, setStudentSearch] = useState('');

// Overlap warning
const [overlapWarning, setOverlapWarning] = useState('');
```

- [ ] **Step 2: Add helper functions**

```typescript
// Generate 5-minute increment time options (e.g., "06:00", "06:05", ..., "23:55")
const generateTimeOptions = () => {
  const options: string[] = [];
  for (let h = 6; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return options;
};

const updateStudentRow = (index: number, updates: Partial<StudentRow>) => {
  setStudentRows(rows => rows.map((r, i) => i === index ? { ...r, ...updates } : r));
};
```

Note: The existing code likely already has a `generateTimeOptions` or similar. If so, reuse it. If not, add this. The `formatTimeDisplay` function should also already exist in the codebase for converting 24h to 12h format.

- [ ] **Step 3: Add reset function**

```typescript
const resetLessonForm = () => {
  setLessonType('one-time');
  setLessonMode('private');
  setLessonDate(getDateString(selectedDate));
  setLessonDayOfWeek('monday');
  setLessonLocationId(locations[0]?.id || '');
  setLessonStartTime('09:00');
  setLessonEndTime('10:00');
  setLessonNote('');
  setStudentRows([{
    studentId: '', displayName: '', phone: '', isNew: true,
    walletOption: 'none', existingWalletId: '', newWalletName: '', price: 0,
  }]);
  setStudentSearch('');
  setOverlapWarning('');
};
```

- [ ] **Step 4: Build the form JSX**

Replace the existing Add Class `<Modal>` with the new unified form modal. The form should contain:

1. **Type toggle** — two buttons "One-time" and "Recurring", styled like tabs with active state
2. **Date picker** (one-time) OR **Day of week dropdown** (recurring) — swap based on type toggle
3. **Location dropdown** — same as current, populated from `locations`
4. **Start/End time dropdowns** — same as current, 5-min increments
5. **Lesson type toggle** — "Private" / "Group" buttons
6. **Student section** — for now, single student: search input with autocomplete dropdown for existing students, phone field (auto-fills for existing, editable for new)
7. **Price input** — number
8. **Notes textarea** — optional
9. **Create button** — "Create Lesson" / "Create Booking" based on type

```tsx
<Modal open={showAddLesson} onClose={() => setShowAddLesson(false)} title="Add Lesson">
  {/* Type toggle */}
  <div className="flex gap-2 mb-4">
    <button
      className={`flex-1 py-2 rounded-lg text-sm font-medium ${lessonType === 'one-time' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}
      onClick={() => setLessonType('one-time')}
    >One-time</button>
    <button
      className={`flex-1 py-2 rounded-lg text-sm font-medium ${lessonType === 'recurring' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}
      onClick={() => setLessonType('recurring')}
    >Recurring</button>
  </div>

  {/* Date or Day of Week */}
  {lessonType === 'one-time' ? (
    <div className="mb-3">
      <label className="block text-sm font-medium mb-1">Date</label>
      <input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)}
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm" />
    </div>
  ) : (
    <div className="mb-3">
      <label className="block text-sm font-medium mb-1">Day</label>
      <select value={lessonDayOfWeek} onChange={e => setLessonDayOfWeek(e.target.value)}
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm">
        {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => (
          <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
        ))}
      </select>
    </div>
  )}

  {/* Location */}
  <div className="mb-3">
    <label className="block text-sm font-medium mb-1">Location</label>
    <select value={lessonLocationId} onChange={e => setLessonLocationId(e.target.value)}
      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm">
      <option value="">Select location</option>
      {locations.map(loc => (
        <option key={loc.id} value={loc.id}>{loc.name}</option>
      ))}
    </select>
  </div>

  {/* Start / End Time — 5-min increments */}
  <div className="grid grid-cols-2 gap-3 mb-3">
    <div>
      <label className="block text-sm font-medium mb-1">Start Time</label>
      <select value={lessonStartTime} onChange={e => setLessonStartTime(e.target.value)}
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm">
        {generateTimeOptions().map(t => <option key={t} value={t}>{formatTimeDisplay(t)}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">End Time</label>
      <select value={lessonEndTime} onChange={e => setLessonEndTime(e.target.value)}
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm">
        {generateTimeOptions().map(t => <option key={t} value={t}>{formatTimeDisplay(t)}</option>)}
      </select>
    </div>
  </div>

  {/* Lesson mode toggle */}
  <div className="mb-3">
    <label className="block text-sm font-medium mb-1">Lesson Type</label>
    <div className="flex gap-2">
      <button className={`flex-1 py-2 rounded-lg text-sm font-medium ${lessonMode === 'private' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}
        onClick={() => { setLessonMode('private'); setStudentRows(rows => [rows[0]]); }}>Private</button>
      <button className={`flex-1 py-2 rounded-lg text-sm font-medium ${lessonMode === 'group' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}
        onClick={() => setLessonMode('group')}>Group</button>
    </div>
  </div>

  {/* Student row — Task 5 adds wallet, Task 6 adds group rows. For now: single student */}
  <div className="mb-3">
    <label className="block text-sm font-medium mb-1">Student</label>
    <div className="relative">
      <input
        type="text"
        value={studentRows[0].displayName}
        onChange={e => {
          const val = e.target.value;
          setStudentSearch(val);
          updateStudentRow(0, { displayName: val, isNew: true, studentId: '' });
        }}
        placeholder="Search or type new student name"
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm"
      />
      {/* Autocomplete dropdown — show matching students when typing */}
      {studentSearch && (
        <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-600 rounded-lg max-h-40 overflow-y-auto">
          {students.filter(s => s.clientName.toLowerCase().includes(studentSearch.toLowerCase())).map(s => (
            <button key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700"
              onClick={() => {
                const linkedWallet = wallets.find(w => w.studentIds.includes(s.id));
                updateStudentRow(0, {
                  studentId: s.id, displayName: s.clientName, phone: s.clientPhone,
                  isNew: false,
                  walletOption: linkedWallet ? 'existing' : 'none',
                  existingWalletId: linkedWallet?.id || '',
                });
                setStudentSearch('');
              }}>
              {s.clientName}
            </button>
          ))}
        </div>
      )}
    </div>
    {/* Phone */}
    <input type="tel" value={studentRows[0].phone}
      onChange={e => updateStudentRow(0, { phone: e.target.value })}
      placeholder="Phone number" className="w-full mt-2 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm" />
    {/* Price */}
    <div className="mt-2">
      <label className="block text-xs font-medium mb-1 text-zinc-400">Price (RM)</label>
      <input type="number" value={studentRows[0].price || ''}
        onChange={e => updateStudentRow(0, { price: Number(e.target.value) })}
        placeholder="0" className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm" />
    </div>
  </div>

  {/* Notes */}
  <div className="mb-3">
    <label className="block text-sm font-medium mb-1">Notes (optional)</label>
    <textarea value={lessonNote} onChange={e => setLessonNote(e.target.value)}
      placeholder="Additional notes..."
      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm" rows={2} />
  </div>

  {/* Submit */}
  <div className="flex justify-end gap-3 mt-4">
    <button onClick={() => setShowAddLesson(false)} className="px-4 py-2 text-sm">Cancel</button>
    <Button onClick={handleCreateLesson} disabled={addingLesson}>
      {addingLesson ? 'Creating...' : lessonType === 'recurring' ? 'Create Booking' : 'Create Lesson'}
    </Button>
  </div>
</Modal>
```

- [ ] **Step 5: Build the handleCreateLesson function**

This function handles both one-time and recurring creation:

```typescript
const handleCreateLesson = async () => {
  if (!coach || !db || studentRows.length === 0 || !studentRows[0].displayName) return;
  setAddingLesson(true);
  try {
    const firestore = db as Firestore;
    const primaryRow = studentRows[0];

    // Resolve primary student
    const primaryStudent = await findOrCreateStudent(
      firestore, coach.id, primaryRow.displayName, primaryRow.phone
    );

    // Build booking data
    const dayOfWeek = lessonType === 'recurring'
      ? lessonDayOfWeek
      : ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(lessonDate).getDay()];

    const bookingData: Record<string, unknown> = {
      locationId: lessonLocationId,
      locationName: locations.find(l => l.id === lessonLocationId)?.name || '',
      dayOfWeek,
      startTime: lessonStartTime,
      endTime: lessonEndTime,
      status: 'confirmed',
      clientName: primaryRow.displayName,
      clientPhone: primaryRow.phone,
      lessonType: lessonMode,
      groupSize: lessonMode === 'group' ? studentRows.length : 1,
      notes: lessonNote,
      price: primaryRow.price,
      createdAt: serverTimestamp(),
    };

    // One-time: set startDate === endDate
    if (lessonType === 'one-time') {
      bookingData.startDate = lessonDate;
      bookingData.endDate = lessonDate;
    }

    // Handle wallet (Task 5 will expand this)
    // Handle linked students for groups (Task 6 will expand this)

    await addDoc(collection(firestore, 'coaches', coach.id, 'bookings'), bookingData);
    showToast('Lesson created!', 'success');
    setShowAddLesson(false);
    resetLessonForm();
  } catch (error) {
    console.error('Error creating lesson:', error);
    showToast('Failed to create lesson', 'error');
  } finally {
    setAddingLesson(false);
  }
};
```

- [ ] **Step 6: Update the "+ Add Class" button to use new form**

Change the button that opens the modal:

```tsx
// BEFORE:
<Button onClick={() => { /* old add class logic */ }}>+ Add Class</Button>

// AFTER:
<Button onClick={() => { resetLessonForm(); setShowAddLesson(true); }}>+ Add Lesson</Button>
```

- [ ] **Step 7: Remove old Add Class state and modal**

Remove all the old state variables (`showAddClass`, `addClassDate`, `addClassLocationId`, `addClassStartTime`, `addClassEndTime`, `addClassNote`, `addClassSearch`, `addClassSelectedStudents`, `showNewStudentForm`, `newStudentName`, `newStudentPhone`, `newStudentPrice`, `newStudentPayPerLesson`), the old `handleAddClass` function, and the old `<Modal>` JSX for Add Class.

- [ ] **Step 8: Verify the basic form works**

Run `npm run dev`. On the Overview page:
- Click "+ Add Lesson" — modal opens with type toggle, date/day, location, time, student, price, notes
- Toggle between One-time and Recurring — date picker swaps to day-of-week dropdown
- Create a one-time lesson — booking appears as a class card on that date
- Create a recurring lesson — booking appears on the weekly schedule

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Replace Add Class modal with unified Add Lesson form"
```

---

### Task 5: Add Wallet Selection + Auto-Create to Unified Form

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Context:** The unified form from Task 4 has student rows with `walletOption`, `existingWalletId`, and `newWalletName` fields already defined but not wired up. This task adds the wallet dropdown UI and the auto-create wallet logic on submit.

- [ ] **Step 1: Add wallet UI to the student row**

Below the student name and phone fields, add a wallet selection section per student row:

```tsx
{/* Wallet selection for student row */}
<div className="mb-2">
  <label className="block text-xs font-medium mb-1 text-zinc-400">Wallet</label>
  <select
    value={row.walletOption === 'existing' ? row.existingWalletId : row.walletOption}
    onChange={e => {
      const val = e.target.value;
      if (val === 'none') {
        updateStudentRow(i, { walletOption: 'none', existingWalletId: '', newWalletName: '' });
      } else if (val === 'create') {
        updateStudentRow(i, { walletOption: 'create', existingWalletId: '', newWalletName: row.displayName });
      } else {
        updateStudentRow(i, { walletOption: 'existing', existingWalletId: val, newWalletName: '' });
      }
    }}
    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm"
  >
    <option value="none">No wallet</option>
    {wallets.map(w => (
      <option key={w.id} value={w.id}>{w.name} (RM {w.balance})</option>
    ))}
    {/* Include wallets pending creation from other rows in this form */}
    {studentRows
      .filter((r, ri) => ri < i && r.walletOption === 'create' && r.newWalletName)
      .map((r, ri) => (
        <option key={`pending-${ri}`} value={`pending:${ri}`}>
          {r.newWalletName} (new)
        </option>
      ))
    }
    <option value="create">+ Create new wallet</option>
  </select>
</div>

{/* Wallet name input — only when creating new */}
{row.walletOption === 'create' && (
  <div className="mb-2">
    <label className="block text-xs font-medium mb-1 text-zinc-400">Wallet Name</label>
    <input
      type="text"
      value={row.newWalletName}
      onChange={e => updateStudentRow(i, { newWalletName: e.target.value })}
      placeholder="e.g. Mrs. Wong"
      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm"
    />
  </div>
)}
```

- [ ] **Step 2: Auto-default to "create" for new students**

When a student is selected as new (typed a name not found in existing students), auto-set `walletOption: 'create'` and `newWalletName` to the student's display name:

```typescript
// In the student search/select handler, when selecting "New student: ..."
updateStudentRow(i, {
  studentId: '',
  displayName: name,
  isNew: true,
  walletOption: 'create',
  newWalletName: name,
});
```

When selecting an existing student, auto-detect their linked wallet:

```typescript
// When selecting an existing student
const linkedWallet = wallets.find(w => w.studentIds.includes(student.id));
updateStudentRow(i, {
  studentId: student.id,
  displayName: student.clientName,
  phone: student.clientPhone,
  isNew: false,
  walletOption: linkedWallet ? 'existing' : 'none',
  existingWalletId: linkedWallet?.id || '',
  newWalletName: '',
});
```

- [ ] **Step 3: Handle wallet creation in handleCreateLesson**

In `handleCreateLesson`, after resolving the student but before creating the booking, handle wallet creation:

```typescript
// Create new wallets if needed
const walletIdMap = new Map<number, string>(); // rowIndex -> walletId

for (let i = 0; i < studentRows.length; i++) {
  const row = studentRows[i];
  if (row.walletOption === 'create' && row.newWalletName) {
    const walletRef = await addDoc(collection(firestore, 'coaches', coach.id, 'wallets'), {
      name: row.newWalletName,
      balance: 0,
      studentIds: [], // will be updated after student is resolved
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    walletIdMap.set(i, walletRef.id);
  } else if (row.walletOption === 'existing') {
    // Check if it references a pending wallet from another row
    if (row.existingWalletId.startsWith('pending:')) {
      const refIndex = parseInt(row.existingWalletId.split(':')[1]);
      const pendingId = walletIdMap.get(refIndex);
      if (pendingId) walletIdMap.set(i, pendingId);
    } else {
      walletIdMap.set(i, row.existingWalletId);
    }
  }
}

// Link primary student to wallet (Task 5 only handles primary student; Task 6 adds linked students)
const primaryWalletIdForLink = walletIdMap.get(0);
if (primaryWalletIdForLink) {
  const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', primaryWalletIdForLink);
  const walletSnap = await getDoc(walletRef);
  const currentIds = walletSnap.data()?.studentIds || [];
  if (!currentIds.includes(primaryStudent.id)) {
    await updateDoc(walletRef, {
      studentIds: [...currentIds, primaryStudent.id],
      updatedAt: serverTimestamp(),
    });
  }
}

// Set walletId on the booking
const primaryWalletId = walletIdMap.get(0);
if (primaryWalletId) {
  bookingData.walletId = primaryWalletId;
}
```

- [ ] **Step 4: Add missing imports**

Ensure `getDoc` is imported from `firebase/firestore`:

```typescript
import { ..., getDoc } from 'firebase/firestore';
```

- [ ] **Step 5: Verify wallet creation flow**

Test the following scenarios:
1. New student → wallet auto-defaults to "Create new", name pre-filled → saves booking + creates wallet + links student
2. Existing student with wallet → wallet auto-selected → saves booking with walletId
3. Existing student without wallet → shows "No wallet" → coach can pick "Create new" or leave as none
4. New student → coach changes wallet name from "Sarah Wong" to "Mrs. Wong" → wallet created with custom name

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Add wallet selection and auto-create to unified form"
```

---

### Task 6: Add Group Lesson Support to Unified Form

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Context:** When lesson mode is "Group", the form should allow adding multiple student rows. Each row has its own student name, phone, wallet, and price. The booking stores `linkedStudentIds` and `studentPrices` for the secondary students.

- [ ] **Step 1: Add "+ Add Student" button in group mode**

After the first student row, when `lessonMode === 'group'`, show an "+ Add Student" button:

```tsx
{lessonMode === 'group' && (
  <button
    onClick={() => setStudentRows(rows => [...rows, {
      studentId: '', displayName: '', phone: '', isNew: true,
      walletOption: 'none', existingWalletId: '', newWalletName: '', price: 0,
    }])}
    className="text-sm text-blue-500 hover:text-blue-400 mt-2"
  >
    + Add Student
  </button>
)}
```

- [ ] **Step 2: Render multiple student rows**

Wrap the student section in a `studentRows.map()` loop. Each row gets its own student search, phone, wallet, and price fields. Add a remove button (X) for rows after the first:

```tsx
{studentRows.map((row, i) => (
  <div key={i} className="mb-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-zinc-400">Student {i + 1}</span>
      {i > 0 && (
        <button onClick={() => setStudentRows(rows => rows.filter((_, ri) => ri !== i))}
          className="text-xs text-red-500 hover:text-red-400">Remove</button>
      )}
    </div>
    {/* Student name — same autocomplete pattern as Task 4 single student */}
    <div className="relative">
      <input type="text" value={row.displayName}
        onChange={e => updateStudentRow(i, { displayName: e.target.value, isNew: true, studentId: '' })}
        placeholder="Search or type student name"
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm" />
      {/* Autocomplete dropdown — same as Task 4 but calling updateStudentRow(i, ...) */}
    </div>
    {/* Phone */}
    <input type="tel" value={row.phone} onChange={e => updateStudentRow(i, { phone: e.target.value })}
      placeholder="Phone" className="w-full mt-2 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm" />
    {/* Wallet selection — exact same UI from Task 5 Step 1, using row and index i */}
    {/* Price */}
    <div className="mt-2">
      <label className="block text-xs font-medium mb-1 text-zinc-400">Price (RM)</label>
      <input type="number" value={row.price || ''} onChange={e => updateStudentRow(i, { price: Number(e.target.value) })}
        className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm" />
    </div>
  </div>
))}
```

- [ ] **Step 3: Update handleCreateLesson for group bookings**

When multiple student rows exist, resolve all students and store linked IDs + per-student pricing:

```typescript
// After resolving all students...
if (studentRows.length > 1) {
  const linkedIds: string[] = [];
  const studentPricesMap: Record<string, number> = {};
  const studentWalletsMap: Record<string, string> = {};

  // Primary student
  studentPricesMap[primaryStudentId] = studentRows[0].price;
  const primaryWalletId = walletIdMap.get(0);
  if (primaryWalletId) studentWalletsMap[primaryStudentId] = primaryWalletId;

  // Linked students
  for (let i = 1; i < studentRows.length; i++) {
    const row = studentRows[i];
    const linkedStudent = await findOrCreateStudent(
      firestore, coach.id, row.displayName, row.phone
    );
    linkedIds.push(linkedStudent.id);
    studentPricesMap[linkedStudent.id] = row.price;
    const walletId = walletIdMap.get(i);
    if (walletId) studentWalletsMap[linkedStudent.id] = walletId;
  }

  bookingData.linkedStudentIds = linkedIds;
  bookingData.studentPrices = studentPricesMap;
  if (Object.keys(studentWalletsMap).length > 0) {
    bookingData.studentWallets = studentWalletsMap;
  }
}
```

- [ ] **Step 4: Verify group lesson creation**

Test:
1. Select "Group" → "+ Add Student" appears → add 2 students with different prices and same wallet → booking created with `linkedStudentIds` and `studentPrices`
2. Mark the group lesson done → both students get individual charge transactions on the shared wallet
3. Create group with students on different wallets → each wallet charged correctly

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Add group lesson support with multi-student rows to unified form"
```

---

### Task 7: Add Overlap Warning for Recurring Bookings

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Context:** When creating a recurring booking, check if any existing recurring booking on the same day overlaps in time. Show a warning but allow saving.

- [ ] **Step 1: Add overlap detection function**

```typescript
const checkOverlap = (dayOfWeek: string, startTime: string, endTime: string): string => {
  const recurringOnDay = bookings.filter(
    b => b.dayOfWeek === dayOfWeek && b.status === 'confirmed' && !(b.startDate && b.startDate === b.endDate)
  );
  for (const b of recurringOnDay) {
    // Two time ranges overlap if one starts before the other ends
    if (startTime < b.endTime && endTime > b.startTime) {
      return `This overlaps with ${b.clientName} (${formatTimeDisplay(b.startTime)}–${formatTimeDisplay(b.endTime)})`;
    }
  }
  return '';
};
```

- [ ] **Step 2: Trigger overlap check when relevant fields change**

Add a `useEffect` that runs whenever `lessonType`, `lessonDayOfWeek`, `lessonStartTime`, or `lessonEndTime` changes:

```typescript
useEffect(() => {
  if (lessonType === 'recurring') {
    setOverlapWarning(checkOverlap(lessonDayOfWeek, lessonStartTime, lessonEndTime));
  } else {
    setOverlapWarning('');
  }
}, [lessonType, lessonDayOfWeek, lessonStartTime, lessonEndTime, bookings]);
```

- [ ] **Step 3: Display the warning in the form**

Add a warning banner above the submit button:

```tsx
{overlapWarning && (
  <div className="mb-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700 text-yellow-400 text-sm">
    ⚠ {overlapWarning}
  </div>
)}
```

- [ ] **Step 4: Verify**

Create a recurring booking on Thursday 9:00-10:00. Then try to create another on Thursday 9:30-10:30. The warning should appear but saving should still work.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Add overlap warning for recurring bookings in unified form"
```

---

### Task 8: Remove Creation Forms from Students Page

**Files:**
- Modify: `src/app/dashboard/students/page.tsx`

**Context:** The Students page has two lesson creation sections in the student detail panel: "Add Lesson" (lines 1010-1086) and "Bulk Add Lessons" (lines 1089-1222). Both need to be removed along with their state variables and handler functions.

- [ ] **Step 1: Remove "Add Lesson" form JSX**

Find the expandable "Add Lesson" section in the student detail panel JSX (around lines 1010-1086, inside the `selectedStudent` modal). Remove the entire section including the toggle button and the form content.

- [ ] **Step 2: Remove "Bulk Add Lessons" form JSX**

Find the expandable "Bulk Add Lessons" section (around lines 1089-1222). Remove the entire section.

- [ ] **Step 3: Remove "Add Lesson" state variables**

Remove these state declarations (around lines 37-48):
- `showAddLesson`, `lessonDate`, `lessonLocationId`, `lessonLocationName`, `lessonStartTime`, `lessonEndTime`, `lessonPrice`, `lessonNote`, `addingLesson`

- [ ] **Step 4: Remove "Bulk Add Lessons" state variables**

Remove these state declarations (around lines 51-64):
- `showBulkAdd`, `bulkStartDate`, `bulkEndDate`, `bulkDays`, `bulkLocationName`, `bulkStartTime`, `bulkEndTime`, `bulkPrice`, `bulkNote`, `addingBulk`

- [ ] **Step 5: Remove handler functions**

Remove:
- `handleAddLesson` function (around lines 373-407)
- `handleBulkAddLessons` function (around lines 428-469)
- `generateBulkDates` helper function (around lines 410-426)

- [ ] **Step 6: Clean up unused imports**

Check if any imports are now unused after removing the above code. Remove any that are no longer referenced (e.g., if `addDoc` or `collection` are only used by the removed handlers — but check first since `handleDeleteLog` may still use them).

- [ ] **Step 7: Verify the Students page still works**

Run `npm run dev`, navigate to Students page:
- Click on a student → detail panel opens
- Lesson History section still shows with delete capability
- "Add Lesson" and "Bulk Add Lessons" sections are gone
- Wallet info, rate, portal link, linked students, "Delete Student" all still present
- No console errors

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/students/page.tsx
git commit -m "Remove Add Lesson and Bulk Add Lessons from Students page"
```

# Low-Balance Alert + Top-Up Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface wallets that can't cover the next lesson, show the exact top-up amount, and silence noise cleanly via pay-per-lesson + archive flags.

**Architecture:** Three new optional fields on `Wallet` (no migration — defaults on read), a pure-function helper module (`src/lib/wallet-alerts.ts`) drives all alert/threshold decisions with unit tests. UI surfaces the state as badges on the Payments page, a filter chip, enhanced Top-up modal with math preview, and a dashboard alert card.

**Tech Stack:** Next.js 16 App Router · TypeScript 5 · Tailwind CSS 4 · Firebase Firestore · Vitest (unit tests)

**Spec:** `docs/superpowers/specs/2026-04-18-low-balance-alert-design.md`

---

## File Structure

**New files:**
- `src/lib/wallet-alerts.ts` — pure helpers: `getNextLessonCost`, `hasActiveBooking`, `isLowBalance`, `getTopUpMinimum`
- `src/lib/__tests__/wallet-alerts.test.ts` — unit tests colocated with existing `cancel-scope.test.ts`

**Modified files:**
- `src/types/index.ts` — add 3 optional fields to `Wallet`
- `src/hooks/useCoachData.ts` — read new fields in `useWallets`
- `src/app/dashboard/payments/page.tsx` — badges, new filter chip, Show archived toggle, detail panel actions, enhanced top-up modal, query param handling
- `src/app/dashboard/page.tsx` — alert card at top of Today's Classes

---

## Task 1: Extend `Wallet` type and hook

Adds `payPerLesson`, `archived`, and `minLessonsPerTopUp` to the `Wallet` type and `useWallets` hook. All optional; defaults applied on read.

**Files:**
- Modify: `src/types/index.ts` (Wallet interface, ~lines 84-91)
- Modify: `src/hooks/useCoachData.ts` (useWallets reader, ~lines 247-254)

- [ ] **Step 1: Extend `Wallet` interface**

Edit `src/types/index.ts` — replace the `Wallet` interface block with:

```ts
export interface Wallet {
  id: string;
  name: string;
  balance: number;
  studentIds: string[];
  payPerLesson?: boolean;       // default false. disables alerts + top-up minimums.
  archived?: boolean;           // default false. hides from default list, disables alerts.
  minLessonsPerTopUp?: number;  // default 5. how many lessons one top-up should cover.
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Extend `useWallets` reader**

Edit `src/hooks/useCoachData.ts` — in `useWallets` (~line 247), update the `.map(...)` to read the new fields:

```ts
const items: Wallet[] = snapshot.docs.map((d) => ({
  id: d.id,
  name: d.data().name,
  balance: d.data().balance ?? 0,
  studentIds: d.data().studentIds ?? [],
  payPerLesson: d.data().payPerLesson ?? false,
  archived: d.data().archived ?? false,
  minLessonsPerTopUp: d.data().minLessonsPerTopUp ?? 5,
  createdAt: d.data().createdAt?.toDate() || new Date(),
  updatedAt: d.data().updatedAt?.toDate() || new Date(),
}));
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/hooks/useCoachData.ts
git commit -m "Wallet: add payPerLesson, archived, minLessonsPerTopUp fields"
```

---

## Task 2: `wallet-alerts.ts` helpers + unit tests (TDD)

Pure-function module that all UI later consumes. No React, no Firestore — just types in, value out. Full unit test coverage.

**Files:**
- Create: `src/lib/wallet-alerts.ts`
- Create: `src/lib/__tests__/wallet-alerts.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/__tests__/wallet-alerts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getNextLessonCost,
  hasActiveBooking,
  isLowBalance,
  getTopUpMinimum,
} from '@/lib/wallet-alerts';
import type { Booking, Wallet } from '@/types';

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'w1',
    name: 'Test Wallet',
    balance: 0,
    studentIds: ['s1'],
    payPerLesson: false,
    archived: false,
    minLessonsPerTopUp: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    locationId: 'loc1',
    locationName: 'Court A',
    dayOfWeek: 'monday',
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    className: 'Test Class',
    notes: '',
    studentIds: ['s1'],
    studentPrices: { s1: 60 },
    studentWallets: { s1: 'w1' },
    createdAt: new Date(),
    ...overrides,
  };
}

describe('getNextLessonCost', () => {
  it('returns 0 when no bookings reference the wallet', () => {
    const wallet = makeWallet();
    expect(getNextLessonCost(wallet, [])).toBe(0);
  });

  it('sums prices for students in this wallet (single booking)', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1', 's2'] });
    const booking = makeBooking({
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 60, s2: 60 },
      studentWallets: { s1: 'w1', s2: 'w1' },
    });
    expect(getNextLessonCost(wallet, [booking])).toBe(120);
  });

  it('excludes students in the same booking who use a different wallet', () => {
    const wallet = makeWallet({ id: 'w1', studentIds: ['s1'] });
    const booking = makeBooking({
      studentIds: ['s1', 's2'],
      studentPrices: { s1: 60, s2: 60 },
      studentWallets: { s1: 'w1', s2: 'w2' },
    });
    expect(getNextLessonCost(wallet, [booking])).toBe(60);
  });

  it('takes max across multiple bookings (worst-case single day)', () => {
    const wallet = makeWallet({ id: 'w1' });
    const b1 = makeBooking({ id: 'b1', studentPrices: { s1: 100 }, studentWallets: { s1: 'w1' } });
    const b2 = makeBooking({ id: 'b2', studentPrices: { s1: 140 }, studentWallets: { s1: 'w1' } });
    expect(getNextLessonCost(wallet, [b1, b2])).toBe(140);
  });

  it('ignores bookings that do not reference the wallet', () => {
    const wallet = makeWallet({ id: 'w1' });
    const other = makeBooking({ studentWallets: { s1: 'w2' } });
    expect(getNextLessonCost(wallet, [other])).toBe(0);
  });
});

describe('hasActiveBooking', () => {
  it('returns false when no bookings reference the wallet', () => {
    const wallet = makeWallet();
    expect(hasActiveBooking(wallet, [], '2026-04-18')).toBe(false);
  });

  it('returns true for an open-ended booking (no endDate)', () => {
    const wallet = makeWallet();
    const b = makeBooking();
    expect(hasActiveBooking(wallet, [b], '2026-04-18')).toBe(true);
  });

  it('returns true when endDate is today', () => {
    const wallet = makeWallet();
    const b = makeBooking({ endDate: '2026-04-18' });
    expect(hasActiveBooking(wallet, [b], '2026-04-18')).toBe(true);
  });

  it('returns true when endDate is in the future', () => {
    const wallet = makeWallet();
    const b = makeBooking({ endDate: '2026-06-01' });
    expect(hasActiveBooking(wallet, [b], '2026-04-18')).toBe(true);
  });

  it('returns false when all bookings have ended', () => {
    const wallet = makeWallet();
    const b = makeBooking({ endDate: '2026-03-01' });
    expect(hasActiveBooking(wallet, [b], '2026-04-18')).toBe(false);
  });

  it('returns true if ANY booking is still active', () => {
    const wallet = makeWallet();
    const ended = makeBooking({ id: 'b1', endDate: '2026-03-01' });
    const active = makeBooking({ id: 'b2' });
    expect(hasActiveBooking(wallet, [ended, active], '2026-04-18')).toBe(true);
  });
});

describe('isLowBalance', () => {
  const today = '2026-04-18';
  const booking = makeBooking();

  it('fires when balance < next lesson cost and all gating rules pass', () => {
    const wallet = makeWallet({ balance: 20 });
    expect(isLowBalance(wallet, [booking], today)).toBe(true);
  });

  it('does not fire when balance >= next lesson cost', () => {
    const wallet = makeWallet({ balance: 60 });
    expect(isLowBalance(wallet, [booking], today)).toBe(false);
  });

  it('does not fire for pay-per-lesson wallets', () => {
    const wallet = makeWallet({ balance: 0, payPerLesson: true });
    expect(isLowBalance(wallet, [booking], today)).toBe(false);
  });

  it('does not fire for archived wallets', () => {
    const wallet = makeWallet({ balance: 0, archived: true });
    expect(isLowBalance(wallet, [booking], today)).toBe(false);
  });

  it('does not fire when wallet has no active bookings', () => {
    const wallet = makeWallet({ balance: 0 });
    const ended = makeBooking({ endDate: '2026-03-01' });
    expect(isLowBalance(wallet, [ended], today)).toBe(false);
  });

  it('does not fire for orphan wallet (no bookings at all)', () => {
    const wallet = makeWallet({ balance: -100 });
    expect(isLowBalance(wallet, [], today)).toBe(false);
  });
});

describe('getTopUpMinimum', () => {
  it('returns rate × 5 − balance by default', () => {
    const wallet = makeWallet({ balance: 20 });
    const booking = makeBooking();
    expect(getTopUpMinimum(wallet, [booking])).toBe(280); // 60*5 - 20
  });

  it('respects custom minLessonsPerTopUp', () => {
    const wallet = makeWallet({ balance: 0, minLessonsPerTopUp: 10 });
    const booking = makeBooking();
    expect(getTopUpMinimum(wallet, [booking])).toBe(600); // 60*10 - 0
  });

  it('rolls over positive balance (subtracts it from the ask)', () => {
    const wallet = makeWallet({ balance: 200, minLessonsPerTopUp: 5 });
    const booking = makeBooking({ studentPrices: { s1: 240 }, studentWallets: { s1: 'w1' } });
    expect(getTopUpMinimum(wallet, [booking])).toBe(1000); // 240*5 - 200
  });

  it('adds negative balance back onto the ask', () => {
    const wallet = makeWallet({ balance: -40 });
    const booking = makeBooking();
    expect(getTopUpMinimum(wallet, [booking])).toBe(340); // 60*5 - (-40) = 300 + 40
  });

  it('returns 0 for pay-per-lesson wallets', () => {
    const wallet = makeWallet({ balance: -100, payPerLesson: true });
    const booking = makeBooking();
    expect(getTopUpMinimum(wallet, [booking])).toBe(0);
  });

  it('returns 0 when wallet has no active bookings (rate is 0)', () => {
    const wallet = makeWallet({ balance: 0 });
    expect(getTopUpMinimum(wallet, [])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/wallet-alerts.test.ts`
Expected: FAIL with module-not-found error on `@/lib/wallet-alerts`.

- [ ] **Step 3: Implement `wallet-alerts.ts`**

Create `src/lib/wallet-alerts.ts`:

```ts
import type { Booking, Wallet } from '@/types';

/**
 * Sum of studentPrices paid out of `wallet` for a single occurrence of `booking`.
 * Only students in this booking who explicitly use this wallet count.
 */
function occurrenceCost(wallet: Wallet, booking: Booking): number {
  let sum = 0;
  for (const studentId of booking.studentIds) {
    if (booking.studentWallets?.[studentId] === wallet.id) {
      sum += booking.studentPrices?.[studentId] ?? 0;
    }
  }
  return sum;
}

/**
 * Worst-case cost for this wallet on any single class day,
 * across all active bookings that reference it.
 * Returns 0 if no bookings reference the wallet.
 */
export function getNextLessonCost(wallet: Wallet, bookings: Booking[]): number {
  let max = 0;
  for (const b of bookings) {
    const cost = occurrenceCost(wallet, b);
    if (cost > max) max = cost;
  }
  return max;
}

/**
 * True when at least one booking references this wallet and is not ended.
 * Ended = has endDate AND endDate < today.
 */
export function hasActiveBooking(wallet: Wallet, bookings: Booking[], today: string): boolean {
  for (const b of bookings) {
    let referencesWallet = false;
    for (const studentId of b.studentIds) {
      if (b.studentWallets?.[studentId] === wallet.id) {
        referencesWallet = true;
        break;
      }
    }
    if (!referencesWallet) continue;
    if (!b.endDate || b.endDate >= today) return true;
  }
  return false;
}

/**
 * The single rule the whole feature hangs on.
 */
export function isLowBalance(wallet: Wallet, bookings: Booking[], today: string): boolean {
  if (wallet.payPerLesson) return false;
  if (wallet.archived) return false;
  if (!hasActiveBooking(wallet, bookings, today)) return false;
  return wallet.balance < getNextLessonCost(wallet, bookings);
}

/**
 * Cash amount the coach should ask for to cover `minLessonsPerTopUp` lessons,
 * after rolling over the current balance. Returns 0 for pay-per-lesson wallets
 * or wallets with no active bookings.
 */
export function getTopUpMinimum(wallet: Wallet, bookings: Booking[]): number {
  if (wallet.payPerLesson) return 0;
  const rate = getNextLessonCost(wallet, bookings);
  if (rate === 0) return 0;
  const packageSize = wallet.minLessonsPerTopUp ?? 5;
  return rate * packageSize - wallet.balance;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/__tests__/wallet-alerts.test.ts`
Expected: All tests PASS (24 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wallet-alerts.ts src/lib/__tests__/wallet-alerts.test.ts
git commit -m "Add wallet-alerts: isLowBalance, getNextLessonCost, getTopUpMinimum"
```

---

## Task 3: Wallet detail panel — pay-per-lesson, archive, package size

Adds three new controls to the wallet detail panel: a `Pay per lesson` checkbox, an `Archive` / `Unarchive` button, and a `Package size` number input. Each updates Firestore directly via `updateDoc`.

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx` (WalletDetail component, ~lines 55-220)

- [ ] **Step 1: Extend `WalletDetail` props**

Find the props type for `WalletDetail` (~line 55). Add two new props:

```ts
// inside the WalletDetail props type
coachId: string;
onToggleArchive: () => void;
```

And at the call site for `<WalletDetail ... />` (~line 980), pass:

```tsx
coachId={coach.id}
onToggleArchive={() => setSelectedWallet(null)}
```

- [ ] **Step 2: Add action row + package size input inside `WalletDetail`**

Find the existing "Action buttons" block inside `WalletDetail` (~line 156-164, with the `+ Top Up` and `Adjustment` buttons). **Just below** that block, insert:

```tsx
{/* Wallet settings row */}
<div className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-100 dark:border-[#333333]">
  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
    <input
      type="checkbox"
      checked={wallet.payPerLesson ?? false}
      onChange={async (e) => {
        if (!db) return;
        await updateDoc(
          doc(db as Firestore, 'coaches', coachId, 'wallets', wallet.id),
          { payPerLesson: e.target.checked, updatedAt: serverTimestamp() }
        );
      }}
      className="rounded"
    />
    Pay per lesson
  </label>

  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
    Package size:
    <input
      type="number"
      min="1"
      value={wallet.minLessonsPerTopUp ?? 5}
      onChange={async (e) => {
        if (!db) return;
        const n = parseInt(e.target.value, 10);
        if (isNaN(n) || n < 1) return;
        await updateDoc(
          doc(db as Firestore, 'coaches', coachId, 'wallets', wallet.id),
          { minLessonsPerTopUp: n, updatedAt: serverTimestamp() }
        );
      }}
      className="w-16 px-2 py-1 border border-gray-300 dark:border-zinc-500 rounded text-sm bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
    />
    lessons
  </label>

  <button
    onClick={async () => {
      if (!db) return;
      await updateDoc(
        doc(db as Firestore, 'coaches', coachId, 'wallets', wallet.id),
        { archived: !(wallet.archived ?? false), updatedAt: serverTimestamp() }
      );
      onToggleArchive();
    }}
    className="ml-auto text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 underline"
  >
    {wallet.archived ? 'Unarchive' : 'Archive'}
  </button>
</div>
```

- [ ] **Step 3: Verify imports**

The top of `src/app/dashboard/payments/page.tsx` must import `updateDoc`, `doc`, `serverTimestamp`, and `Firestore` from `firebase/firestore` and `db` from `@/lib/firebase`. Confirm — if any are missing, add them. (They're almost certainly already imported, since top-up and adjustment use them.)

Run: `grep -E "^import.*(updateDoc|serverTimestamp|Firestore)" src/app/dashboard/payments/page.tsx`
Expected: a line showing all three are imported from `firebase/firestore`.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`. In a browser:
1. Open a wallet detail panel on the Payments page
2. Toggle `Pay per lesson` checkbox → Firestore doc updates (check Firestore console or just refresh and confirm the checkbox state persists)
3. Change `Package size` to 10 → persists on refresh
4. Click `Archive` → the panel closes (because `onToggleArchive` calls `setSelectedWallet(null)`). The wallet should vanish from the default list (we'll verify in Task 4; for now just confirm the Firestore field flipped).
5. Manually flip `archived` back to false in Firestore console, re-open, click `Archive` again → same behavior.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/payments/page.tsx
git commit -m "Wallet detail: pay-per-lesson toggle, package size editor, archive action"
```

---

## Task 4: Payments page — badges, `Running low` filter, Show archived

Adds the visual signal on wallet cards (`Running low` / `Pay per lesson` / `Archived` badges), a new `Running low` filter chip, a `Show archived` toggle to unhide archived wallets (hidden by default), and support for the `?filter=low` query param so the dashboard alert card can deep-link here.

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx` (wallets tab — filter state, `filteredWallets` useMemo, chip row, wallet card render, ~lines 407-970)

- [ ] **Step 1: Import helpers and query param reader**

Near the top of `src/app/dashboard/payments/page.tsx`, add:

```ts
import { useSearchParams } from 'next/navigation';
import { isLowBalance } from '@/lib/wallet-alerts';
```

- [ ] **Step 2: Extend the filter state type**

Find `const [walletDayFilter, setWalletDayFilter] = useState<...>('all')` (~line 408). Change its type to:

```ts
const [walletDayFilter, setWalletDayFilter] = useState<
  DayOfWeek | 'all' | 'adhoc' | 'negative' | 'low'
>('all');
const [showArchived, setShowArchived] = useState(false);
```

- [ ] **Step 3: Read the `?filter=low` query param on mount**

Directly after the two `useState` lines above, add:

```ts
const searchParams = useSearchParams();
useEffect(() => {
  if (searchParams.get('filter') === 'low') {
    setWalletDayFilter('low');
  }
}, [searchParams]);
```

Also add `useEffect` to the React import at the top of the file if it isn't already imported.

- [ ] **Step 4: Extend `filteredWallets` useMemo to handle `low` + archived filter**

Find the `filteredWallets` useMemo (~line 447). The existing logic currently handles `'adhoc'`, `'negative'`, and day filters. Need to:
- Default-hide archived wallets unless `showArchived` is true
- Add a new branch for `'low'` that uses the `isLowBalance` helper

Replace the body of `filteredWallets` useMemo with:

```ts
const todayStr = useMemo(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}, []);

const filteredWallets = useMemo(() => {
  let result = wallets;

  // Hide archived wallets by default
  if (!showArchived) {
    result = result.filter((w) => !(w.archived ?? false));
  }

  if (walletDayFilter === 'adhoc') {
    result = result.filter((w) => !activeWalletIds.has(w.id));
  } else if (walletDayFilter === 'negative') {
    result = result.filter((w) => w.balance < 0);
  } else if (walletDayFilter === 'low') {
    result = result.filter((w) => isLowBalance(w, bookings, todayStr));
  } else if (walletDayFilter !== 'all') {
    const dayWallets = walletDayMap.get(walletDayFilter);
    result = dayWallets ? result.filter((w) => dayWallets.has(w.id)) : [];
  }

  const q = walletSearch.trim().toLowerCase();
  if (q) {
    result = result.filter((w) =>
      w.name.toLowerCase().includes(q) ||
      w.studentIds.some((id) => studentNameById.get(id)?.toLowerCase().includes(q))
    );
  }
  return result;
}, [wallets, walletDayFilter, walletDayMap, activeWalletIds, walletSearch, studentNameById, showArchived, bookings, todayStr]);
```

Note the new deps: `showArchived`, `bookings`, `todayStr`.

- [ ] **Step 5: Update the auto-reset effect**

Find the `useEffect` that resets `walletDayFilter` when the selected day isn't in `activeDays` (~line 470). Add `'low'` to the exclusions so auto-reset doesn't wipe out the low filter:

```ts
useEffect(() => {
  if (
    walletDayFilter !== 'all' &&
    walletDayFilter !== 'adhoc' &&
    walletDayFilter !== 'negative' &&
    walletDayFilter !== 'low' &&
    !activeDays.includes(walletDayFilter)
  ) {
    setWalletDayFilter('all');
  }
}, [activeDays, walletDayFilter]);
```

- [ ] **Step 6: Add `Running low` chip + `Show archived` toggle**

Find the chip row (~line 852-898). Right after the existing `Negative` chip button, add the new `Running low` chip:

```tsx
{(() => {
  const lowCount = wallets.filter((w) =>
    !(w.archived ?? false) && isLowBalance(w, bookings, todayStr)
  ).length;
  return (
    <button
      onClick={() => setWalletDayFilter('low')}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        walletDayFilter === 'low'
          ? 'bg-red-600 text-white'
          : 'bg-gray-100 dark:bg-[#1f1f1f] text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
      }`}
    >
      Running low{lowCount > 0 ? ` (${lowCount})` : ''}
    </button>
  );
})()}
```

Then directly below the chip row's closing `</div>`, add the `Show archived` toggle:

```tsx
<label className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
  <input
    type="checkbox"
    checked={showArchived}
    onChange={(e) => setShowArchived(e.target.checked)}
    className="rounded"
  />
  Show archived
</label>
```

- [ ] **Step 7: Update empty-state copy**

Find the empty-state block (~line 906-915). Add a case for `'low'`:

```tsx
{walletDayFilter === 'adhoc'
  ? 'All wallets have recurring bookings.'
  : walletDayFilter === 'negative'
  ? 'No wallets in the negative.'
  : walletDayFilter === 'low'
  ? 'No wallets need topping up.'
  : walletDayFilter !== 'all'
  ? `No wallets on ${walletDayFilter.charAt(0).toUpperCase() + walletDayFilter.slice(1)}.`
  : 'No wallets match your search.'}
```

- [ ] **Step 8: Add badges to the wallet card**

Find the wallet card render (~line 921 onwards, the `<button>` with `onClick={() => setSelectedWallet(wallet)}`). Inside, find the "Name + student count" row (~line 928). Next to the wallet name, add badges inline. Specifically, inside that same `flex items-center justify-between mb-3` div, replace the first child span (the wallet name) with:

```tsx
<div className="flex items-center gap-2 min-w-0 flex-1">
  <span className="font-medium text-gray-900 dark:text-zinc-100 truncate">
    {wallet.name}
  </span>
  {isLowBalance(wallet, bookings, todayStr) && (
    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
      Running low
    </span>
  )}
  {(wallet.payPerLesson ?? false) && (
    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400 font-medium">
      Pay per lesson
    </span>
  )}
  {(wallet.archived ?? false) && (
    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-500 font-medium">
      Archived
    </span>
  )}
</div>
```

(The existing layout has the wallet name on the left and student count on the right; we're only modifying the left side.)

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 10: Manual smoke test**

Run: `npm run dev`. Seed data via Firestore console if needed:
1. One wallet with balance < next-lesson-cost (e.g., balance 20, booking with price 60) → `Running low` chip count shows 1, badge appears on card
2. Click `Running low` chip → only that wallet shows
3. Mark a wallet `payPerLesson: true` → `Pay per lesson` badge appears, no `Running low` badge even if balance is low
4. Archive a wallet → disappears from list. Check `Show archived` → reappears with `Archived` badge.
5. Navigate to `/dashboard/payments?filter=low` directly → page loads with `Running low` filter pre-applied

- [ ] **Step 11: Commit**

```bash
git add src/app/dashboard/payments/page.tsx
git commit -m "Payments: Running low filter + badges + Show archived + ?filter=low deep link"
```

---

## Task 5: Top-up modal — math preview + fill button

Enhances the existing top-up modal with a preview block (next-lesson cost, package size, current balance, cash owed, wallet-after) and a `Fill to N lessons` button. Pay-per-lesson wallets keep the simple view.

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx` (top-up modal, ~lines 1066-1120)

- [ ] **Step 1: Import `getNextLessonCost` and `getTopUpMinimum`**

At the top of `src/app/dashboard/payments/page.tsx`, extend the import:

```ts
import { isLowBalance, getNextLessonCost, getTopUpMinimum } from '@/lib/wallet-alerts';
```

- [ ] **Step 2: Insert preview block inside the top-up modal**

Find the top-up modal content (~line 1074, the `<div className="space-y-4">` inside the `<Modal ...>` block). Before the existing amount `<div>`, insert the preview block (gated on not-pay-per-lesson):

```tsx
{selectedWallet && !(selectedWallet.payPerLesson ?? false) && (() => {
  const rate = getNextLessonCost(selectedWallet, bookings);
  const packageSize = selectedWallet.minLessonsPerTopUp ?? 5;
  const minimum = getTopUpMinimum(selectedWallet, bookings);
  const walletAfter = selectedWallet.balance + minimum;
  if (rate === 0) return null;
  return (
    <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-lg p-3 text-sm space-y-1">
      <div className="flex justify-between">
        <span className="text-gray-600 dark:text-zinc-400">Next lesson:</span>
        <span className="text-gray-900 dark:text-zinc-100">RM {rate.toFixed(0)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600 dark:text-zinc-400">Package size:</span>
        <span className="text-gray-900 dark:text-zinc-100">{packageSize} lessons</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600 dark:text-zinc-400">Current balance:</span>
        <span className="text-gray-900 dark:text-zinc-100">
          {selectedWallet.balance < 0 ? '-' : ''}RM {Math.abs(selectedWallet.balance).toFixed(0)}
        </span>
      </div>
      <div className="border-t border-gray-200 dark:border-[#333333] my-1" />
      <div className="flex justify-between font-medium">
        <span className="text-gray-700 dark:text-zinc-300">Cash to hit {packageSize} lessons:</span>
        <span className="text-gray-900 dark:text-zinc-100">RM {minimum.toFixed(0)}</span>
      </div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-zinc-400">
        <span>Wallet after:</span>
        <span>RM {walletAfter.toFixed(0)}</span>
      </div>
      <button
        type="button"
        onClick={() => setTopUpAmount(String(minimum))}
        className="mt-2 w-full text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        Fill to {packageSize} lessons (RM {minimum.toFixed(0)})
      </button>
    </div>
  );
})()}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. On Payments page:
1. Open top-up on a low-balance wallet (balance 20, rate 60, package 5) → preview shows: Next lesson RM 60, Package size 5, Current balance RM 20, Cash to hit 5 lessons RM 280, Wallet after RM 300
2. Click `Fill to 5 lessons (RM 280)` → amount field shows `280`
3. Confirm → balance becomes 300, preview updates after re-opening
4. Open top-up on a pay-per-lesson wallet → no preview, no fill button (simple UI only)
5. Open top-up on an orphan wallet (no bookings) → no preview (rate is 0)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/payments/page.tsx
git commit -m "Top-up modal: rate/balance/cash preview + Fill to N lessons button"
```

---

## Task 6: Dashboard alert card

Adds a red-accented alert card at the top of the Today's Classes page (`/dashboard`), shown only when at least one wallet is low. Lists up to 3 wallet names, collapses the rest into `+N more`, deep-links to `/dashboard/payments?filter=low`.

**Files:**
- Modify: `src/app/dashboard/page.tsx` (top of render, ~line 908-910)

- [ ] **Step 1: Import helpers and `Link`**

At the top of `src/app/dashboard/page.tsx`, add:

```ts
import Link from 'next/link';
import { isLowBalance } from '@/lib/wallet-alerts';
```

- [ ] **Step 2: Compute low wallets**

Inside the `DashboardPage` component, before the `return (` statement (~line 908), add:

```ts
const lowWallets = useMemo(() => {
  const today = getDateString(new Date());
  return wallets.filter((w) => isLowBalance(w, bookings, today));
}, [wallets, bookings]);
```

- [ ] **Step 3: Render the alert card above Week navigation**

Immediately after `<div className="space-y-6">` (~line 909), before the `{/* Week navigation */}` comment, insert:

```tsx
{lowWallets.length > 0 && (
  <Link
    href="/dashboard/payments?filter=low"
    className="flex items-center justify-between gap-3 border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 rounded-r-lg px-4 py-3 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
  >
    <div className="min-w-0">
      <p className="font-medium text-red-800 dark:text-red-300">
        ⚠ {lowWallets.length} {lowWallets.length === 1 ? 'wallet needs' : 'wallets need'} top-up
      </p>
      <p className="text-sm text-red-700 dark:text-red-400 truncate">
        {lowWallets.slice(0, 3).map((w) => {
          const sign = w.balance < 0 ? '-' : '';
          return `${w.name} (${sign}RM ${Math.abs(w.balance).toFixed(0)})`;
        }).join(' · ')}
        {lowWallets.length > 3 ? ` · +${lowWallets.length - 3} more` : ''}
      </p>
    </div>
    <span className="shrink-0 text-sm text-red-700 dark:text-red-400 font-medium">View →</span>
  </Link>
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`. On `/dashboard`:
1. With zero low wallets → no alert card shown
2. With 1 low wallet → card shows `⚠ 1 wallet needs top-up` + wallet name + balance
3. With 5 low wallets → card shows `⚠ 5 wallets need top-up`, lists first 3 inline, `+2 more`
4. Click the card → navigates to `/dashboard/payments?filter=low` with the filter pre-applied
5. Archive one of the low wallets → card updates (count decrements by 1)
6. Toggle a low wallet to pay-per-lesson → card updates (that wallet removed)

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Dashboard: alert card for wallets that can't cover next lesson"
```

---

## Final verification

- [ ] **Full build passes**

```bash
npm run build
```

Expected: Next.js build succeeds with no errors or warnings from the changed files.

- [ ] **All unit tests pass**

```bash
npx vitest run
```

Expected: All existing tests (including `cancel-scope.test.ts`) plus 24 new `wallet-alerts.test.ts` tests pass.

- [ ] **End-to-end smoke on live preview**

Push branch, open preview URL, run through the manual smoke tests from Tasks 3-6 one more time to confirm nothing regresses in the deployed environment.

---

## Notes for the engineer

- **No migration needed.** All three new `Wallet` fields are optional with defaults applied on read (`?? false`, `?? 5`). Existing wallets in Firestore just work.
- **No security rule changes.** New fields live under the same `coaches/{coachId}/wallets/{id}` doc. Existing rules cover them.
- **`useSearchParams` requires Suspense boundary in Next.js 16.** The payments page is already a client component inside the dashboard layout; test that the `?filter=low` deep link still works. If Next complains about Suspense, wrap the reads in a child component — but it should just work since we're already in a `'use client'` boundary.
- **Don't restructure the payments page.** It's 1267 lines and unwieldy, but this plan sticks to additive edits only. Leave refactoring for a separate plan.
- **Pay-per-lesson wallets always balance to 0 or negative in the coach's workflow.** Don't hide them from the list — just hide them from alerts.

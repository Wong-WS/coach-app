# Portal Lesson Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the wallet portal's lesson history as payment-batch "sets" — a numbered checklist sized to each top-up, with settled sets tucked behind a one-at-a-time reveal — so parents can cross-check dates against their calendar like the coach's WhatsApp list.

**Architecture:** A pure `computeLessonSets(transactions, rate)` module replays a wallet's transaction history into sets using one rule: a top-up starts a new set only when the balance just before it is below one lesson's cost. `portal-data.ts` fetches all transactions server-side and runs this module; a new client component `LessonSets.tsx` renders the current set as a checklist and reveals earlier sets one tap at a time. The old per-type paginated lists and their API route are retired.

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript 5, Firebase Admin SDK 13 (server-only fetch), Tailwind CSS 4, Vitest 4 (unit tests for the pure module).

## Global Constraints

- **Money + dates use `.mono` / `.tnum` classes** so numeric columns align (CLAUDE.md).
- **Use design tokens, never hex**: `var(--ink)`, `var(--ink-2)`, `var(--ink-3)`, `var(--ink-4)`, `var(--line)`, `var(--panel)`, `var(--good)`, `var(--bad)` (CLAUDE.md; dark mode swaps values).
- **Card list rows must be uniform height** — single-line content only (CLAUDE.md).
- **No `window.confirm` / `window.alert`** (CLAUDE.md) — not needed here, read-only UI.
- **Currency format**: whole ringgit, `RM ` prefix, `−` (U+2212) for negatives, matching existing portal code (`RM ${n.toFixed(0)}`).
- **Commit + push after each completed task** (CLAUDE.md). Verify `git branch --show-current` is `main` before each commit.
- **Test command**: `npx vitest run` (tests live in `src/lib/__tests__/`).
- **Build/lint**: `npm run build`, `npm run lint`.

---

### Task 1: Pure `computeLessonSets` module

The heart of the feature: a deterministic, side-effect-free replay of a wallet's transactions into sets. Fully unit-tested.

**Files:**
- Create: `src/lib/portal-sets.ts`
- Test: `src/lib/__tests__/portal-sets.test.ts`

**Interfaces:**
- Consumes: `WalletTransactionType` from `@/types`.
- Produces (later tasks rely on these exact names/types):
  - `SetInputTxn = { type: WalletTransactionType; amount: number; balanceAfter: number; date: string; createdAt: number }`
  - `PortalLesson = { n: number; date: string; price: number }`
  - `PortalReconciliation = { kind: 'credit' | 'owed' | 'none'; amount: number }`
  - `PortalSet = { topUp: { date: string; amount: number } | null; slots: number; done: number; left: number; lessons: PortalLesson[]; reconciliation: PortalReconciliation }`
  - `PortalLessonSets = { mode: 'sets' | 'flat'; current: PortalSet | null; earlier: PortalSet[]; flat: { date: string; price: number; balanceAfter: number }[] }`
  - `computeLessonSets(input: SetInputTxn[], rate: number, forceFlat?: boolean): PortalLessonSets`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/portal-sets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeLessonSets, type SetInputTxn } from '@/lib/portal-sets';
import type { WalletTransactionType } from '@/types';

let seq = 0;
function txn(
  type: WalletTransactionType,
  amount: number,
  balanceAfter: number,
  date: string,
): SetInputTxn {
  seq += 1;
  return { type, amount, balanceAfter, date, createdAt: seq };
}

describe('computeLessonSets', () => {
  it('returns an empty sets result for no transactions', () => {
    const r = computeLessonSets([], 80);
    expect(r.mode).toBe('sets');
    expect(r.current).toBeNull();
    expect(r.earlier).toEqual([]);
  });

  it('sizes the current set from the top-up and numbers lessons oldest-first', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 80, 720, '2026-07-09'),
        txn('charge', 80, 640, '2026-07-11'),
        txn('charge', 80, 560, '2026-07-16'),
      ],
      80,
    );
    expect(r.current).not.toBeNull();
    expect(r.current!.topUp).toEqual({ date: '2026-07-06', amount: 800 });
    expect(r.current!.slots).toBe(10);
    expect(r.current!.done).toBe(3);
    expect(r.current!.left).toBe(7);
    expect(r.current!.lessons).toEqual([
      { n: 1, date: '2026-07-09', price: 80 },
      { n: 2, date: '2026-07-11', price: 80 },
      { n: 3, date: '2026-07-16', price: 80 },
    ]);
    expect(r.current!.reconciliation).toEqual({ kind: 'none', amount: 0 });
  });

  it('flags a pricier lesson as owed without changing the count', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 80, 720, '2026-07-09'),
        txn('charge', 100, 620, '2026-07-11'),
        txn('charge', 80, 540, '2026-07-16'),
      ],
      80,
    );
    expect(r.current!.done).toBe(3);
    expect(r.current!.left).toBe(7);
    expect(r.current!.lessons[1]).toEqual({ n: 2, date: '2026-07-11', price: 100 });
    expect(r.current!.reconciliation).toEqual({ kind: 'owed', amount: 20 });
  });

  it('flags a cheaper lesson as credit', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 60, 740, '2026-07-09'),
      ],
      80,
    );
    expect(r.current!.done).toBe(1);
    expect(r.current!.left).toBe(9);
    expect(r.current!.reconciliation).toEqual({ kind: 'credit', amount: 20 });
  });

  it('starts a new set when a top-up refills a drained wallet', () => {
    seq = 0;
    const txns: SetInputTxn[] = [txn('top-up', 800, 800, '2026-01-01')];
    let bal = 800;
    for (let i = 0; i < 10; i++) {
      bal -= 80;
      txns.push(txn('charge', 80, bal, `2026-02-0${(i % 9) + 1}`));
    }
    txns.push(txn('top-up', 800, 800, '2026-06-06'));
    const r = computeLessonSets(txns, 80);
    expect(r.earlier).toHaveLength(1);
    expect(r.earlier[0].done).toBe(10);
    expect(r.earlier[0].left).toBe(0);
    expect(r.earlier[0].reconciliation.kind).toBe('none');
    expect(r.current!.topUp).toEqual({ date: '2026-06-06', amount: 800 });
    expect(r.current!.done).toBe(0);
    expect(r.current!.left).toBe(10);
  });

  it('extends the set (no reset) when paying in advance while a lesson remains', () => {
    seq = 0;
    const txns: SetInputTxn[] = [txn('top-up', 800, 800, '2026-06-06')];
    let bal = 800;
    for (let i = 0; i < 9; i++) {
      bal -= 80;
      txns.push(txn('charge', 80, bal, `2026-06-1${i}`));
    }
    // balance is now 80 (>= rate) → advance top-up absorbs into the same set
    txns.push(txn('top-up', 800, 880, '2026-06-30'));
    const r = computeLessonSets(txns, 80);
    expect(r.earlier).toHaveLength(0);
    expect(r.current!.topUp).toEqual({ date: '2026-06-06', amount: 1600 });
    expect(r.current!.done).toBe(9);
    expect(r.current!.slots).toBe(20);
    expect(r.current!.left).toBe(11);
    expect(r.current!.reconciliation).toEqual({ kind: 'none', amount: 0 });
  });

  it('ignores refunds and adjustments for set structure but reflects them in balance', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 80, 720, '2026-07-09'),
        txn('adjustment', 20, 740, '2026-07-10'),
      ],
      80,
    );
    expect(r.current!.done).toBe(1);
    expect(r.current!.left).toBe(9);
    // endingBalance 740, left*rate 720 → +20 credit
    expect(r.current!.reconciliation).toEqual({ kind: 'credit', amount: 20 });
  });

  it('falls back to a flat newest-first list when forceFlat is set', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 80, 720, '2026-07-09'),
        txn('charge', 80, 640, '2026-07-11'),
      ],
      80,
      true,
    );
    expect(r.mode).toBe('flat');
    expect(r.current).toBeNull();
    expect(r.flat).toEqual([
      { date: '2026-07-11', price: 80, balanceAfter: 640 },
      { date: '2026-07-09', price: 80, balanceAfter: 720 },
    ]);
  });

  it('falls back to flat when rate is unknown', () => {
    seq = 0;
    const r = computeLessonSets([txn('charge', 80, -80, '2026-07-09')], 0);
    expect(r.mode).toBe('flat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/portal-sets.test.ts`
Expected: FAIL — cannot find module `@/lib/portal-sets`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/portal-sets.ts`:

```ts
import type { WalletTransactionType } from '@/types';

/** One wallet transaction, reduced to what set computation needs. */
export interface SetInputTxn {
  type: WalletTransactionType;
  amount: number;        // as stored (top-up positive; charge magnitude used via abs)
  balanceAfter: number;  // running balance immediately after this txn, as stored
  date: string;          // YYYY-MM-DD (lesson/top-up date)
  createdAt: number;     // ms since epoch, for chronological ordering
}

/** A completed lesson slot, numbered oldest-first within its set. */
export interface PortalLesson {
  n: number;
  date: string;
  price: number;         // whole RM, positive
}

/** Leftover credit or shortfall at the bottom of a set. */
export interface PortalReconciliation {
  kind: 'credit' | 'owed' | 'none';
  amount: number;        // whole RM, >= 0 (0 when kind === 'none')
}

/** One payment batch: a top-up's worth of lesson slots. */
export interface PortalSet {
  topUp: { date: string; amount: number } | null;  // null = legacy set with no top-up
  slots: number;
  done: number;
  left: number;
  lessons: PortalLesson[];   // oldest-first
  reconciliation: PortalReconciliation;
}

/** Result of replaying a wallet's history. `flat` is populated only in flat mode. */
export interface PortalLessonSets {
  mode: 'sets' | 'flat';
  current: PortalSet | null;
  earlier: PortalSet[];      // most-recent-first
  flat: { date: string; price: number; balanceAfter: number }[];  // newest-first
}

interface WorkingSet {
  topUpDate: string | null;
  topUpSum: number;
  openingBalance: number;    // balance just before this set started
  lessons: { date: string; price: number }[];
  endingBalance: number;     // running balance at the set's close
}

function finalizeSet(ws: WorkingSet, rate: number): PortalSet {
  const done = ws.lessons.length;
  const topUp =
    ws.topUpDate != null ? { date: ws.topUpDate, amount: ws.topUpSum } : null;

  // Legacy set (charges with no top-up): no blank slots.
  const slots =
    topUp == null && ws.topUpSum === 0
      ? done
      : Math.max(Math.round((ws.openingBalance + ws.topUpSum) / rate), done);

  const left = slots - done;
  const raw = Math.round(ws.endingBalance - left * rate);
  const reconciliation: PortalReconciliation =
    raw > 0
      ? { kind: 'credit', amount: raw }
      : raw < 0
        ? { kind: 'owed', amount: -raw }
        : { kind: 'none', amount: 0 };

  return {
    topUp,
    slots,
    done,
    left,
    lessons: ws.lessons.map((l, i) => ({ n: i + 1, date: l.date, price: l.price })),
    reconciliation,
  };
}

/**
 * Replay a wallet's transactions into payment-batch "sets".
 *
 * Rule: a top-up starts a NEW set only when the balance immediately before it is
 * below one lesson's cost (`rate`). Otherwise it is absorbed into the current set
 * (advance payment / installment). Charges append dated, priced lessons; refunds
 * and adjustments move the balance only.
 *
 * `forceFlat` (multi-student / tab-mode wallets) or a non-positive `rate` returns
 * a flat newest-first lesson list instead of sets.
 */
export function computeLessonSets(
  input: SetInputTxn[],
  rate: number,
  forceFlat = false,
): PortalLessonSets {
  const txns = [...input].sort((a, b) => a.createdAt - b.createdAt);

  if (forceFlat || rate <= 0) {
    const flat = txns
      .filter((t) => t.type === 'charge')
      .map((t) => ({
        date: t.date,
        price: Math.abs(t.amount),
        balanceAfter: t.balanceAfter,
      }))
      .reverse(); // newest-first
    return { mode: 'flat', current: null, earlier: [], flat };
  }

  const sets: WorkingSet[] = [];
  let current: WorkingSet | null = null;

  for (const t of txns) {
    if (t.type === 'top-up') {
      const preBalance = t.balanceAfter - t.amount;
      if (current == null || preBalance < rate) {
        if (current != null) {
          current.endingBalance = preBalance;
          sets.push(current);
        }
        current = {
          topUpDate: t.date,
          topUpSum: t.amount,
          openingBalance: preBalance,
          lessons: [],
          endingBalance: t.balanceAfter,
        };
      } else {
        // absorbed: advance payment or installment for the same batch
        current.topUpSum += t.amount;
        if (current.topUpDate == null) current.topUpDate = t.date;
        current.endingBalance = t.balanceAfter;
      }
    } else if (t.type === 'charge') {
      if (current == null) {
        // legacy: charges before any tracked top-up
        current = {
          topUpDate: null,
          topUpSum: 0,
          openingBalance: t.balanceAfter + Math.abs(t.amount),
          lessons: [],
          endingBalance: t.balanceAfter,
        };
      }
      current.lessons.push({ date: t.date, price: Math.abs(t.amount) });
      current.endingBalance = t.balanceAfter;
    } else {
      // refund / adjustment: balance only
      if (current != null) current.endingBalance = t.balanceAfter;
    }
  }

  if (current != null) sets.push(current);

  const finalized = sets.map((s) => finalizeSet(s, rate));
  const currentSet = finalized.length > 0 ? finalized[finalized.length - 1] : null;
  const earlier = finalized.slice(0, -1).reverse();

  return { mode: 'sets', current: currentSet, earlier, flat: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/portal-sets.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # confirm: main
git add src/lib/portal-sets.ts src/lib/__tests__/portal-sets.test.ts
git commit -m "feat: computeLessonSets — replay wallet txns into payment-batch sets"
git push
```

---

### Task 2: Wire sets into portal-data

Fetch all wallet transactions server-side, run `computeLessonSets`, and add a `sets` field to the portal payload. Existing `charges` / `topUps` fields stay for now so the build and page keep working until Task 3 swaps the UI.

**Files:**
- Modify: `src/lib/portal-data.ts`

**Interfaces:**
- Consumes: `computeLessonSets`, `SetInputTxn`, `PortalLessonSets` from Task 1; existing `resolvePortalToken`, `getWalletHealth`.
- Produces: `PortalPayload.sets: PortalLessonSets` (Task 3 consumes this).

- [ ] **Step 1: Add imports**

At the top of `src/lib/portal-data.ts`, alongside the existing imports, add:

```ts
import { computeLessonSets, type SetInputTxn, type PortalLessonSets } from '@/lib/portal-sets';
import type { WalletTransactionType } from '@/types';
```

- [ ] **Step 2: Add `sets` to the `PortalPayload` type**

In the `PortalPayload` type (currently ending with `charges` and `topUps`), add a `sets` field:

```ts
export type PortalPayload = {
  coach: { displayName: string };
  wallet: {
    name: string;
    balance: number;
    status: WalletHealth;
    rate: number;
    hideStudentNames: boolean;
  };
  suggestion: { usual: number; amount: number } | null;
  sets: PortalLessonSets;
  charges: { items: PortalChargeRow[]; hasMore: boolean };
  topUps: { items: PortalTopUpRow[]; hasMore: boolean };
};
```

- [ ] **Step 3: Add an all-transactions fetch helper**

Add this function to `src/lib/portal-data.ts` (near `fetchChargesPage`):

```ts
/**
 * Fetch every transaction for the wallet, oldest-first, reduced to the fields
 * `computeLessonSets` needs. Solo-coach wallets have small histories, so a single
 * ordered read is fine.
 */
async function fetchAllTransactions(ctx: PortalTokenResolution): Promise<SetInputTxn[]> {
  const { db, coachId, walletId } = ctx;
  const snap = await db
    .collection(`coaches/${coachId}/wallets/${walletId}/transactions`)
    .orderBy('createdAt', 'asc')
    .get();
  return snap.docs.map((d) => {
    const t = d.data();
    return {
      type: (t.type as WalletTransactionType) ?? 'charge',
      amount: (t.amount as number) ?? 0,
      balanceAfter: (t.balanceAfter as number) ?? 0,
      date: (t.date as string) ?? '',
      createdAt: (t.createdAt as Timestamp | undefined)?.toMillis?.() ?? 0,
    };
  });
}
```

- [ ] **Step 4: Fetch transactions and compute sets in `fetchPortalData`**

In `fetchPortalData`, add `fetchAllTransactions(ctx)` to the existing `Promise.all` and capture it. Change the array + destructure:

```ts
  const [coachSnap, walletSnap, bookingsSnap, exceptionsSnap, awayPeriodsSnap, todayLogsSnap, charges, topUps, allTxns] =
    await Promise.all([
      db.doc(`coaches/${coachId}`).get(),
      db.doc(`coaches/${coachId}/wallets/${walletId}`).get(),
      db
        .collection(`coaches/${coachId}/bookings`)
        .where('status', '==', 'confirmed')
        .get(),
      db
        .collection(`coaches/${coachId}/classExceptions`)
        .where('originalDate', '>=', fourMonthsAgo)
        .where('originalDate', '<=', fourMonthsAhead)
        .get(),
      db
        .collection(`coaches/${coachId}/awayPeriods`)
        .where('startDate', '<=', fourMonthsAhead)
        .get(),
      db.collection(`coaches/${coachId}/lessonLogs`).where('date', '==', today).get(),
      fetchChargesPage(ctx, null),
      fetchTopUpsPage(ctx, null),
      fetchAllTransactions(ctx),
    ]);
```

Then, after the existing `getWalletHealth(...)` call (which yields `health` and `rate`) and before the `return`, compute the sets. `hideStudentNames` is already destructured from `ctx`:

```ts
  const forceFlat = wallet.tabMode === true || !hideStudentNames;
  const sets = computeLessonSets(allTxns, rate, forceFlat);
```

Add `sets` to the returned object:

```ts
  return {
    coach: { displayName },
    wallet: {
      name: wallet.name,
      balance: wallet.balance,
      status: health,
      rate,
      hideStudentNames,
    },
    suggestion,
    sets,
    charges,
    topUps,
  };
```

- [ ] **Step 5: Verify typecheck, tests, and build pass**

Run: `npx vitest run && npm run build`
Expected: Vitest PASS (Task 1 tests still green); build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # confirm: main
git add src/lib/portal-data.ts
git commit -m "feat: compute lesson sets in portal-data payload"
git push
```

---

### Task 3: Render sets on the portal + retire the old lists

Add the `LessonSets` client component (current set checklist + one-at-a-time earlier reveal + flat fallback), swap it into the portal page, and delete the now-dead `ChargesList`, `TopUpsList`, the pagination API route, and the unused `portal-data` exports.

**Files:**
- Create: `src/app/portal/[token]/LessonSets.tsx`
- Modify: `src/app/portal/[token]/page.tsx`
- Delete: `src/app/portal/[token]/ChargesList.tsx`
- Delete: `src/app/portal/[token]/TopUpsList.tsx`
- Delete: `src/app/api/portal/[token]/transactions/route.ts`
- Modify: `src/lib/portal-data.ts` (remove now-unused exports)

**Interfaces:**
- Consumes: `PortalLessonSets`, `PortalSet` from Task 1; `PortalPayload.sets` from Task 2; `formatDateShort`, `parseDateString` from `@/lib/date-format`.
- Produces: `LessonSets` default export (a client component taking `{ sets: PortalLessonSets }`).

- [ ] **Step 1: Create the `LessonSets` component**

Create `src/app/portal/[token]/LessonSets.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { PortalLessonSets, PortalSet } from '@/lib/portal-sets';
import { formatDateShort, parseDateString } from '@/lib/date-format';

function reconNote(set: PortalSet, current: boolean): { text: string; color: string } | null {
  const r = set.reconciliation;
  if (r.kind === 'none') return null;
  if (r.kind === 'credit') {
    return {
      // Earlier sets already carried their leftover forward → short form.
      text: current ? `RM ${r.amount} credit — carries to your next top-up` : `RM ${r.amount} credit`,
      color: 'var(--good)',
    };
  }
  return {
    text: current ? `RM ${r.amount} owed — added to your next payment` : `RM ${r.amount} owed`,
    color: 'var(--bad)',
  };
}

function SetCard({ set, current }: { set: PortalSet; current: boolean }) {
  const rows = [];
  for (let i = 0; i < set.slots; i++) {
    const lesson = set.lessons[i]; // oldest-first; lesson.n === i + 1
    rows.push(
      <div
        key={i}
        className="flex items-center gap-2.5 px-3 py-2.5"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="mono text-[12px] w-5 text-right shrink-0" style={{ color: 'var(--ink-3)' }}>
          {i + 1}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {lesson ? (
            <>
              <span className="text-[12px]" style={{ color: 'var(--good)' }}>
                ✓
              </span>
              <span className="mono text-[12.5px] truncate" style={{ color: 'var(--ink)' }}>
                {formatDateShort(parseDateString(lesson.date))}
              </span>
            </>
          ) : (
            <span className="mono text-[12.5px]" style={{ color: 'var(--ink-4)' }}>
              —
            </span>
          )}
        </div>
        <div className="mono tnum text-[12.5px] shrink-0" style={{ color: 'var(--ink-2)' }}>
          {lesson ? `RM ${lesson.price.toFixed(0)}` : ''}
        </div>
      </div>,
    );
  }

  const header = set.topUp
    ? `RM ${set.topUp.amount.toFixed(0)} · ${formatDateShort(parseDateString(set.topUp.date))}`
    : 'Lessons';
  const note = reconNote(set, current);

  return (
    <div
      className="rounded-[12px] border overflow-hidden"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <span
          className="text-[10.5px] font-semibold uppercase"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          {current ? 'Current set' : 'Earlier set'}
        </span>
        <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {header}
        </span>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
        {rows}
      </div>

      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
          {set.done} done · {set.left} left
        </span>
        {note && (
          <span className="text-[11px] font-medium text-right" style={{ color: note.color }}>
            {note.text}
          </span>
        )}
      </div>
    </div>
  );
}

function FlatList({ flat }: { flat: PortalLessonSets['flat'] }) {
  return (
    <div
      className="rounded-[12px] border divide-y"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      {flat.length === 0 ? (
        <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          No lessons yet.
        </div>
      ) : (
        flat.map((c, i) => (
          <div
            key={`${c.date}-${i}`}
            className="flex items-center gap-2.5 px-3 py-2.5"
            style={{ borderColor: 'var(--line)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
                Lesson
              </div>
              <div className="text-[11px] mono" style={{ color: 'var(--ink-3)' }}>
                {formatDateShort(parseDateString(c.date))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="mono tnum text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
                −RM {c.price.toFixed(0)}
              </div>
              <div className="mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                bal {c.balanceAfter < 0 ? '−' : ''}RM {Math.abs(c.balanceAfter).toFixed(0)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function LessonSets({ sets }: { sets: PortalLessonSets }) {
  const [shown, setShown] = useState(0);

  if (sets.mode === 'flat') {
    return <FlatList flat={sets.flat} />;
  }

  if (!sets.current) {
    return (
      <div
        className="rounded-[12px] border px-3 py-4 text-[12.5px]"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink-3)' }}
      >
        No lessons yet.
      </div>
    );
  }

  const earlier = sets.earlier.slice(0, shown);
  const moreLeft = shown < sets.earlier.length;

  return (
    <div className="space-y-3">
      <SetCard set={sets.current} current />
      {earlier.map((s, i) => (
        <SetCard key={i} set={s} current={false} />
      ))}
      {moreLeft && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 1)}
          className="w-full text-[12px] py-2 rounded-[10px] border"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}
        >
          Show earlier lessons
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Swap the component into the portal page**

In `src/app/portal/[token]/page.tsx`:

Replace the two imports:

```tsx
import ChargesList from './ChargesList';
import TopUpsList from './TopUpsList';
```

with:

```tsx
import LessonSets from './LessonSets';
```

Change the destructure:

```tsx
  const { coach, wallet, suggestion, sets } = data;
```

Replace the entire "Recent lessons" `<section>` and "Top-up history" `<section>` blocks (from `{/* Recent lessons */}` through the end of the Top-up `</section>`) with a single section:

```tsx
      {/* Lessons — current set + earlier */}
      <section>
        <div
          className="text-[10.5px] font-semibold uppercase mb-2"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Lessons
        </div>
        <LessonSets sets={sets} />
      </section>
```

- [ ] **Step 3: Delete the retired files**

```bash
git rm src/app/portal/[token]/ChargesList.tsx
git rm src/app/portal/[token]/TopUpsList.tsx
git rm src/app/api/portal/[token]/transactions/route.ts
```

- [ ] **Step 4: Remove the now-unused exports from `portal-data.ts`**

In `src/lib/portal-data.ts`, delete these (no longer referenced after the route + old components are gone):
- `export const PORTAL_PAGE_SIZE = 10;`
- `export type PortalChargeRow = { ... }`
- `export type PortalTopUpRow = { ... }`
- `export async function fetchChargesPage(...) { ... }`
- `export async function fetchTopUpsPage(...) { ... }`
- the `charges` and `topUps` fields from the `PortalPayload` type
- the `fetchChargesPage(ctx, null)` and `fetchTopUpsPage(ctx, null)` entries from the `Promise.all` (and `charges`, `topUps` from its destructure)
- the `charges` and `topUps` properties from the returned object in `fetchPortalData`

Keep `fetchAllTransactions`, `resolvePortalToken`, `fetchStudentNames` (verify `fetchStudentNames` is still referenced; if it is now unused after removing `fetchChargesPage`, remove it too).

- [ ] **Step 5: Verify build, lint, and tests pass**

Run: `npx vitest run && npm run lint && npm run build`
Expected: Vitest PASS; lint clean; build succeeds with no unused-import or type errors. If the build flags `fetchStudentNames` (or any other symbol) as unused, remove it and rebuild.

- [ ] **Step 6: Manual verification on the live portal**

The portal reads live Firestore data, so verify against the test account's shared wallet (e.g. "Doyoon's Mom"):
1. Open the wallet's portal link (Payments → share portal link) on `https://coach-app-ashen-delta.vercel.app` after deploy, or run `npm run dev` and open the local portal URL.
2. Confirm: current set shows numbered slots, done lessons dated with ✓ and price, blank `—` slots for the remainder, and `{done} done · {left} left` in the footer.
3. Confirm "Show earlier lessons" reveals one older set per tap and disappears after the oldest.
4. Confirm a wallet with a non-standard lesson price shows the credit/owed note; confirm a multi-student or tab-mode wallet falls back to the flat list without errors.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # confirm: main
git add -A
git commit -m "feat: render portal lessons as payment-batch sets; retire paginated lists"
git push
```

---

## Notes / Deferred

- The composite index `transactions (type ASC, createdAt DESC)` in `firestore.indexes.json` powered the old pagination route and is now unused. Leaving it is harmless; removing it is optional cleanup (`firebase deploy --only firestore:indexes` after editing). Not required for this feature.
- Earlier-set reveal loads all sets in the initial payload (computed server-side) and shows them one at a time client-side — no per-tap fetch, matching the spec.

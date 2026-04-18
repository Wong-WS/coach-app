# Low-Balance Alert + Top-Up Helper — Design

**Date:** 2026-04-18
**Status:** Approved (pending written-spec review)

## Problem

Today's wallet system silently lets balances run low. The coach has to manually eyeball every wallet before each class to know who needs a top-up, then WhatsApp those families. This is the last piece of manual tracking the wallet system was meant to replace.

Current pain points:
- No signal when a wallet can't cover the next lesson
- No guidance on "how much should I ask them to top up"
- Students who stopped lessons forever would still fire alerts if we naively show "low balance"
- Students on pay-per-lesson (wallet always hovers at 0/negative) would spam alerts if not excluded

## Goals

1. Surface exactly the wallets that need a top-up conversation — no more, no less.
2. Tell the coach the amount to request (minimum top-up = lesson rate × N, with rollover credit).
3. Silence the noise cleanly: pay-per-lesson students opt out, stopped students get archived.

## Non-Goals

- Automated WhatsApp send. Deep-linking `wa.me/{phone}?text=...` can come later.
- Auto-archiving wallets when a booking ends. Explicit user action for now.
- Email / push notifications. In-app signals only.
- Recurring-payment / subscription collection. Manual top-up only.

## Data Model

Three new optional fields on `Wallet` (all default on-read if missing, no migration needed):

```ts
interface Wallet {
  // existing fields
  id: string;
  name: string;
  balance: number;
  studentIds: string[];
  createdAt: Date;
  updatedAt: Date;

  // new fields
  payPerLesson?: boolean;       // default false. disables alerts + top-up minimums.
  archived?: boolean;           // default false. hides from default list, disables alerts.
  minLessonsPerTopUp?: number;  // default 5. how many lessons one top-up should cover.
}
```

Reads fall back to sensible defaults when the field is absent, so existing wallets "just work" without backfill.

No changes to `Coach`, `Booking`, `LessonLog`, `WalletTransaction`, or `ClassException`.

## Core Logic: `src/lib/wallet-alerts.ts`

Three pure functions, all fully unit-testable.

### `getNextLessonCost(wallet, bookings): number`

For a wallet `W`:

```
occurrenceCost(W, B) = sum of studentPrices[s]
                       for each student s where
                         s ∈ B.studentIds
                         AND B.studentWallets[s] === W.id

nextLessonCost(W)    = max of occurrenceCost(W, B)
                       across all active bookings B that reference W
```

**In plain English:** for each booking this wallet is tied to, add up only the prices of students who use *this specific wallet*. Take the biggest of those.

**Why "students who use this wallet":** In a group class with separate wallets, each wallet only pays its own share.

**Why "max across bookings":** Some wallets cover multiple bookings (e.g., Haewoo has Friday + Saturday). "Next lesson" means "worst single upcoming day" so we're always ready.

Returns `0` if no active bookings reference this wallet.

### `hasActiveBooking(wallet, bookings, today): boolean`

True when at least one booking references this wallet AND is not ended (no `endDate`, or `endDate >= today`).

### `isLowBalance(wallet, bookings, today): boolean`

The single rule the whole feature hangs on:

```
!wallet.payPerLesson
  && !wallet.archived
  && hasActiveBooking(wallet, bookings, today)
  && wallet.balance < getNextLessonCost(wallet, bookings)
```

If any clause is false → no alert, no noise.

### `getTopUpMinimum(wallet, bookings): number`

```
rate = getNextLessonCost(wallet, bookings)
packageSize = wallet.minLessonsPerTopUp ?? 5
minimum = rate × packageSize − wallet.balance
```

Rollover credit is built in: existing balance reduces the cash owed. Returns `0` for `payPerLesson` wallets (the helper is hidden for them anyway).

## UI: Payments Page

### Wallet card badges

Up to three inline badges on the right side of each card (stacked via `gap-2`, never cramped):

- **`Running low`** (red) when `isLowBalance`
- **`Pay per lesson`** (gray) when `payPerLesson`
- **`Archived`** (gray, muted) when `archived`

Badges never make the card taller than a single-line card — they sit inline.

### Filter chips

One new chip added to the existing chip row:

- **`Running low`** (red, with count) — filters to wallets where `isLowBalance`

Existing chips (`All`, `Mon`–`Sun`, `Ad-hoc`, `Negative`) unchanged.

### Archived wallets

Archived wallets are **hidden by default** from the list. A separate **`Show archived`** toggle at the top of the wallet list (not a chip) reveals them when on. Archived wallets still have their full detail panel; users can un-archive from there.

## UI: Wallet Detail Panel

New actions row above the top-up and history sections:

- **`Top up`** (existing, enhanced — see below)
- **`Pay per lesson`** checkbox (inline with label, matching the existing simple-input style used elsewhere in the app)
- **`Archive`** / **`Unarchive`** button (flips based on current state)

Below the actions row, a small editable row:

- **`Package size: [5] lessons`** — number input, defaults to 5, editable per wallet

## UI: Top-Up Modal (enhanced)

Current modal has just an amount input + confirm. Enhanced version adds a preview block above the amount field:

```
Next lesson:    RM 120  (Tawoo + Riwoo, RM60 each)
Package size:   5 lessons
Current balance: RM 20
────────────────────────
Cash owed to hit 5 lessons: RM 580
Wallet after top-up:         RM 600
```

Plus a **`Fill to 5 lessons`** button that auto-fills the amount field with `getTopUpMinimum(wallet, bookings)`. The button label reflects the wallet's actual package size ("Fill to 10 lessons" when `minLessonsPerTopUp === 10`).

The amount field remains free-entry — the button is a helper, not a lock.

**Pay-per-lesson wallets** see the current simple UI (amount + confirm only). No preview, no fill button.

## UI: Dashboard Alert Card

Renders at the top of `/dashboard` (Today's Classes page), **above** the date navigation. Only shown when at least one wallet returns `isLowBalance`.

```
⚠ 3 wallets need top-up
  Haewoo (RM -20) · Riwoo (RM 40) · +1 more     [View →]
```

- Shows up to 3 wallet names inline; rest collapses into `+N more`.
- `[View →]` link navigates to `/dashboard/payments?filter=low` (pre-applies the `Running low` filter).
- Red accent on the card's left border + warning icon, consistent with existing warning visual language.

## Edge Cases & Rules

1. **Multi-booking wallet with different rates** (theoretical — user's current setup doesn't have this, but data model supports it): `nextLessonCost` uses `max`. So min top-up = highest rate × package size. Conservative.

2. **Wallet covers multiple students in the same booking**: `occurrenceCost` sums only those students' prices. A wallet covering Tawoo + Riwoo in a 3-kid class pays for 2 kids, not 3.

3. **Booking reaches endDate**: `hasActiveBooking` goes false → wallet auto-exits the alert list. No user action needed. User can still explicitly archive to clean up.

4. **Wallet with no bookings at all** (orphaned): `getNextLessonCost` returns 0, `hasActiveBooking` returns false → never alerts. Won't surface in the "Running low" chip. User can archive to hide from default list.

5. **Group lesson, separate wallets, one is low**: Each wallet evaluates independently. Only the low wallet alerts. The other family hears nothing.

6. **Toggling `payPerLesson` on a wallet with positive balance**: Balance stays, history stays. Alerts silence. The "Pay per lesson" badge appears. Top-up modal reverts to simple mode.

7. **Archiving a wallet with positive balance**: Balance and history preserved. Wallet vanishes from default list + alerts. Still reachable via `Show archived`. Un-archive restores it.

## Testing

Unit tests for `wallet-alerts.ts` (colocated in `src/lib/__tests__/wallet-alerts.test.ts`):

- `getNextLessonCost`: single-student wallet, multi-student wallet (same booking), multi-booking wallet (max), orphaned wallet (0)
- `hasActiveBooking`: no bookings, ended booking only, active booking, mixed
- `isLowBalance`: each of the four clauses flipping in isolation
- `getTopUpMinimum`: rollover math, custom package size, pay-per-lesson returns 0

Manual smoke test after implementation:
1. Seed: 1 wallet each — running-low / healthy / pay-per-lesson / archived / orphaned
2. Verify dashboard alert card shows count=1 (only running-low)
3. Verify payments page filter works
4. Top up the low wallet using "Fill to 5 lessons" — balance lands exactly on expected figure
5. Toggle pay-per-lesson on the low wallet → disappears from alert card
6. Archive the healthy wallet → disappears from default list, reappears with Show archived

## Build Order (one branch, one plan)

1. Types + helper defaults (new fields optional-with-fallback on read)
2. `wallet-alerts.ts` + unit tests
3. Wallet detail panel actions (pay-per-lesson toggle, archive/unarchive, package size editor)
4. Payments page badges + `Running low` filter + `Show archived` toggle
5. Top-up modal preview + fill button
6. Dashboard alert card

Each step commits independently so it's easy to revert any single piece.

## Files Affected

**New:**
- `src/lib/wallet-alerts.ts`
- `src/lib/__tests__/wallet-alerts.test.ts`

**Modified:**
- `src/types/index.ts` — add 3 optional fields to `Wallet`
- `src/app/dashboard/payments/page.tsx` — badges, filter chip, Show archived, detail panel actions, enhanced top-up modal
- `src/app/dashboard/page.tsx` — dashboard alert card at top
- `src/hooks/useCoachData.ts` — nothing; hook already reads all wallet fields via spread

No Firestore security rule changes needed (new fields live under the same wallet doc).

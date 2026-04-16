# Wallet System Design

**Date:** 2026-04-16
**Status:** Approved
**Branch:** `redesign`
**Rollback:** `pre-redesign` tag (commit 46c1fe8)

## Problem

The current payment system uses scattered mutable counters on student docs (`prepaidTotal`, `prepaidUsed`, `credit`, `pendingPayment`, `monetaryBalance`, `nextPrepaidTotal`) that are updated incrementally on mark-as-done, payment recording, and lesson deletion. These counters can desync, and the system doesn't cleanly support family sharing (one payer funding multiple students).

## Solution

Replace the counter-based system with a **wallet + transaction ledger** model. A wallet is a standalone entity representing a payer's account. It holds a balance (can go negative) and a full transaction history. Students are linked to wallets, and bookings reference which wallet to charge.

## Data Model

### New: `coaches/{coachId}/wallets/{walletId}`

| Field | Type | Description |
|-------|------|-------------|
| name | string | Display name (e.g. "Mrs. Wong") |
| balance | number | Current RM balance (can be negative) |
| studentIds | string[] | Students linked to this wallet |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### New: `coaches/{coachId}/wallets/{walletId}/transactions/{txnId}`

| Field | Type | Description |
|-------|------|-------------|
| type | `'top-up'` \| `'charge'` \| `'refund'` \| `'adjustment'` | Transaction type |
| amount | number | Always positive |
| balanceAfter | number | Running balance after this transaction |
| description | string | Human-readable (e.g. "Lesson - Adam (Mon 14:00)") |
| studentId | string? | Which student this charge is for (null for top-ups) |
| lessonLogId | string? | Link to lesson log (for charges) |
| date | string | Date of the event (YYYY-MM-DD) |
| createdAt | timestamp | |

### Changes to Booking

| Field | Type | Description |
|-------|------|-------------|
| walletId | string? | Which wallet pays for this booking |
| studentWallets | Record<string, string>? | Per-student wallet override for group lessons (e.g. `{ "studentId1": "walletA", "studentId2": "walletB" }`) |

### Changes to Student

**Remove (after migration):**
- `prepaidTotal`, `prepaidUsed`, `credit`, `pendingPayment`
- `nextPrepaidTotal`, `nextPrepaidPaidAt`
- `monetaryBalance`, `useMonetaryBalance`

**Keep:**
- `lessonRate` — default rate for this student (can be overridden per booking)
- `payPerLesson` — if true, no wallet; coach collects cash each time

### Key Rules

- A student can be linked to **one wallet** (or no wallet if payPerLesson).
- A wallet can have **many students**.
- Bookings reference the wallet so mark-as-done knows where to charge.
- `payPerLesson` students skip the wallet entirely — lesson is logged but no wallet transaction.
- `balance` on the wallet doc is the source of truth for display but can be recomputed from transactions if it drifts.
- Wallets can go negative — coach collects payment when convenient.

## Core Flows

### Mark-as-done

1. Create **lesson log** (same as today).
2. Look up the **wallet** from the booking (`walletId` or `studentWallets[studentId]`).
3. If wallet exists:
   - Create a **transaction** (type: `charge`, amount: lesson price).
   - Decrement wallet **balance** by lesson price.
   - Set `balanceAfter` on the transaction.
4. If no wallet (payPerLesson): just log the lesson, no transaction.

For **group lessons with linked students**: each student gets their own charge transaction against their assigned wallet. Two students sharing a wallet = two charges on the same wallet. Two students with different wallets = one charge each on separate wallets.

### Top-up

1. Coach selects a wallet (not a student).
2. Enters amount and date.
3. Creates a **transaction** (type: `top-up`).
4. Increments wallet **balance**.

### Refund / Adjustment

Same as top-up but type is `refund` or `adjustment`. Covers overcharges, discounts, corrections. Keeps the ledger honest — no silent edits to balance.

### Delete Lesson Log

1. Find the matching transaction (via `lessonLogId`).
2. Create a **reversal transaction** (type: `refund`, links back to original).
3. Credit the wallet balance back.

## UI Design

### Navigation Change

Replace the **Income** sidebar item with **Payments**. The Payments page has three tabs:

- **Overview** — income stats (projected vs actual, same as current Income page)
- **Wallets** — list of all wallets with balance, linked students, top-up/manage actions
- **History** — all transactions across all wallets, filterable by wallet/student/date

### Wallet Card

Each wallet card shows:
- Wallet name (e.g. "Mrs. Wong")
- Linked student names (e.g. "Adam, Ben, Clara")
- Balance in RM (green if positive, red if negative)
- Approximate lessons remaining (balance ÷ average student rate)
- Last top-up date
- Student count badge

### Wallet Detail Panel

Click a wallet card to see:
- Full transaction history (charges, top-ups, refunds, adjustments)
- Top-up button
- Adjustment button
- List of linked students (add/remove)

### Student Card / Detail

- Badge showing linked wallet name and balance
- When creating a student: option to assign to existing wallet or create new one

### Booking Form

- Wallet auto-selected from the student's linked wallet
- For group lessons with `studentWallets`, each student's wallet shows inline
- Can override per-booking if needed

### Mark-as-done (Overview Page)

- Same flow as today — coach marks done, enters price
- Small line shows which wallet is being charged: "Mrs. Wong's wallet: RM340 → RM240"
- For payPerLesson students with no wallet: shows "No wallet (pay-per-lesson)"

## Migration Strategy

### Existing students with prepaid balances

- Auto-create a wallet per student (named after the student).
- Convert current state to wallet balance: `balance = (prepaidTotal - prepaidUsed) × lessonRate - pendingPayment + credit`.
- Create an initial "migration" transaction to establish the starting balance.
- Family groupings (linked students) — linked students get merged into the primary student's wallet automatically.

### payPerLesson students

- If `pendingPayment > 0`: create wallet with negative balance.
- If `pendingPayment = 0`: no wallet created during migration, stays as payPerLesson. Coach can create and assign a wallet later if they want.

### Old fields

- Keep old fields on student docs during migration (read-only, stop updating).
- All new logic reads from wallets only.
- Clean up old fields in a later pass once stable.

### Income page data

- Existing lesson logs and payment records stay as-is — Overview tab still reads from those.
- New transactions flow through wallet ledger going forward.
- No backfilling old lesson logs into wallet transactions — migration transaction captures the net balance.

## Firestore Security Rules

```
match /wallets/{walletId} {
  allow read, write: if isOwner(coachId);
  
  match /transactions/{txnId} {
    allow read, write: if isOwner(coachId);
  }
}
```

Wallets and transactions are coach-only — no public access needed.

# Portal Lesson Sets — Design

**Date:** 2026-07-07
**Status:** Draft (awaiting review)
**Area:** Wallet portal (`/portal/[token]`)

## Problem

The parent-facing portal shows the **entire** lesson history forever (newest-first,
paginated). Coaches like Wong instead think in **payment batches**: a parent pays
RM800 → that buys ~10 lessons → those lessons are "a set". When they pay again, a
fresh set begins. On WhatsApp the coach maintains a numbered checklist per set
(`1. 10/2 ✓`, `2. 24/2 ✓`, …) so the parent can **cross-check the dates against
their own calendar** and confirm the count tallies with what they paid for.

The portal should do the same automatically: show the **current set** as a numbered
checklist, hide already-settled sets behind a toggle, and let the parent verify
"dates I see = lessons I had, blanks = lessons I still have paid for".

## Core Model: Money Buckets (FIFO)

Intuition: each **top-up is a bucket of money**, and lessons always spend the
**oldest** bucket first. A new "set" begins when the wallet was effectively drained
and a fresh top-up refills it.

**The operative rule (single test):**

> A top-up **starts a new set** if the balance *immediately before it* is **below
> one lesson's cost** (the parent couldn't afford another lesson without paying).
> Otherwise the top-up **extends** the current set.

The **current set** = all lessons since the most recent set-*starting* top-up.

Consequences (all cases handled by this one rule):

| Case | Balance just before top-up | Result |
|---|---|---|
| Balance hits RM0, then RM800 top-up | RM0 (< rate) | **New set** — prior lessons collapse. |
| ~1 lesson left, parent pays next fee **in advance** | ≥ RM80 (≥ rate) | **Extends** — current set keeps showing the old batch, no confusing reset. |
| That leftover lesson is then done (880 → 800) | (a charge, not a top-up) | No change at the charge; the *next* top-up will start the new set because balance will be < rate by then. |
| Two installments for one batch | still ≥ rate at 2nd payment | **Extends** — no false reset. |
| Odd pricing leaves RM20 credit, then top-up | RM20 (< rate) | **New set** — the RM20 credit carries into the new set's opening reconciliation. |

**Leftover / shortfall carry-over:** when a top-up starts a new set, whatever the
balance was just before it (a small positive credit *or* a negative owed amount)
becomes the new set's **opening balance**, surfaced in that set's reconciliation
note. This is exactly the coach's manual "RM20 remaining → next top-up is RM780"
habit, done automatically.

**Set start timestamp** = the `createdAt` of the set-starting top-up. Charges/
top-ups with `createdAt` ≥ set start belong to the current set; everything before
is an earlier (settled) set. Each earlier set is bounded by consecutive
set-starting top-ups.

## Checklist Rendering

The current set renders as a **numbered checklist sized to the payment**, mirroring
the coach's WhatsApp list:

```
CURRENT SET · RM 800 top-up · 6 Jul
 1.  9 Jul    ✓  RM 80
 2.  11 Jul   ✓  RM 100
 3.  16 Jul   ✓  RM 80
 4.  ─
 5.  ─
 …
10.  ─            3 done · 7 left · RM 20 owed
```

**The checklist is COUNT-based, not money-based.** Each completed lesson is exactly
one slot regardless of its price. Variable lesson prices (a one-off RM60 or RM100
class) never make the count fractional — they only surface in the money
reconciliation line (below). This mirrors the coach's WhatsApp habit: the numbered
list stays clean; a note at the bottom captures any leftover/shortfall.

**Slot count** for the set = `max(round((openingBalance + topUpAmount) / rate), done)`
— the number of lessons the set's *net available* money buys (RM800 ÷ RM80 = 10
when there is no carry). Sizing from net available money (not the top-up alone)
means a carried **owed** amount reduces the affordable slot count rather than
showing phantom blanks — e.g. a set opening −RM160 in debt then topped up RM800
shows 8 slots, and the RM160 owed is surfaced as the *previous* set's closing note,
not duplicated on the new one. A carried **credit** simply rounds into the count.
The `max(…, done)` guard guarantees no completed lesson is ever hidden.

- **Filled slots** = completed lessons in the set, numbered `1..done` in **date
  order (oldest first)**, each showing its lesson date, a ✓, and **its price**
  (shown on every row — usual and odd alike — for easy cross-check). Oldest-first
  matches the WhatsApp habit and reads naturally against a calendar.
- **Blank slots** = `slots − done` (a count, not money ÷ rate), shown as `─`.
- **Footer** = `{done} done · {slots − done} left`, plus a **reconciliation note**
  when the wallet balance isn't a clean multiple of the rate:
  - balance runs *above* the clean count → **"RM X credit — carries to your next
    top-up"** (a cheaper lesson happened; next payment is that much less).
  - balance runs *below* → **"RM X owed — added to your next payment"** (a pricier
    lesson happened; next payment is that much more).
  - clean multiple → no note.

The reconciliation amount is derived straight from the wallet balance vs. the
count, so it always self-updates and needs no manual math from the coach.

`lessonRate` comes from `getWalletHealth(...)`'s existing `rate` return (next
lesson cost — the wallet's usual per-lesson price). If `rate` is 0/unknown, fall
back to the non-checklist numbered list (see Fallbacks).

## Earlier Sets

Below the current set, a **"Show earlier lessons"** control reveals prior sets
**one at a time**: the first tap shows the most recent finished set, the next tap
shows the one before it, and so on — no hard cap. Each revealed set renders as its
own block with the same checklist format (e.g. `RM 400 · 18 Apr · 5 done`). The
control disappears once the oldest set is shown. Nothing is deleted — the parent
can always keep tapping to walk back through the full trustworthy history. Earlier
sets are closed (a later top-up started a new set), so they carry their final
`credit` / `owed` note; usually every slot is filled, though a batch closed early
by pricier lessons may show a blank slot alongside its `owed` note.

All sets are computed server-side (see below) and sent in the payload; revealing
them one at a time is a purely client-side interaction (no extra fetch per tap).

## Layout Changes on the Portal

- **Balance card** — unchanged (still the headline `CURRENT BALANCE` + status chip
  + `Next lesson ≈ RM X`).
- **"Recent lessons" section** → becomes **"Current set"** checklist block.
- **Separate "Top-ups" section** → **removed**. Each set is headed by its own
  top-up (`RM 800 top-up · 6 Jul`), so a flat top-up list is redundant.

## Data & Implementation

- New pure module `src/lib/portal-sets.ts`:
  `computeLessonSets(transactions, rate)` → `{ current, earlier[] }` where each set
  = `{ topUp: {date, amount}, openingBalance, slots, lessons: [{n, date, price}],
  done, left, reconciliation: {kind:'credit'|'owed'|'none', amount} }`.
  Pure + deterministic → unit-tested in `src/lib/__tests__/portal-sets.test.ts`
  (matches existing `wallet-alerts`/`cancel-scope` test pattern).
- `portal-data.ts` `fetchPortalData` fetches **all** wallet transactions ordered
  ascending (server-side, Admin SDK), runs `computeLessonSets`, and returns the
  set structure instead of the two raw paginated lists. Wallet transaction counts
  for a solo coach are small; a single ordered read is acceptable. If a wallet ever
  grows very large we can cap earlier sets — noted, not built.
- Because all sets are computed server-side, the current `Load more` API pagination
  (`/api/portal/[token]/transactions`) is replaced by client-side one-at-a-time
  reveal of earlier sets. The route can be removed or left unused (decide during
  planning).
- Replay is a single ascending pass tracking a running balance:
  - `top-up` → if running balance **< rate**, close the current set and start a new
    one anchored at this top-up (opening balance = the pre-top-up balance, i.e. the
    carried credit/owed). Else, extend the current set. Then add the amount.
  - `charge` → append a lesson `{date, price = abs(amount)}` to the current set;
    subtract from the balance.
  - `refund` / positive `adjustment` → add to balance; not a lesson, not a set
    boundary.
  - negative `adjustment` → subtract from balance; not a lesson.
- Per-set derived fields: `slots = max(round((openingBalance + topUpSum) / rate), done)`;
  `left = slots − done`; `reconciliation` compares the set's ending balance to
  `left × rate` — a positive difference is `credit`, negative is `owed`, zero is
  `none`. Lessons are numbered oldest-first by lesson **date** (display-only sort),
  independent of transaction insertion order.

## Fallbacks / Edge Cases

- **No top-ups yet / legacy wallet with charges only** → no buckets; show a plain
  numbered list of completed lessons (current behaviour, minus pagination). No
  blank slots.
- **`rate` unknown/0** → can't size slots; show numbered completed lessons + the
  raw balance, no blank slots.
- **Multi-student wallet** (>1 student, mixed prices) → checklist slot sizing is
  ambiguous. Default: fall back to the numbered completed-lesson list for these
  wallets; the clean checklist targets the common single-student wallet
  (e.g. "Doyoon's Mom"). Revisit if needed.
- **Odd / variable lesson price** (a one-off RM60 or RM100 class) → still one slot;
  the difference shows as the per-row price and rolls into the set's `credit` / `owed`
  reconciliation note. Never affects the lesson count.
- **Fractional leftover** (balance ends between 0 and one lesson, e.g. RM20) → 0
  blank slots; shown as `RM20 credit — carries to your next top-up`.
- **Tab-mode wallets** → sets concept doesn't apply (pay-after); keep current
  behaviour / plain list.

## Resolved Decisions

1. **Top-up history** — the separate flat "Top-ups" list is dropped; each set's
   header carries its top-up.
2. **Earlier sets** — no cap; revealed one at a time via repeated taps of "Show
   earlier lessons".

## Out of Scope

- Coach-side UI changes (this is portal-display only; the coach already tops up /
  charges normally).
- Editing/annotating individual slots from the portal (read-only stays read-only).
- Push/WhatsApp automation of the checklist.

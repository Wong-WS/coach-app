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

Treat each **top-up as a bucket of money**. Lessons (charges) always consume the
**oldest** non-empty bucket first (first-in-first-out). The **current set** = the
lessons drawn from whichever bucket is currently at the front (the oldest bucket
that still has money in it).

Consequences (all four cases handled by this one rule):

| Case | Behaviour |
|---|---|
| Balance hits RM0, then RM800 top-up | New bucket is the only one → it becomes the current set immediately. Prior lessons collapse. |
| ~1 lesson left, parent pays next fee **in advance** | Old bucket still has money, so it stays the front → current set keeps showing the old batch. No confusing reset. |
| That last leftover lesson is done (e.g. 880 → 800) | Old bucket empties → front flips to the advance bucket → portal now shows the fresh RM800 set, 0 lessons in. |
| Two installments for one batch | Second top-up sits behind the first; set doesn't falsely reset until the first bucket drains. |

**Set start timestamp** = the moment the current front bucket *became* the front:
- the `createdAt` of the charge that emptied the bucket immediately older than it, or
- if there is no older bucket, the front bucket's own top-up `createdAt`.

Charges/top-ups with `createdAt` ≥ set start belong to the current set; everything
before is an earlier (settled) set.

## Checklist Rendering

The current set renders as a **numbered checklist sized to the payment**, mirroring
the coach's WhatsApp list:

```
CURRENT SET · RM 800 top-up · 6 Jul
 1.  9 Jul   ✓
 2.  11 Jul  ✓
 3.  16 Jul  ✓
 4.  ─
 5.  ─
 …
10.  ─                    3 done · 7 left
```

**Slot count** for the set = `round(bucketTopUpAmount / lessonRate)`
(RM800 ÷ RM80 = 10). If the number of completed lessons ever exceeds this (price
variance / adjustments), expand the slot count to the number of completed lessons
so no lesson is hidden. `expand: slots = max(round(topUp / rate), doneCount)`.

- **Filled slots** = completed lessons in the set, numbered `1..done` in **date
  order (oldest first)**, each showing its lesson date + a ✓. Oldest-first matches
  the WhatsApp habit and reads naturally against a calendar.
- **Blank slots** = `slots − done`, shown as `─` (upcoming/owed).
- **Footer** = `{done} done · {slots − done} left`.

`lessonRate` comes from `getWalletHealth(...)`'s existing `rate` return (next
lesson cost). If `rate` is 0/unknown, fall back to the non-checklist numbered list
(see Fallbacks).

## Earlier Sets

Below the current set, a **"Show earlier lessons"** control reveals prior sets
**one at a time**: the first tap shows the most recent finished set, the next tap
shows the one before it, and so on — no hard cap. Each revealed set renders as its
own block with the same checklist format (e.g. `RM 400 · 18 Apr · 5 done`). The
control disappears once the oldest set is shown. Nothing is deleted — the parent
can always keep tapping to walk back through the full trustworthy history. Earlier
sets are all-done by definition (their bucket is empty), so every slot is filled.

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
  = `{ topUp: {date, amount}, slots, lessons: [{n, date}], done, left }`.
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
- Transaction handling in the FIFO replay:
  - `top-up` → push bucket `{time, amount}`.
  - `charge` → drain oldest bucket(s) by `abs(amount)`; a charge that spans a bucket
    boundary is attributed to the older set (it's the lesson that drains it).
  - `refund` / positive `adjustment` → treated as a bucket at their time.
  - negative `adjustment` → treated like a charge (drains oldest).

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
- **Fractional leftover** (bucket remaining < one lesson, e.g. RM50 with RM80 rate)
  → 0 blank slots; the leftover simply lives in the headline balance number.
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

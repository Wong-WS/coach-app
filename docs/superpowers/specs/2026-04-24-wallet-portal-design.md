# Wallet Portal — Design Spec

**Date:** 2026-04-24
**Status:** Design approved by user, pending plan
**Branch:** `main` (worktree to be created for implementation)

## Goal

A read-only, token-based web page that a coach can share with a parent/student via WhatsApp. The parent opens the link and sees: wallet balance, recent lessons, recent top-ups, and — when the wallet is running out — a suggested top-up amount based on their usual habits. No login, no payments, no live updates. Just "how much is left, what did you spend it on, how much should you top up next."

## Non-Goals

- No student login / email / password
- No payment processing (coach still records top-ups manually in the dashboard)
- No upcoming-lessons view (exposes the schedule to anyone the link is forwarded to)
- No per-student filtering inside the portal
- No live Firestore subscriptions (one-shot server fetch per page load)
- No token rotation / revoke UI (YAGNI — single parent per wallet, they won't over-share)
- No branding / coach photo / coach contact details embedded in the page
- No edits to the depletion popup copy (that's a follow-up feature, not part of this spec)

## URL & Token Model

- **Public URL:** `coach-simplify.com/portal/[token]` (top-level route, outside `/dashboard`, no auth guard in the layout)
- **Token format:** 10-char nanoid using the default URL-safe alphabet (A-Za-z0-9_-). Example: `aB3xK9pQ2m`.
  - Entropy: 64^10 ≈ 1.15 × 10^18 combinations. Unguessable at any realistic scale for this app.
  - Short enough to look clean when pasted into WhatsApp.
- **Storage:**
  - `wallets/{walletId}.portalToken?: string` — added to the `Wallet` type; optional, absent until the coach first clicks "Share portal link".
  - `walletPortalTokens/{token}` — top-level lookup doc mapping `token → { coachId, walletId, createdAt }`. Mirrors the existing `coachSlugs` pattern so we don't need a collection-group query to resolve a token.
- **Generation:** lazy, on-demand. See "Coach-Side Sharing" below.

## Data Access

- **Location:** inline in the portal page (`src/app/portal/[token]/page.tsx`) — an `async` React Server Component that fetches directly from the Admin SDK (`getAdminDb()` from `@/lib/firebase-admin`). No `/api/portal/...` route.
- **Why Admin SDK:** portal readers are unauthenticated, so they can't satisfy owner-scoped Firestore rules. Bypassing rules via Admin SDK on the server keeps the client-side rules simple for reads (no portal-reader carve-outs in `firestore.rules`) and avoids punching holes in the security model.
- **Why server component over API route:** one less endpoint, no loading spinner flash, full HTML rendered on first response. If we later want a refresh button, the fetch logic can be extracted into a helper called from both server and client.
- **Flow:**
  1. Read `walletPortalTokens/{token}` — if missing, return 404.
  2. Read `coaches/{coachId}` for the display name.
  3. Read `coaches/{coachId}/wallets/{walletId}` for balance and name. If the wallet has `archived: true`, return 404 (treat archived wallets as unavailable — coach doesn't want parents still checking a dead wallet).
  4. Read the wallet's students to derive per-lesson rate. Read `coaches/{coachId}/bookings` (status == confirmed) to compute `getNextLessonCost` the same way the dashboard does.
  5. Query `coaches/{coachId}/wallets/{walletId}/transactions` ordered by `createdAt desc`, limit 30. Split into top-ups and charges in the response.
  6. Compute suggested top-up (see "Smart Top-Up Suggestion" below).
  7. Return one aggregated JSON payload.
- **Response shape:**
  ```ts
  type PortalPayload = {
    coach: { displayName: string };
    wallet: {
      name: string;
      balance: number;
      status: 'healthy' | 'low' | 'empty' | 'owing' | 'tab' | 'inactive';
      rate: number;                 // next-lesson cost, in RM
    };
    suggestion: { usual: number; amount: number } | null;
    charges: Array<{
      date: string;                 // YYYY-MM-DD
      studentName: string;          // empty string if wallet has only one student — UI will omit
      amount: number;               // positive RM
      balanceAfter: number;
    }>;
    topUps: Array<{
      date: string;
      amount: number;
      balanceAfter: number;
    }>;
  };
  ```
- **404 cases:**
  - Token not in `walletPortalTokens`
  - Wallet doc missing or `archived`
  - Coach doc missing
  - Any of these render a generic "This link is no longer active. Please contact your coach." page — no distinction between cases (don't leak info to a token-guesser).
- **Live updates:** none. The page is a Next.js server component that calls the API (or fetches directly via Admin SDK — see "Open Decision" below). Browser pull-to-refresh is sufficient.

## Coach-Side Sharing

- In the **wallet detail panel** on `/dashboard/payments`, add a new "Share portal link" button next to the existing wallet actions (Top Up / Adjust / Archive etc.).
- **First click:**
  1. Generate a 10-char nanoid token (client-side via `nanoid` package).
  2. Write `walletPortalTokens/{token}` with `{ coachId, walletId, createdAt: serverTimestamp() }`.
  3. Update `wallets/{walletId}.portalToken = token` and `updatedAt = serverTimestamp()`.
  4. Copy `https://coach-simplify.com/portal/{token}` to the clipboard.
  5. Toast: "Portal link copied".
- **Subsequent clicks:** skip the write; just re-copy the existing link and toast "Portal link copied".
- Collision handling: not needed at 64^10 — but if the write to `walletPortalTokens/{token}` fails for any reason, surface the error to the coach and don't update the wallet. No retry loop.
- Archived wallets: hide the button (or disable it). No point sharing a link that will 404.
- Tab-mode wallets: button is still shown (the parent still benefits from seeing lesson history even if the balance is always ~0). The suggestion card just won't render for them.

## Smart Top-Up Suggestion

- **Usual top-up:** amount of the most recent `type === 'top-up'` transaction on this wallet, regardless of date.
  - Chosen over mode/average for simplicity. Matches the "parent usually pays RM 500" mental model. Auto-adjusts if the parent changes habits — next time they top up a different amount, the next suggestion uses the new number.
- **Suggested amount:** `Math.max(Math.round(usual - balance), 0)`.
  - Wallet fees are always whole RM in this app, so rounding is a safety net, not a UX concern.
  - Examples:
    - usual 500, balance 23 → suggest **477**
    - usual 500, balance −30 (owing) → suggest **530**
    - usual 500, balance 500 (already topped up) → suggest 0 → card hides (see visibility rule)
- **Visibility:**
  - Card is **shown** when wallet status is `empty` or `owing` AND the wallet has ≥ 1 prior top-up.
  - Card is **hidden** when:
    - status is `healthy`, `low`, `tab`, or `inactive`
    - no prior top-ups exist (no signal to anchor on)
    - suggested amount rounds to 0
- Computed server-side in the API response; the portal page just renders `suggestion.amount` when `suggestion` is non-null.

## Portal Page Layout

Single mobile-first page, top to bottom. Uses the existing Paper & Ink design tokens (`--ink`, `--panel`, `--line`, `--accent`, `--bad`, `--warn`, `--warn-soft`, `--bad-soft`).

1. **Header band** — coach display name (small, `--ink-3`), wallet name (large, `--ink`). Example: "Coach Wong" / "Dong family".
2. **Balance card** — large balance number (RM formatted), status chip (color per status: green healthy, amber low, red empty/owing, grey tab/inactive), subline "next lesson ≈ RM X" (omitted if rate is 0).
3. **Top-up suggestion card** — only when visible per rules above.
   - Border/background uses `--warn-soft` (empty) or `--bad-soft` (owing) for visual urgency consistent with the dashboard depletion popup.
   - Headline: "Time for the next top-up"
   - Body: "Suggested top-up: **RM {amount}**"
   - Small print: "Tops you up to your usual RM {usual}"
4. **Recent lessons** — section heading "Recent lessons". List of up to 20 rows (from `charges`). Each row: date (short format "24 Apr"), student name (shown only if wallet has >1 student), price as "−RM X", balance-after in muted text on the right. Empty state: "No lessons yet."
5. **Top-up history** — section heading "Top-ups". List of up to 10 rows (from `topUps`). Each row: date, amount as "+RM X", balance-after muted. Empty state: "No top-ups yet."
6. **Footer** — small muted text: "Questions? Contact your coach."

No bottom nav, no sidebar, no login prompt. Just the one page.

## Data Flow Summary

```
Coach dashboard                      Parent's phone
───────────────                     ────────────────
 Wallet detail panel
   ↓ "Share portal link" click
   ↓ generate nanoid (client)
   ↓ write walletPortalTokens/{token}
   ↓ write wallets/{walletId}.portalToken
   ↓ copy URL, toast
 Coach pastes URL into WhatsApp ─────→ Parent taps link
                                       ↓
                                      GET /portal/{token}
                                       ↓ Admin SDK lookup
                                       ↓ aggregate payload
                                       ↓ render Paper & Ink page
```

## Types

Add to `src/types/index.ts`:

```ts
export interface Wallet {
  // ...existing fields
  portalToken?: string;           // 10-char nanoid, set once when coach shares
}
```

No new public-facing types required at file-level; the `PortalPayload` shape lives inside the API route file since it's only consumed by the portal page.

## Firestore Rules Changes

A new top-level collection `walletPortalTokens` needs one rule added to `firestore.rules`:

```
match /walletPortalTokens/{token} {
  // Authenticated coaches can create a token doc that points to their own coachId.
  // No updates (tokens are immutable once created). No deletes (YAGNI — orphans are harmless).
  // No client-side reads — the portal reads via Admin SDK on the server.
  allow create: if request.auth != null
                && request.resource.data.coachId == request.auth.uid;
  allow read, update, delete: if false;
}
```

This mirrors how `coachSlugs` is scoped: top-level lookup table, coach writes their own, nobody reads it client-side.

## Security & Privacy Considerations

- **Token is the credential.** Anyone with the URL can read the wallet. This is intentional — the parent is meant to share with their household. Matches the threat model of "link you'd text to grandma".
- **No PII beyond what the parent already knows:** student names (their own kids), lesson dates/prices they've already paid for, coach's display name. No phone numbers, no addresses, no email, no other parents' data.
- **Firestore rules hardened for the new collection.** `walletPortalTokens` is write-only for the owning coach and read-invisible to all clients — portal reads go through Admin SDK server-side. No existing rules change.
- **Rate limiting:** out of scope for v1. If this becomes a problem (someone scraping token guesses), add a simple IP-based rate limit on the server component later.
- **Orphan lookup docs:** if a wallet is deleted (rare — currently wallets are archived, not deleted), its `walletPortalTokens` entry becomes an orphan pointing to a missing wallet. The portal returns 404 naturally on the missing wallet read, so orphans are harmless. No cleanup job needed.

## Testing Notes

- **Manual:** create a test wallet, share link, open in incognito, verify all sections render.
- **Edge cases to test:**
  - Wallet with no transactions yet (lessons empty, top-ups empty, suggestion hidden)
  - Wallet with top-ups but no charges (lessons empty, top-ups populated, suggestion hidden if healthy)
  - Wallet with charges but no top-ups (lessons populated, top-ups empty, suggestion hidden — no anchor)
  - Wallet in each status: healthy, low, empty, owing, tab
  - Archived wallet → 404
  - Unknown token → 404
  - Single-student wallet → student name omitted from charge rows
  - Multi-student wallet → student name shown
  - Negative balance (owing) → large red styling, suggestion amount > usual
- **Automated:** no test infrastructure exists in this repo currently. Manual QA is the bar.

## Resolved Decisions

1. Token length — 10 chars
2. Rounding — whole RM, `Math.round`
3. Button placement — wallet detail panel, next to existing actions
4. Server component vs API route — server component, Admin SDK direct
5. Token generation — client-side via `nanoid` package on the "Share portal link" click

## Follow-Up (not this spec)

After the portal ships, the existing wallet-depletion popup on `/dashboard` (in `src/app/dashboard/page.tsx` around lines 914-968) gets a text-the-student helper: a block with copy like "Text your student: *It's time for the next top-up — {portal link}*" and a copy button. Requires each wallet in the alert to already have a `portalToken`; if it doesn't, fall back to the existing "Got it" acknowledgement flow and prompt the coach to share the link from the wallet detail panel.

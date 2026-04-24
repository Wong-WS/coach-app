# Wallet Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, token-based wallet portal a coach can share with a parent via WhatsApp, showing balance, recent lessons, recent top-ups, and a smart top-up suggestion.

**Architecture:** A top-level route `/portal/[token]` renders as an async React Server Component that fetches data via Admin SDK (bypassing owner-scoped Firestore rules since portal readers are unauthenticated). Tokens are 10-char nanoids written lazily when the coach clicks "Share portal link" in the wallet detail panel. A top-level `walletPortalTokens/{token}` lookup doc maps token → `{ coachId, walletId }`, mirroring the existing `coachSlugs` pattern.

**Tech Stack:** Next.js 16 App Router (server components), TypeScript 5, Tailwind CSS 4, Firebase Admin SDK (`firebase-admin/firestore`), Firebase Web SDK for the client-side token write, `nanoid` package for token generation, Paper & Ink design tokens (`--ink`, `--panel`, `--line`, `--accent`, `--bad`, `--warn`, `--warn-soft`, `--bad-soft`).

**Testing note:** This codebase has no automated test infrastructure. Following existing convention, we verify with `npm run lint`, `npm run build`, and structured manual QA in the browser. The one piece of pure logic (`getSuggestedTopUp`) is audited by eye against inline example comments; if it grows or needs variants later, introducing vitest is a follow-up worth doing.

**Spec:** `docs/superpowers/specs/2026-04-24-wallet-portal-design.md`

---

## File Map

**Create:**
- `src/lib/portal-suggestion.ts` — pure function `getSuggestedTopUp(usual, balance)` returning `{ usual, amount } | null`
- `src/lib/portal-data.ts` — server-only fetcher: `fetchPortalData(token)` returning `PortalPayload | null`; also exports the `PortalPayload` type
- `src/app/portal/layout.tsx` — minimal layout (no sidebar, no auth guard, just `<html>`/`<body>` with theme)
- `src/app/portal/[token]/page.tsx` — async server component, calls `fetchPortalData`, calls `notFound()` on null, renders full page
- `src/app/portal/[token]/not-found.tsx` — generic "link no longer active" page

**Modify:**
- `package.json` — add `nanoid` dependency
- `src/types/index.ts:84-93` — add optional `portalToken?: string` to `Wallet`
- `firestore.rules` — add `match /walletPortalTokens/{token}` rule
- `src/hooks/useCoachData.ts:252-287` — read `portalToken` field in `useWallets` mapping
- `src/app/dashboard/payments/page.tsx:330-521` — add "Share portal link" button + handler inside `WalletDetailBody`

---

## Task 1: Dependencies, Wallet type, and Firestore rule

Foundational prereqs. Small write, gets everything wired so later tasks compile.

**Files:**
- Modify: `package.json`
- Modify: `src/types/index.ts:84-93`
- Modify: `src/hooks/useCoachData.ts:269-278`
- Modify: `firestore.rules:1-41`

- [ ] **Step 1.1: Install nanoid**

```bash
npm install nanoid
```

Expected: package added to `dependencies` in `package.json`. `node_modules/nanoid` present.

- [ ] **Step 1.2: Add `portalToken` to the `Wallet` type**

Open `src/types/index.ts`, find the `Wallet` interface (lines 84–93). Add `portalToken?: string;` after `tabMode`:

```ts
export interface Wallet {
  id: string;
  name: string;
  balance: number;
  studentIds: string[];
  archived?: boolean;
  tabMode?: boolean;
  portalToken?: string;         // 10-char nanoid, set once when coach shares portal link
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 1.3: Read `portalToken` in the `useWallets` hook**

Open `src/hooks/useCoachData.ts`, find the `useWallets` hook's doc mapping (around lines 269–278). Add `portalToken: d.data().portalToken ?? undefined,` to the mapped object:

```ts
const items: Wallet[] = snapshot.docs.map((d) => ({
  id: d.id,
  name: d.data().name,
  balance: d.data().balance ?? 0,
  studentIds: d.data().studentIds ?? [],
  archived: d.data().archived ?? false,
  tabMode: d.data().tabMode ?? false,
  portalToken: d.data().portalToken ?? undefined,
  createdAt: d.data().createdAt?.toDate() || new Date(),
  updatedAt: d.data().updatedAt?.toDate() || new Date(),
}));
```

- [ ] **Step 1.4: Add the `walletPortalTokens` Firestore rule**

Open `firestore.rules`. Add this block inside `match /databases/{database}/documents { ... }`, after the closing brace of `match /coaches/{coachId}` but before the outer closing braces:

```
    match /walletPortalTokens/{token} {
      // Coaches can create token docs pointing to their own coachId.
      // Tokens are immutable once created. No deletes (orphans are harmless).
      // No client-side reads — the portal reads via Admin SDK on the server.
      allow create: if request.auth != null
                    && request.resource.data.coachId == request.auth.uid;
      allow read, update, delete: if false;
    }
```

Final file should look like:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(coachId) {
      return request.auth != null && request.auth.uid == coachId;
    }

    match /coaches/{coachId} {
      // ... existing rules unchanged ...
    }

    match /walletPortalTokens/{token} {
      allow create: if request.auth != null
                    && request.resource.data.coachId == request.auth.uid;
      allow read, update, delete: if false;
    }
  }
}
```

- [ ] **Step 1.5: Deploy Firestore rules**

```bash
firebase deploy --only firestore:rules
```

Expected output contains: `✔  cloud.firestore: released rules firestore.rules to cloud.firestore`.

- [ ] **Step 1.6: Lint + typecheck + build**

```bash
npm run lint && npm run build
```

Expected: no errors. (Lint runs as part of `next build` too, but running it standalone gives faster feedback.)

- [ ] **Step 1.7: Commit**

```bash
git add package.json package-lock.json src/types/index.ts src/hooks/useCoachData.ts firestore.rules
git commit -m "portal: add nanoid, Wallet.portalToken field, Firestore rule for walletPortalTokens"
```

---

## Task 2: Top-up suggestion pure function

Small pure function with inline examples. No dedicated test file (repo has no test infra), but the logic is dead-simple and easy to verify by eye.

**Files:**
- Create: `src/lib/portal-suggestion.ts`

- [ ] **Step 2.1: Create `src/lib/portal-suggestion.ts`**

```ts
/**
 * Compute the suggested top-up amount for a wallet portal.
 *
 * Strategy: anchor on the parent's most recent top-up amount ("usual"), then
 * suggest the difference needed to get back to that level. Matches the
 * "parent usually tops up RM 500" mental model.
 *
 * Returns null when there's no signal to anchor on (no prior top-ups) or when
 * the suggestion rounds to 0 (wallet already at or above usual).
 *
 * Examples:
 *   usual=500, balance=23   → { usual: 500, amount: 477 }
 *   usual=500, balance=-30  → { usual: 500, amount: 530 }
 *   usual=500, balance=500  → null (already topped up)
 *   usual=500, balance=600  → null (over-topped-up)
 *   usual=null, balance=20  → null (no prior top-up signal)
 */
export function getSuggestedTopUp(
  usualTopUp: number | null,
  balance: number,
): { usual: number; amount: number } | null {
  if (usualTopUp == null || usualTopUp <= 0) return null;
  const amount = Math.max(Math.round(usualTopUp - balance), 0);
  if (amount === 0) return null;
  return { usual: usualTopUp, amount };
}
```

- [ ] **Step 2.2: Lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/portal-suggestion.ts
git commit -m "portal: add getSuggestedTopUp pure function"
```

---

## Task 3: Portal data fetcher (server-only, Admin SDK)

Aggregates everything the portal page needs in one round-trip. Must never be imported by client code.

**Files:**
- Create: `src/lib/portal-data.ts`

- [ ] **Step 3.1: Create `src/lib/portal-data.ts`**

```ts
import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Booking, Wallet, WalletTransaction } from '@/types';
import { getWalletHealth, type WalletHealth } from '@/lib/wallet-alerts';
import { getSuggestedTopUp } from '@/lib/portal-suggestion';

export type PortalPayload = {
  coach: { displayName: string };
  wallet: {
    name: string;
    balance: number;
    status: WalletHealth;
    rate: number;
  };
  suggestion: { usual: number; amount: number } | null;
  charges: Array<{
    date: string;
    studentName: string;
    amount: number;
    balanceAfter: number;
  }>;
  topUps: Array<{
    date: string;
    amount: number;
    balanceAfter: number;
  }>;
};

function todayIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchPortalData(token: string): Promise<PortalPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const db = getAdminDb();

  // 1. Resolve token → { coachId, walletId }
  const tokenSnap = await db.doc(`walletPortalTokens/${token}`).get();
  if (!tokenSnap.exists) return null;
  const tokenData = tokenSnap.data() as { coachId?: string; walletId?: string } | undefined;
  const coachId = tokenData?.coachId;
  const walletId = tokenData?.walletId;
  if (!coachId || !walletId) return null;

  // 2. Coach
  const coachSnap = await db.doc(`coaches/${coachId}`).get();
  if (!coachSnap.exists) return null;
  const displayName = (coachSnap.data()?.displayName as string | undefined) ?? 'Coach';

  // 3. Wallet (reject if archived)
  const walletSnap = await db.doc(`coaches/${coachId}/wallets/${walletId}`).get();
  if (!walletSnap.exists) return null;
  const wd = walletSnap.data() ?? {};
  if (wd.archived) return null;
  const wallet: Wallet = {
    id: walletSnap.id,
    name: (wd.name as string) ?? 'Wallet',
    balance: (wd.balance as number) ?? 0,
    studentIds: (wd.studentIds as string[]) ?? [],
    archived: false,
    tabMode: (wd.tabMode as boolean) ?? false,
    portalToken: (wd.portalToken as string) ?? undefined,
    createdAt: wd.createdAt?.toDate?.() ?? new Date(),
    updatedAt: wd.updatedAt?.toDate?.() ?? new Date(),
  };

  // 4. Bookings → feeds getWalletHealth for rate + status
  const bookingsSnap = await db
    .collection(`coaches/${coachId}/bookings`)
    .where('status', '==', 'confirmed')
    .get();
  const bookings: Booking[] = bookingsSnap.docs.map((d) => {
    const b = d.data();
    return {
      id: d.id,
      locationId: b.locationId,
      locationName: b.locationName,
      dayOfWeek: b.dayOfWeek,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      className: b.className ?? '',
      notes: b.notes ?? '',
      studentIds: b.studentIds ?? [],
      studentPrices: b.studentPrices ?? {},
      studentWallets: b.studentWallets ?? {},
      startDate: b.startDate ?? undefined,
      endDate: b.endDate ?? undefined,
      createdAt: b.createdAt?.toDate?.() ?? new Date(),
      cancelledAt: b.cancelledAt?.toDate?.(),
    };
  });
  const { health, rate } = getWalletHealth(wallet, bookings, todayIsoDate());

  // 5. Transactions (30 most recent, newest first)
  const txnsSnap = await db
    .collection(`coaches/${coachId}/wallets/${walletId}/transactions`)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get();
  const txns: WalletTransaction[] = txnsSnap.docs.map((d) => {
    const t = d.data();
    return {
      id: d.id,
      type: t.type,
      amount: t.amount ?? 0,
      balanceAfter: t.balanceAfter ?? 0,
      description: t.description ?? '',
      studentId: t.studentId ?? undefined,
      lessonLogId: t.lessonLogId ?? undefined,
      date: t.date,
      createdAt: t.createdAt?.toDate?.() ?? new Date(),
    };
  });

  // 6. Resolve student names (only the ones that appear in transactions on this wallet)
  const studentIdsInTxns = new Set<string>();
  for (const t of txns) {
    if (t.studentId) studentIdsInTxns.add(t.studentId);
  }
  const studentNames = new Map<string, string>();
  await Promise.all(
    Array.from(studentIdsInTxns).map(async (sid) => {
      const s = await db.doc(`coaches/${coachId}/students/${sid}`).get();
      if (s.exists) studentNames.set(sid, (s.data()?.clientName as string) ?? '');
    }),
  );
  const hideStudentNames = wallet.studentIds.length <= 1;

  // 7. Split transactions into charges / top-ups
  const charges: PortalPayload['charges'] = [];
  const topUps: PortalPayload['topUps'] = [];
  for (const t of txns) {
    if (t.type === 'charge') {
      charges.push({
        date: t.date,
        studentName: hideStudentNames ? '' : (t.studentId ? studentNames.get(t.studentId) ?? '' : ''),
        amount: Math.abs(t.amount),
        balanceAfter: t.balanceAfter,
      });
    } else if (t.type === 'top-up') {
      topUps.push({
        date: t.date,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
      });
    }
    // refunds and adjustments: intentionally omitted from the portal view to
    // keep the parent-facing list clean. Balance still reflects them.
  }
  const displayCharges = charges.slice(0, 20);
  const displayTopUps = topUps.slice(0, 10);

  // 8. Suggestion — only meaningful when balance can't cover next lesson
  const usualTopUp = topUps.length > 0 ? topUps[0].amount : null;
  const showSuggestion = health === 'empty' || health === 'owing';
  const suggestion = showSuggestion ? getSuggestedTopUp(usualTopUp, wallet.balance) : null;

  return {
    coach: { displayName },
    wallet: {
      name: wallet.name,
      balance: wallet.balance,
      status: health,
      rate,
    },
    suggestion,
    charges: displayCharges,
    topUps: displayTopUps,
  };
}
```

- [ ] **Step 3.2: Lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors. (The `server-only` import ensures a build failure if any client code imports this file later.)

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/portal-data.ts
git commit -m "portal: add Admin SDK data fetcher for portal pages"
```

---

## Task 4: Portal page UI

The parent-facing page. Server component, Paper & Ink styling, mobile-first.

**Files:**
- Create: `src/app/portal/layout.tsx`
- Create: `src/app/portal/[token]/page.tsx`
- Create: `src/app/portal/[token]/not-found.tsx`

- [ ] **Step 4.1: Create `src/app/portal/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Wallet',
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="max-w-[560px] mx-auto px-4 py-5">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4.2: Create `src/app/portal/[token]/not-found.tsx`**

```tsx
export default function PortalNotFound() {
  return (
    <div className="py-16 text-center">
      <div
        className="text-[15px] font-semibold mb-1"
        style={{ color: 'var(--ink)' }}
      >
        Link no longer active
      </div>
      <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
        Please contact your coach for a new link.
      </div>
    </div>
  );
}
```

- [ ] **Step 4.3: Create `src/app/portal/[token]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { fetchPortalData, type PortalPayload } from '@/lib/portal-data';

export const dynamic = 'force-dynamic';

function formatShortDate(iso: string): string {
  // "2026-04-24" → "24 Apr"
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function formatRM(n: number): string {
  const abs = Math.abs(n).toFixed(0);
  return `${n < 0 ? '−' : ''}RM ${abs}`;
}

function statusChip(status: PortalPayload['wallet']['status']) {
  const map: Record<PortalPayload['wallet']['status'], { label: string; bg: string; fg: string }> = {
    healthy: { label: 'Healthy', bg: 'var(--good-soft)', fg: 'var(--good)' },
    low: { label: 'Low', bg: 'var(--warn-soft)', fg: 'var(--warn)' },
    empty: { label: 'Empty', bg: 'var(--warn-soft)', fg: 'var(--warn)' },
    owing: { label: 'Owing', bg: 'var(--bad-soft)', fg: 'var(--bad)' },
    tab: { label: 'Tab mode', bg: 'var(--line)', fg: 'var(--ink-2)' },
    inactive: { label: 'Inactive', bg: 'var(--line)', fg: 'var(--ink-2)' },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchPortalData(token);
  if (!data) notFound();

  const { coach, wallet, suggestion, charges, topUps } = data;
  const owing = wallet.balance < 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {coach.displayName}
        </div>
        <div
          className="text-[20px] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {wallet.name}
        </div>
      </div>

      {/* Balance card */}
      <div
        className="rounded-[12px] border p-4"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <div
            className="text-[10.5px] font-semibold uppercase"
            style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
          >
            Current balance
          </div>
          {statusChip(wallet.status)}
        </div>
        <div
          className="mono tnum text-[34px] font-semibold"
          style={{
            color: owing ? 'var(--bad)' : 'var(--ink)',
            letterSpacing: '-0.8px',
          }}
        >
          {formatRM(wallet.balance)}
        </div>
        {wallet.rate > 0 && wallet.status !== 'tab' && (
          <div
            className="text-[11.5px] mt-1.5"
            style={{ color: 'var(--ink-3)' }}
          >
            Next lesson ≈ RM {wallet.rate.toFixed(0)}
          </div>
        )}
      </div>

      {/* Top-up suggestion (only when status is empty/owing AND we have a signal) */}
      {suggestion && (
        <div
          className="rounded-[12px] border p-4"
          style={{
            background: owing ? 'var(--bad-soft)' : 'var(--warn-soft)',
            borderColor: owing ? 'var(--bad)' : 'var(--warn)',
          }}
        >
          <div
            className="text-[13.5px] font-semibold mb-1"
            style={{ color: 'var(--ink)' }}
          >
            Time for the next top-up
          </div>
          <div className="mono tnum text-[22px] font-semibold" style={{ color: 'var(--ink)' }}>
            Suggested: RM {suggestion.amount}
          </div>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
            Tops you up to your usual RM {suggestion.usual}.
          </div>
        </div>
      )}

      {/* Recent lessons */}
      <section>
        <div
          className="text-[10.5px] font-semibold uppercase mb-2"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Recent lessons
        </div>
        <div
          className="rounded-[12px] border divide-y"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
        >
          {charges.length === 0 ? (
            <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              No lessons yet.
            </div>
          ) : (
            charges.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2.5"
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-medium truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {c.studentName || 'Lesson'}
                  </div>
                  <div className="text-[11px] mono" style={{ color: 'var(--ink-3)' }}>
                    {formatShortDate(c.date)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="mono tnum text-[13px] font-medium"
                    style={{ color: 'var(--ink)' }}
                  >
                    −RM {c.amount.toFixed(0)}
                  </div>
                  <div className="mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                    bal {formatRM(c.balanceAfter)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Top-up history */}
      <section>
        <div
          className="text-[10.5px] font-semibold uppercase mb-2"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Top-ups
        </div>
        <div
          className="rounded-[12px] border divide-y"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
        >
          {topUps.length === 0 ? (
            <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              No top-ups yet.
            </div>
          ) : (
            topUps.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2.5"
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-medium"
                    style={{ color: 'var(--ink)' }}
                  >
                    Top-up
                  </div>
                  <div className="text-[11px] mono" style={{ color: 'var(--ink-3)' }}>
                    {formatShortDate(t.date)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="mono tnum text-[13px] font-medium"
                    style={{ color: 'var(--good)' }}
                  >
                    +RM {t.amount.toFixed(0)}
                  </div>
                  <div className="mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                    bal {formatRM(t.balanceAfter)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Footer */}
      <div
        className="text-[11.5px] text-center pt-3 pb-6"
        style={{ color: 'var(--ink-3)' }}
      >
        Questions? Contact your coach.
      </div>
    </div>
  );
}
```

- [ ] **Step 4.4: Lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors. Build should emit a new route entry for `/portal/[token]`.

- [ ] **Step 4.5: Commit**

```bash
git add src/app/portal/layout.tsx src/app/portal/[token]/page.tsx src/app/portal/[token]/not-found.tsx
git commit -m "portal: add public /portal/[token] page (server component, Paper & Ink)"
```

---

## Task 5: "Share portal link" button in the wallet detail panel

Adds the coach-side entry point. Client-side handler generates the token on first click, writes both docs, and copies the URL.

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx:330-521`

- [ ] **Step 5.1: Update imports at the top of `payments/page.tsx`**

Open `src/app/dashboard/payments/page.tsx`. Find the `firebase/firestore` import block at lines 4–19. Add `setDoc` to the named imports (keeping alphabetical-ish order unchanged in the file — just insert it cleanly). The block becomes:

```ts
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  setDoc,
  increment,
  Firestore,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
```

Then add the nanoid import just below the firestore imports (a new line under line 19):

```ts
import { nanoid } from 'nanoid';
```

Then, just below all the imports and above the first component, add the portal URL constant:

```ts
const PORTAL_BASE_URL = 'https://coach-simplify.com';
```

- [ ] **Step 5.2: Add the handler inside `WalletDetailBody`**

Inside the `WalletDetailBody` component (starts around line 240), just above `return (` (around line 330), add:

```ts
const [sharingPortal, setSharingPortal] = useState(false);

const handleSharePortalLink = async () => {
  if (!db) return;
  if (wallet.archived) return;
  setSharingPortal(true);
  try {
    let token = wallet.portalToken;
    if (!token) {
      token = nanoid(10);
      const firestore = db as Firestore;
      await setDoc(doc(firestore, 'walletPortalTokens', token), {
        coachId,
        walletId: wallet.id,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(firestore, 'coaches', coachId, 'wallets', wallet.id), {
        portalToken: token,
        updatedAt: serverTimestamp(),
      });
    }
    const url = `${PORTAL_BASE_URL}/portal/${token}`;
    await navigator.clipboard?.writeText(url);
    showToast('Portal link copied', 'success');
  } catch {
    showToast('Failed to generate portal link', 'error');
  } finally {
    setSharingPortal(false);
  }
};
```

- [ ] **Step 5.3: Add the button in the Actions grid**

Still in `WalletDetailBody`, find the Actions grid (around lines 362–370):

```tsx
{/* Actions */}
<div className="grid grid-cols-2 gap-2">
  <Btn variant="primary" onClick={onTopUp}>
    <IconArrowUp size={13} /> Top up
  </Btn>
  <Btn variant="outline" onClick={onAdjust}>
    Adjust
  </Btn>
</div>
```

Add a "Share portal link" button underneath the grid (outside it, so it gets full width and reads as a secondary action). Replace the block above with:

```tsx
{/* Actions */}
<div className="grid grid-cols-2 gap-2">
  <Btn variant="primary" onClick={onTopUp}>
    <IconArrowUp size={13} /> Top up
  </Btn>
  <Btn variant="outline" onClick={onAdjust}>
    Adjust
  </Btn>
</div>
{!wallet.archived && (
  <Btn
    variant="outline"
    full
    onClick={handleSharePortalLink}
    disabled={sharingPortal}
  >
    {sharingPortal ? 'Copying…' : 'Share portal link'}
  </Btn>
)}
```

- [ ] **Step 5.4: Lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 5.5: Commit**

```bash
git add src/app/dashboard/payments/page.tsx
git commit -m "portal: add 'Share portal link' button to wallet detail panel"
```

---

## Task 6: Manual QA in the browser

No automated tests in this repo. Verify every edge case from the spec, record what you tried. If anything fails, fix it, re-run the section, commit, and re-verify.

**Prereq:** The dev server uses live Firestore — make sure `.env.local` contains Admin SDK credentials (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`). If they're missing, the portal page will 500. They're already set on Vercel, so production works regardless.

- [ ] **Step 6.1: Run the dev server**

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000`, no errors in console.

- [ ] **Step 6.2: QA — sharing flow**

1. Log in as the test coach (`testcoach@example.com` / `Test123!`).
2. Navigate to `/dashboard/payments`.
3. Pick any non-archived wallet. Click "Share portal link".
4. Verify: toast "Portal link copied" appears. Paste into a text editor — URL format `https://coach-simplify.com/portal/<10-char-token>`.
5. Click again. Verify: same token, same URL, toast again.
6. In the Firebase Console, navigate to Firestore → `walletPortalTokens` collection. Verify a doc exists with the matching token and the correct `coachId` / `walletId`.
7. Navigate to the wallet's doc under `coaches/{coachId}/wallets/{walletId}`. Verify `portalToken` field matches.

- [ ] **Step 6.3: QA — rendering the happy path**

Still on `/dashboard/payments`, pick the wallet you just shared. Note its token from the Firebase Console (or copy from Step 6.2 again).

Since you're dev-running, swap the clipboard URL's domain from `coach-simplify.com` to `localhost:3000` and open it:

```
http://localhost:3000/portal/<token>
```

Expected page contents:
- Coach name at top, wallet name large below
- Balance card shows current balance + status chip
- "Next lesson ≈ RM X" line if the wallet has active bookings
- Recent lessons section with the wallet's charges (student name shown if wallet has ≥2 students, hidden otherwise)
- Top-ups section with the wallet's top-ups
- Footer "Questions? Contact your coach."

- [ ] **Step 6.4: QA — each wallet status**

Pick (or set up) wallets covering each status, open each in the portal:

- **Healthy** (`balance ≥ 2 × rate`): status chip green "Healthy", no suggestion card.
- **Low** (`rate ≤ balance < 2 × rate`): chip amber "Low", no suggestion card.
- **Empty** (`0 ≤ balance < rate`): chip amber "Empty". If the wallet has prior top-ups, **suggestion card appears** with amber border; otherwise it doesn't.
- **Owing** (`balance < 0`): chip red "Owing", balance number is red. If wallet has prior top-ups, **suggestion card appears** with red border; suggestion amount > usual (e.g., usual 500, balance −30 → 530).
- **Tab mode** (`wallet.tabMode === true`): chip grey "Tab mode". No "next lesson ≈" line. No suggestion card regardless of balance.

- [ ] **Step 6.5: QA — empty states**

- Newly-created wallet with no transactions at all: "No lessons yet." and "No top-ups yet." empty states render.
- Wallet with only top-ups and no charges: "No lessons yet." empty state; top-ups populated.
- Wallet with only charges and no top-ups: charges populated; "No top-ups yet." empty state; **suggestion card hidden** even if status is empty/owing (no anchor amount).

- [ ] **Step 6.6: QA — 404 paths**

- Open `http://localhost:3000/portal/notarealtoken123`. Expected: "Link no longer active" page.
- Archive the wallet you've been testing (from the detail panel). Reload the portal URL. Expected: "Link no longer active" page.
- Unarchive for further testing.

- [ ] **Step 6.7: QA — single vs multi-student wallet**

- Multi-student wallet: charge rows display the student's name (e.g., "Jake").
- Single-student wallet: charge rows display "Lesson" (generic label, no name).

- [ ] **Step 6.8: QA — mobile viewport**

In DevTools, toggle mobile emulation (iPhone 14 or similar). Verify the portal page is comfortable to read on a 390px-wide viewport: nothing horizontally scrolls, font sizes readable, cards fill available width.

- [ ] **Step 6.9: If any issue found, fix it and commit**

For each fix:
```bash
git add <files>
git commit -m "portal: fix <description>"
```

Re-run the failing QA step after each fix.

- [ ] **Step 6.10: Final lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors, no warnings introduced.

- [ ] **Step 6.11: Push**

```bash
git push origin main
```

Expected: push succeeds, Vercel picks up the deploy. After the Vercel build finishes, repeat Step 6.3 using the live URL (`https://coach-simplify.com/portal/<token>`) to confirm production-mode works (Admin SDK env vars populated, token lookup resolves).

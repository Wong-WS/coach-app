# Landing Page Paper & Ink Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/` in the Paper & Ink visual system used by the rest of the app, and correct landing-page content that no longer reflects product reality (fake testimonial, unshipped promised features, aspirational trial copy).

**Architecture:** Three files modified, two small new components added. All styling reuses `var(--*)` tokens from `globals.css`. All UI primitives come from `@/components/paper/*`. No new dependencies, no global style changes, no routing changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS 4 with CSS variables, existing `@/components/paper` primitives (`Btn`, `Chip`, `Avatar`, `Segmented`, `Icons`).

**Important notes for the implementer:**
- This is visual/CSS work. There is no test harness for layout, so verification is manual: run the dev server, view the page in a browser, and confirm against the acceptance criteria in each task. Don't skip the visual checks.
- The user prefers a commit + push after every completed task. Each task ends with a `git commit && git push` step. If `push` fails because the upstream isn't tracked, run `git push -u origin <branch>` once.
- The landing page must stay a Server Component. Only interactive leaf components (billing toggle in `PricingSection.tsx`) need `'use client'`.

---

## File Structure

```
src/app/
├── page.tsx                               # Full rewrite — nav, hero, features, founder note, FAQ, CTA, footer
└── _components/
    ├── PricingSection.tsx                 # Reskin + content fixes
    ├── OverviewPreview.tsx                # NEW — static Overview mock for the hero
    └── FounderNote.tsx                    # NEW — editorial "why I built this" card
```

Nothing else is touched. No changes to `globals.css`, no changes to `@/components/paper/*`, no changes to auth or routing.

Spec this plan implements: `docs/superpowers/specs/2026-04-24-landing-page-paper-ink-redesign.md`.

---

## Task 1: Build `OverviewPreview.tsx` — the hero's dashboard mock

**Files:**
- Create: `src/app/_components/OverviewPreview.tsx`

**What this is:** A static, self-contained visual replica of the real dashboard's Overview page. No data fetching, no hooks, no theme toggle. It lives inside the hero on `/` and replaces the current fabricated glass dashboard mock.

- [ ] **Step 1: Create the file**

```tsx
// src/app/_components/OverviewPreview.tsx
import { IconCheck } from '@/components/paper';

interface MockClass {
  time: string;
  name: string;
  location: string;
  balance: number;
}

const MOCK_CLASSES: MockClass[] = [
  { time: '09:00', name: 'Junior squad', location: 'Court 2', balance: 320 },
  { time: '16:30', name: 'Aiden · 1-on-1', location: 'Court 1', balance: 240 },
  { time: '19:00', name: 'Adult intermediate', location: 'Court 3', balance: 180 },
];

export function OverviewPreview() {
  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--line)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Faux topbar — matches dashboard/layout.tsx */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--line)' }}
      >
        <div
          className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center font-bold text-[11px]"
          style={{
            background: 'var(--ink)',
            color: 'var(--bg)',
            letterSpacing: '-0.5px',
          }}
        >
          C
        </div>
        <span className="text-[13px] font-semibold" style={{ letterSpacing: '-0.2px' }}>
          Coach
        </span>
        <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>
          /demo-coach
        </span>
        <div className="flex-1" />
        <div
          className="w-[20px] h-[20px] rounded-full"
          style={{ background: 'var(--line)' }}
          aria-hidden="true"
        />
      </div>

      {/* Body */}
      <div className="p-5">
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: 'var(--ink-4)' }}
        >
          Today · Friday
        </div>
        <h3
          className="mt-1 text-[20px] font-semibold"
          style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
        >
          3 classes today
        </h3>

        <ul className="mt-4 space-y-2">
          {MOCK_CLASSES.map((c) => (
            <li
              key={c.time}
              className="flex items-center gap-3 rounded-[10px] border px-3 py-2.5"
              style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
            >
              <span
                className="mono tnum text-[12.5px] font-medium w-[42px]"
                style={{ color: 'var(--ink-2)' }}
              >
                {c.time}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-semibold truncate"
                  style={{ color: 'var(--ink)' }}
                >
                  {c.name}
                </p>
                <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                  {c.location}
                </p>
              </div>
              <span
                className="mono tnum text-[11.5px] font-medium rounded-lg px-2 py-0.5"
                style={{
                  color: 'var(--good)',
                  background: 'var(--good-soft)',
                  letterSpacing: '-0.01em',
                }}
              >
                RM {c.balance}
              </span>
            </li>
          ))}
        </ul>

        <div
          className="mt-4 flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5"
          style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
              Mark today as done
            </p>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              Lessons logged, wallets charged.
            </p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            <IconCheck size={13} sw={2.2} />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file builds**

Run: `npm run lint -- src/app/_components/OverviewPreview.tsx`

Expected: zero errors, zero warnings.

If `npm run lint` can't scope to a single file in this repo, run `npm run lint` over the whole project and confirm no new warnings are introduced.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/OverviewPreview.tsx
git commit -m "landing: add OverviewPreview static mock component

Replaces the fabricated glass dashboard preview on the landing page
hero. Matches the real dashboard shell (topbar, card style, buttons)
using Paper & Ink tokens. Demo data only — no fake revenue figures.
"
git push
```

---

## Task 2: Build `FounderNote.tsx` — editorial "why I built this" card

**Files:**
- Create: `src/app/_components/FounderNote.tsx`

**What this is:** Replaces the fake "Coach Aiden" testimonial with a first-person founder note. Uses `Avatar` from `@/components/paper`.

- [ ] **Step 1: Create the file**

```tsx
// src/app/_components/FounderNote.tsx
import { Avatar } from '@/components/paper';

export function FounderNote() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <div
        className="rounded-[14px] border p-8 md:p-10"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: 'var(--ink-4)' }}
        >
          Why I built this
        </div>
        <p
          className="mt-4 text-[18px] md:text-[19px] leading-relaxed"
          style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
        >
          I coach on weekends and spent every Sunday buried in a spreadsheet —
          who paid, who&rsquo;s on which package, who&rsquo;s coming next week.
          Nobody was going to build this for me, so I built it for myself. Now
          it runs my coaching business while I&rsquo;m on the court.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Avatar name="Wei Siang" size={36} />
          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
              Wei Siang
            </p>
            <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
              Founder, Coach
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify the file builds**

Run: `npm run lint`

Expected: zero new errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/FounderNote.tsx
git commit -m "landing: add FounderNote component

Replaces the fabricated testimonial on the landing page. First-person,
honest, uses the Paper Avatar primitive. Copy lives inline — edit the
component directly to tweak.
"
git push
```

---

## Task 3: Rewrite `src/app/page.tsx` — nav, hero, features, founder note, FAQ, CTA, footer

**Files:**
- Rewrite: `src/app/page.tsx` (entire file)

**What this is:** Full page replacement. Swaps the glassmorphism landing for the Paper & Ink version described in the spec. Wires in the two new components from Tasks 1 and 2.

- [ ] **Step 1: Replace the entire file contents**

Overwrite `src/app/page.tsx` with:

```tsx
import Link from 'next/link';
import { RedirectIfSignedIn } from '@/lib/auth-redirect';
import {
  Btn,
  Chip,
  IconCalendar,
  IconWallet,
  IconCheck,
  IconPlus,
} from '@/components/paper';
import { PricingSection } from './_components/PricingSection';
import { OverviewPreview } from './_components/OverviewPreview';
import { FounderNote } from './_components/FounderNote';

export default function Home() {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <RedirectIfSignedIn />

      {/* Nav */}
      <nav
        className="sticky top-0 z-20 border-b"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center font-bold text-[13px]"
              style={{
                background: 'var(--ink)',
                color: 'var(--bg)',
                letterSpacing: '-0.5px',
              }}
            >
              C
            </div>
            <span
              className="text-[15px] font-semibold"
              style={{ letterSpacing: '-0.2px' }}
            >
              CoachSimplify
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'FAQ', href: '#faq' },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--line)]"
                style={{ color: 'var(--ink-2)' }}
              >
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden md:inline-flex rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--line)]"
              style={{ color: 'var(--ink-2)' }}
            >
              Log in
            </Link>
            <Link href="/signup">
              <Btn variant="primary" size="md">
                Start free
              </Btn>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-20 md:pb-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Chip tone="good">Free during early access</Chip>
            <h1
              className="mt-5 text-[40px] leading-[1.05] font-semibold md:text-[56px] md:leading-[1.02]"
              style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
            >
              Run your coaching business, not your spreadsheet.
            </h1>
            <p
              className="mt-5 max-w-xl text-[16px] md:text-[17px] leading-relaxed"
              style={{ color: 'var(--ink-2)' }}
            >
              Schedule recurring classes, track student wallets, and get paid —
              without the WhatsApp chaos. Made for coaches who&rsquo;d rather be
              on the court.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/signup">
                <Btn variant="primary" size="lg">
                  Start free
                </Btn>
              </Link>
              <a href="#features" className="inline-flex">
                <Btn variant="ghost" size="lg">
                  See how it works →
                </Btn>
              </a>
            </div>
            <p
              className="mono mt-4 text-[12px]"
              style={{ color: 'var(--ink-3)' }}
            >
              Free during early access · no card required
            </p>
          </div>

          <div className="lg:col-span-5">
            <OverviewPreview />
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="scroll-mt-16 border-t"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2
            className="max-w-2xl text-[30px] md:text-[36px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Three things you do every week. Now they take five minutes.
          </h2>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-0 border-t md:border-l"
            style={{ borderColor: 'var(--line)' }}
          >
            {[
              {
                icon: <IconCalendar size={18} />,
                t: 'Recurring schedule',
                d: 'Define a weekly class once. Every Tuesday after that runs on rails — including reschedules and one-off cancellations.',
              },
              {
                icon: <IconWallet size={18} />,
                t: 'Wallet-based billing',
                d: 'Top up a student (or family) once. Each lesson auto-charges the wallet. No monthly invoicing, no payment reminders.',
              },
              {
                icon: <IconCheck size={18} sw={2} />,
                t: 'Mark-as-done',
                d: 'Tap once. Lesson logged, wallet charged, history updated. Works on the court, from your phone.',
              },
            ].map((f) => (
              <div
                key={f.t}
                className="p-7 md:p-8 border-b md:border-b-0 md:border-r last:border-r-0"
                style={{ borderColor: 'var(--line)' }}
              >
                <div
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border"
                  style={{
                    background: 'var(--bg)',
                    borderColor: 'var(--line)',
                    color: 'var(--ink)',
                  }}
                >
                  {f.icon}
                </div>
                <h3
                  className="mt-4 text-[17px] font-semibold"
                  style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
                >
                  {f.t}
                </h3>
                <p
                  className="mt-2 text-[14px] leading-relaxed"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {f.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder note */}
      <div style={{ borderTop: '1px solid var(--line)' }}>
        <FounderNote />
      </div>

      {/* Pricing */}
      <div
        className="border-t"
        style={{ borderColor: 'var(--line)' }}
      >
        <PricingSection />
      </div>

      {/* FAQ */}
      <section
        id="faq"
        className="scroll-mt-16 border-t"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2
            className="text-[30px] md:text-[36px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Frequently asked questions
          </h2>
          <div className="mt-10 space-y-2">
            {[
              {
                q: 'Do I need a card to sign up?',
                a: 'No. CoachSimplify is free to use while we’re in early access. No card, no trial period, no cancellation. When we launch paid plans, early-access coaches will have 14 days to decide.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. One click from your settings. No cancellation fees, no contract.',
              },
              {
                q: 'Is my data safe?',
                a: 'Your data is stored on Google Firebase with encryption at rest and in transit. Only you can access your coaching data.',
              },
            ].map((f) => (
              <details
                key={f.q}
                className="group rounded-[10px] border p-5"
                style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
              >
                <summary
                  className="flex cursor-pointer items-center justify-between gap-4 text-[14px] font-semibold [&::-webkit-details-marker]:hidden"
                  style={{ color: 'var(--ink)' }}
                >
                  {f.q}
                  <span
                    className="transition-transform group-open:rotate-45"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    <IconPlus size={16} />
                  </span>
                </summary>
                <p
                  className="mt-3 text-[14px] leading-relaxed"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section
        className="border-t"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div
            className="rounded-[14px] p-10 md:p-14 text-center"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            <h3
              className="text-[28px] md:text-[36px] font-semibold"
              style={{ letterSpacing: '-0.02em' }}
            >
              Your weekly admin, gone by Sunday night.
            </h3>
            <p
              className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed"
              style={{ color: 'var(--ink-4)' }}
            >
              Free during early access. Set up in under 10 minutes.
            </p>
            <Link
              href="/signup"
              className="mt-7 inline-flex items-center justify-center rounded-[8px] px-5 py-3 text-[14px] font-semibold transition-colors"
              style={{ background: 'var(--bg)', color: 'var(--ink)' }}
            >
              Start free →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div
            className="flex flex-col items-start gap-4 text-[13px] md:flex-row md:items-center md:justify-between"
            style={{ color: 'var(--ink-3)' }}
          >
            <p>© 2026 CoachSimplify · Built in Malaysia</p>
            <div className="flex items-center gap-5">
              <Link
                href="/login"
                className="transition-colors"
                style={{ color: 'var(--ink-3)' }}
              >
                Log in
              </Link>
              <a
                href="mailto:weisiangwong@gmail.com"
                className="transition-colors"
                style={{ color: 'var(--ink-3)' }}
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Run the typecheck and linter**

Run: `npm run lint`

Expected: zero errors. If it complains about unused imports, remove them — the rewrite above should import only what it uses.

- [ ] **Step 3: Boot the dev server and visually verify**

Run: `npm run dev` (background) and open `http://localhost:3000/`.

Verify by eye:
- Page background is warm off-white (`#faf9f6`), not the old slate-50 with gradient blobs.
- Nav sticks to the top with a hairline bottom border; "C" badge is ink-filled.
- Hero is left-aligned on desktop, with the OverviewPreview mock to the right. Stacks on mobile.
- "Free during early access" chip appears above the headline.
- Headline is ink black, no gradient span.
- Features section shows three cards separated by hairline dividers (no floating blurred cards, no gradient icon chips). Icons sit in bordered squares.
- Founder note appears once, centered, with your initials in an Avatar.
- Pricing section still renders (Task 4 hasn't reskinned it yet — that's expected here).
- FAQ uses thin-bordered `<details>` with `+` → `×` rotation on open.
- CTA at the bottom is a black ink block (not a blue gradient).
- Footer uses hairline top border, muted text.

Also click:
- "Start free" in nav → `/signup` loads.
- "See a live example" in hero → `/test-coach` loads (or 404s if the test slug isn't up; that's OK for now, we'll revisit in Task 5).
- Each FAQ item expands and collapses.

Stop the dev server (`Ctrl+C`) when done.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "landing: rewrite page in Paper & Ink theme

Replaces the glassmorphism landing page with the app's warm off-white
ink-on-paper visual system. Hero is now left-aligned with the new
OverviewPreview mock on the right. Replaces the fake testimonial with
the FounderNote. Updates FAQ trial copy to reflect early-access status.
CTA block is ink-on-paper instead of a blue gradient. All surfaces use
var(--*) tokens so dark mode flips automatically via the existing
.dark class on <html>.
"
git push
```

---

## Task 4: Reskin `PricingSection.tsx` + content fixes

**Files:**
- Rewrite: `src/app/_components/PricingSection.tsx` (entire file)

**What this is:** Visual reskin to Paper & Ink + content corrections: remove the "Waitlist management (Soon)" feature, keep "Students & parents portal (Soon)", update trial copy everywhere, rework the highlight treatment, drop gradient CTAs.

- [ ] **Step 1: Replace the entire file contents**

Overwrite `src/app/_components/PricingSection.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Btn, Chip, Segmented, IconCheck, IconSparkle } from '@/components/paper';

type Billing = 'monthly' | 'yearly';

interface Feature {
  label: string;
  soon?: boolean;
}

interface Plan {
  id: 'starter' | 'pro' | 'lifetime';
  name: string;
  tagline: string;
  features: Feature[];
  cta: string;
  ctaVariant: 'primary' | 'outline' | 'accent';
  badge?: string;
  highlight?: boolean;
  lifetime?: boolean;
  monthlyPrice?: number;
  oneTimePrice?: number;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Just getting organised.',
    monthlyPrice: 39,
    ctaVariant: 'outline',
    features: [
      { label: 'Up to 15 active students' },
      { label: 'Recurring weekly classes' },
      { label: 'Multiple lesson locations' },
      { label: 'Wallet top-ups & auto-charge' },
      { label: 'Linked family wallets (siblings & parents)' },
      { label: 'Reschedule or cancel single sessions' },
      { label: 'Lesson history & notes' },
      { label: 'Human support' },
    ],
    cta: 'Try Starter free',
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'Most popular',
    tagline: 'For full-time coaches.',
    monthlyPrice: 99,
    ctaVariant: 'primary',
    features: [
      { label: 'Unlimited active students' },
      { label: 'Recurring weekly classes' },
      { label: 'Multiple lesson locations' },
      { label: 'Wallet top-ups & auto-charge' },
      { label: 'Linked family wallets (siblings & parents)' },
      { label: 'Reschedule or cancel single sessions' },
      { label: 'Lesson history & notes' },
      { label: 'Bulk mark-as-done for group classes' },
      { label: 'Students & parents portal', soon: true },
      { label: 'Income dashboard with projections' },
      { label: 'Priority human support' },
    ],
    highlight: true,
    cta: 'Try Pro free',
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    tagline: 'Pay once. Use forever.',
    oneTimePrice: 1499,
    lifetime: true,
    ctaVariant: 'accent',
    features: [
      { label: 'Everything in Pro' },
      { label: 'All future features included' },
      { label: 'Lock in today’s price' },
      { label: 'Direct line to the founder' },
    ],
    cta: 'Get lifetime access',
  },
];

// Yearly = 2 months free → annual price = 10 × monthly
const YEARLY_MULTIPLIER = 10;

const BILLING_OPTIONS = [
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'yearly' as const, label: 'Yearly · save 2 months' },
];

export function PricingSection() {
  const [billing, setBilling] = useState<Billing>('monthly');

  const displayPrice = (monthly: number) =>
    billing === 'monthly' ? monthly : Math.round((monthly * YEARLY_MULTIPLIER) / 12);
  const yearlyTotal = (monthly: number) => monthly * YEARLY_MULTIPLIER;
  const yearlySavings = (monthly: number) => monthly * 2;

  return (
    <section id="pricing" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Chip tone="good">Free during early access · no card required</Chip>
          <h2
            className="mt-5 text-[30px] md:text-[36px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Focus on what you do best.
          </h2>
          <p
            className="mt-4 text-[15px] leading-relaxed"
            style={{ color: 'var(--ink-2)' }}
          >
            We&rsquo;ll handle the rest — every student, every balance, every
            ringgit.
          </p>
        </div>

        <div className="mt-10 flex items-center justify-center">
          <Segmented
            options={BILLING_OPTIONS}
            value={billing}
            onChange={(v) => setBilling(v)}
          />
        </div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {PLANS.map((plan) => {
            const isLifetime = !!plan.lifetime;
            const isHighlight = !!plan.highlight;
            return (
              <div
                key={plan.id}
                className="relative flex flex-col rounded-[14px] p-7 md:p-8"
                style={{
                  background: 'var(--panel)',
                  border: `${isHighlight ? '2px' : '1px'} solid ${
                    isHighlight ? 'var(--ink)' : 'var(--line)'
                  }`,
                }}
              >
                {plan.badge && (
                  <span
                    className="absolute top-5 right-5 inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                    style={{
                      background: 'var(--ink)',
                      color: 'var(--bg)',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {plan.badge}
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <h3
                    className="text-[20px] font-semibold"
                    style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
                  >
                    {plan.name}
                  </h3>
                  {isLifetime && (
                    <Chip tone="accent">
                      <IconSparkle size={10} />
                      One-time
                    </Chip>
                  )}
                </div>
                <p
                  className="mt-1 text-[13.5px]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  {plan.tagline}
                </p>

                <div className="mt-6">
                  {isLifetime && plan.oneTimePrice !== undefined ? (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className="text-[14px] font-medium"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          RM
                        </span>
                        <span
                          className="mono tnum text-[44px] font-semibold"
                          style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
                        >
                          {plan.oneTimePrice.toLocaleString()}
                        </span>
                        <span
                          className="text-[14px]"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          once
                        </span>
                      </div>
                      <p
                        className="mt-1.5 min-h-[1.25rem] text-[12px]"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        One payment · no renewals · yours forever
                      </p>
                    </>
                  ) : plan.monthlyPrice !== undefined ? (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className="text-[14px] font-medium"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          RM
                        </span>
                        <span
                          className="mono tnum text-[44px] font-semibold"
                          style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
                        >
                          {displayPrice(plan.monthlyPrice)}
                        </span>
                        <span
                          className="text-[14px]"
                          style={{ color: 'var(--ink-3)' }}
                        >
                          / month
                        </span>
                      </div>
                      <p
                        className="mt-1.5 min-h-[1.25rem] text-[12px]"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        {billing === 'yearly' ? (
                          <>
                            RM {yearlyTotal(plan.monthlyPrice).toLocaleString()} / year ·{' '}
                            <span
                              className="font-semibold"
                              style={{ color: 'var(--good)' }}
                            >
                              save RM {yearlySavings(plan.monthlyPrice)}
                            </span>
                          </>
                        ) : (
                          ' '
                        )}
                      </p>
                    </>
                  ) : null}
                </div>

                <div className="mt-6">
                  <Link href="/signup" className="block">
                    <Btn variant={plan.ctaVariant} size="lg" full>
                      {plan.cta} →
                    </Btn>
                  </Link>
                  <p
                    className="mt-3 text-center text-[12px]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    {isLifetime
                      ? 'Lock in today’s price · refundable within 14 days of launch'
                      : 'Free during early access · no card required'}
                  </p>
                </div>

                <ul
                  className="mt-6 space-y-2.5 border-t pt-6"
                  style={{ borderColor: 'var(--line)' }}
                >
                  {plan.features.map((f, i) => (
                    <li
                      key={f.label}
                      className="flex items-start gap-2.5 text-[13.5px]"
                      style={{
                        color: i === 0 ? 'var(--ink)' : 'var(--ink-2)',
                        fontWeight: i === 0 ? 600 : 400,
                      }}
                    >
                      <span
                        className="mt-0.5 shrink-0"
                        style={{ color: 'var(--good)' }}
                      >
                        <IconCheck size={14} sw={2.2} />
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span>{f.label}</span>
                        {f.soon && <Chip tone="accent">Soon</Chip>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

Changes made vs. the old file (for reviewer sanity):

- Removed the `Waitlist management` feature from the Pro plan entirely.
- Kept `Students & parents portal` `Soon` on Pro (being built).
- Trial copy: `7-day free trial · RM 0.00 today` → `Free during early access · no card required` in the header chip and all non-Lifetime card small print.
- Lifetime card small print: now "Lock in today's price · refundable within 14 days of launch".
- Billing toggle is now the `Segmented` primitive (drops the backdrop-blur pill).
- All CTA buttons use `Btn` (`primary` for Pro, `outline` for Starter, `accent` for Lifetime). No more gradient CTAs.
- Card styling: panel bg, single hairline border (2px ink border for the highlighted Pro card instead of shadow + translate).
- "Most popular" badge pinned top-right, not overlapping the card top edge.
- Drops the lavender gradient on Lifetime — same panel bg as the others.
- All hardcoded colors (`slate-*`, `emerald-*`, `indigo-*`, `white/*`) replaced with tokens.
- `CheckIcon`, `ShieldIcon`, `SparkIcon` helper functions removed — now using `@/components/paper/Icons`.

- [ ] **Step 2: Run the typecheck and linter**

Run: `npm run lint`

Expected: zero errors.

- [ ] **Step 3: Visual verify**

Start `npm run dev` if not already running and open `http://localhost:3000/#pricing`.

Verify:
- Three cards on desktop, stacked on mobile. All three use panel bg with hairline borders.
- Pro card has a thicker ink border (not a shadow or translate). "Most popular" chip pinned top-right, not floating above the card.
- Lifetime card no longer has the lavender gradient. Just panel bg. "One-time" chip next to the name still there.
- Billing toggle is the app's segmented control (`--line` background, active pill with `--panel`).
- Clicking "Yearly" updates prices and shows "save RM X" in `--good`.
- "Waitlist management" no longer appears anywhere on the page.
- "Students & parents portal" still appears on Pro with a "Soon" chip.
- All plans show "Free during early access · no card required" under the CTA (Lifetime shows the refund line instead).
- Hover states on the CTAs are the `Btn` primitive hovers (no gradient color shifts).

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/PricingSection.tsx
git commit -m "landing: reskin PricingSection + fix content

- Remove \"Waitlist management\" — not on the roadmap.
- Keep \"Students & parents portal (Soon)\" — actively being built.
- Swap trial copy (\"7-day free trial · RM 0.00\") for \"Free during
  early access · no card required\" across all cards and headers.
- Lifetime small print updated to \"refundable within 14 days of launch\".
- Visual: replace glassmorphism with Paper & Ink tokens, drop gradient
  CTAs in favour of Btn primitives, use the Segmented billing toggle,
  move highlight from shadow/translate to a thicker ink border.
"
git push
```

---

## Task 5: Final verification pass

**Files:** none modified (unless bugs surface).

**What this is:** End-to-end check that nothing slipped — no stale colors, no dead links, dark mode works, content is correct.

- [ ] **Step 1: Grep for forbidden styling and stale copy**

Run each of these from the repo root and confirm zero matches in the touched files:

```bash
grep -En "slate-|emerald-|blue-|indigo-|violet-|bg-white/|backdrop-blur|text-transparent" \
  src/app/page.tsx src/app/_components/PricingSection.tsx \
  src/app/_components/OverviewPreview.tsx src/app/_components/FounderNote.tsx
```

Expected: no output. Any match means a hardcoded palette leaked through — replace with the matching `var(--*)` token and re-commit.

```bash
grep -En "Coach Aiden|Waitlist management|7-day free trial|RM 0.00 today|RM 0.00 due today" \
  src/app/page.tsx src/app/_components/PricingSection.tsx \
  src/app/_components/OverviewPreview.tsx src/app/_components/FounderNote.tsx
```

Expected: no output. Any match means stale content was missed.

- [ ] **Step 2: Build the production bundle**

Run: `npm run build`

Expected: build succeeds, no type errors, no new warnings related to the landing page files.

- [ ] **Step 3: Dev-server click-through**

Start `npm run dev` and at `http://localhost:3000/`:

- Click `Start free` in the nav → lands on `/signup`.
- Click `Start free` in the hero → `/signup`.
- Click `See how it works` in the hero → smooth scrolls down to the Features section.
- Click `Features`, `Pricing`, `FAQ` in the nav → smooth scrolls to the right section.
- Expand each FAQ item → content renders, `+` rotates to `×`.
- Toggle `Monthly` / `Yearly` in pricing → prices update, savings hint shows on yearly.
- Click each plan's CTA → lands on `/signup`.
- Click `Start free →` in the bottom ink CTA block → `/signup`.
- Click `Log in` in the footer → `/login`.
- Click `Contact` in the footer → opens mail client with `weisiangwong@gmail.com`.

- [ ] **Step 4: Dark mode verification**

From `/dashboard`, toggle dark mode via the moon icon in the topbar, then navigate back to `/`.

Verify:
- Background flips to the dark Paper palette (`#151412`), not to the broken hybrid state the old page had.
- All text remains legible; no light-on-light or dark-on-dark surfaces.
- OverviewPreview mock flips cleanly.
- Pricing cards, FAQ details, and the ink-on-paper CTA all render with the dark variants.

If any surface stays stuck in light mode, grep that region for hardcoded hex values and replace with tokens.

- [ ] **Step 5: Mobile viewport check**

Resize the browser to 390px wide (or use DevTools mobile mode).

Verify:
- Hero copy stacks above the OverviewPreview (not the reverse).
- Features dividers flip from vertical to horizontal correctly.
- Pricing cards stack vertically with full-width CTAs.
- Nav hides `Features/Pricing/FAQ` links and `Log in`, keeping only the logo + Start free button.
- No horizontal scroll at any point.

- [ ] **Step 6: If no changes were needed, we're done. If you had to fix something in the previous steps, commit any fixes:**

```bash
git add -A
git status  # review what changed
# only if something actually changed:
git commit -m "landing: final polish after verification pass"
git push
```

- [ ] **Step 7: Mark complete and summarise**

The landing page now:
1. Uses the Paper & Ink visual system end-to-end.
2. Replaces the fake testimonial with a real founder note.
3. Replaces the fabricated dashboard mock with a real-looking Paper-styled preview.
4. Removes the unroadmapped "Waitlist management" feature claim.
5. Updates all trial copy to match early-access reality.
6. Flips cleanly between light and dark mode via the existing global theme toggle.

Report back to the user with: (a) confirmation of the build passing, (b) a note on anything that surfaced during verification you didn't expect, (c) any open questions (e.g., if the `/test-coach` link target needs changing).

---

## Post-implementation: update NOTES.md

Append a one-line entry under `Next Session` or as a resolved note in `NOTES.md`:

```markdown
- ✅ (2026-04-24) Landing page redesigned in Paper & Ink theme. Removed fake testimonial, dropped Waitlist "Soon" claim, updated trial copy to early-access framing, replaced glass dashboard mock with OverviewPreview component.
```

Commit:

```bash
git add NOTES.md
git commit -m "notes: log landing page redesign"
git push
```

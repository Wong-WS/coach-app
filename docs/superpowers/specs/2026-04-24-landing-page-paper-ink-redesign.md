# Landing Page — Paper & Ink Redesign

**Date:** 2026-04-24
**Scope:** Rebuild `/` (landing page) to match the in-app "Paper & Ink" visual system, and correct content that no longer matches product reality.

## Context

The landing page at `src/app/page.tsx` + `src/app/_components/PricingSection.tsx` is visually and textually out of sync with the rest of the product.

**Visual mismatch.** The landing page uses vibrant blue/emerald/indigo blobs, heavy glassmorphism (`bg-white/40 backdrop-blur-xl`), gradient headlines, and rounded-3xl everywhere. The in-app UI (dashboard/layout.tsx, `globals.css`, `components/paper/*`) uses warm off-white `#faf9f6`, ink blacks, hairline borders, muted oklch accents, Inter + JetBrains Mono, 8–14px radii. The landing page is the only page not in the Paper & Ink system.

**Content inaccuracies.**
- Pro tier pricing lists "Students & parents portal" and "Waitlist management" as *Soon*. Per the 2026-04-20 audit memory, neither was on the roadmap. Parents portal is now being built and keeps its *Soon* tag. Waitlist is not, and must be removed.
- Fake testimonial ("Coach Aiden, Tennis, Petaling Jaya, 28 students") on a product with zero paying users.
- "Parents top up once" copy overstates functionality — the wallet system is coach-managed; coaches top up on students' behalf.
- Hero dashboard mock shows fabricated stats and a layout that bears no resemblance to the real Overview page.
- "7-day free trial · RM 0.00 today" trial copy appears in 3+ places but there's no Stripe flow live. Product is in early access, no paid plans yet.

**Positioning note.** Beta coaches sign up directly via `/signup`; the landing page is not the active acquisition funnel. Goal is "brochureware that's accurate and on-brand," not conversion-optimised for beta recruitment.

## Goals

1. Visually coherent with the app — a visitor moving from `/` to `/dashboard` should not feel they've changed products.
2. Every claim on the page is true today. No fabricated testimonials, no promised features that aren't shipped or in active development.
3. Minimal surface: only `page.tsx`, `PricingSection.tsx`, and two small new components. No changes to global styles, primitives, or routing.

## Non-goals

- Conversion optimisation for beta coaches. (They bypass this page.)
- Rethinking pricing tiers, copy, or positioning. (Pricing structure stays; content is trimmed.)
- Any new design primitives or dependencies. Reuse `@/components/paper/*`.
- SEO, analytics, or metadata work.

## Visual system

The landing page uses the existing Paper & Ink tokens from `globals.css`. No bespoke landing-only palette.

- **Background:** `var(--bg)` (`#faf9f6`). No blobs, gradients, or blur effects.
- **Surfaces:** `var(--panel)` with 1px `var(--line)` borders. Radii `10–14px`.
- **Ink:** `var(--ink)` headlines, `var(--ink-2)` body, `var(--ink-3)` meta, `var(--ink-4)` micro-labels.
- **Accents:** used sparingly — `var(--accent)` for no more than one or two highlights, `var(--good)` for the "Free during early access" chip.
- **Type:** Inter throughout. JetBrains Mono (`.mono` utility) for numbers, times, URLs, and the slug in the mock's topbar.
- **Headlines:** tight tracking (`letter-spacing: -0.02em`). Hero drops from `text-7xl` to `text-5xl md:text-6xl`. No gradient text.
- **Motion:** none beyond native `<details>` expand.
- **Components:** reuse `Btn`, `Chip`, `Avatar`, `Segmented`, and `@/components/paper/Icons` directly. Where no existing primitive fits, inline the same token-based styles.

Reference surfaces to match against: `dashboard/layout.tsx` topbar and sidebar, the real Overview's Today's Classes card, and the Students list.

## Page structure

Top to bottom:

1. **Nav** — hairline bottom border, panel bg, "C" logo ink-filled, links restyled without backdrop-blur pill.
2. **Hero** — two-column on `lg+` (copy left, Overview mock right); stacked on mobile.
3. **Features** — 3 cards with hairline dividers, ink icons on panel bg.
4. **Founder note** — single centered editorial card, replaces testimonial.
5. **Pricing** — 3 tiers, Paper-themed, content fixes applied.
6. **FAQ** — hairline-bordered `<details>`, ink `+` icons.
7. **CTA** — ink-on-paper panel (not blue gradient).
8. **Footer** — same content, `var(--line)` divider, ink-2 text.

Cut: the standalone social-proof testimonial section (replaced by section 4).

## Hero

**Left column.**

- Small chip: `Chip tone="good"` → "Free during early access". Replaces the current pulse-dot "Built for independent coaches" pill.
- Headline (unchanged copy, restyled): "Run your coaching business, not your spreadsheet." Rendered in `var(--ink)`, size `text-5xl md:text-6xl`, tight tracking, no gradient span.
- Subhead (lightly tightened): "Schedule recurring classes, track student wallets, and get paid — without the WhatsApp chaos. Made for coaches who'd rather be on the court." `var(--ink-2)`.
- CTAs: primary `Btn variant="primary" size="lg"` → "Start free" (links to `/signup`). Secondary ghost link → "See a live example" (links to `/test-coach`).
- Meta line below buttons, mono font: `Free during early access · no card required`. `var(--ink-3)`.

**Right column.** Pixel-accurate Overview mock — see "Dashboard mock" below.

**Mobile stack order.** Chip → headline → subhead → CTAs → meta → mock (below the CTAs, not above).

## Dashboard mock

A self-contained, static component: `src/app/_components/OverviewPreview.tsx`. No data fetching, no hooks beyond layout state.

**Frame.** Faux app window styled like the real dashboard shell — `var(--panel)` bg, 1px `var(--line)` border, `--radius-lg` corners. Top strip mimics the real `DashboardContent` topbar: ink-filled "C" badge, "Coach" label, mono `/demo-coach` slug in `var(--ink-3)`. No browser chrome (no traffic lights, no URL bar).

**Body.** Single-column content:

- Small greeting line: "Today · Friday" in `var(--ink-4)` uppercase, tracking widened.
- "3 classes today" headline in `var(--ink)`.
- A Today's Classes list matching the real app's card shape — 3 entries:
  - `09:00` · "Junior squad · Court 2"
  - `16:30` · "Aiden · 1-on-1 · Court 1"
  - `19:00` · "Adult intermediate · Court 3"
  Each row: time in mono on the left, name + location in `--ink`/`--ink-3`, a small muted `• paid` or balance chip on the right using `BalancePill` style.
- One compact "Mark as done" row at the bottom: primary ink button + a one-line explainer. No fake revenue numbers anywhere.

**Design constraint.** All displayed data reads as *demo* — coach name is "Demo Coach", students have generic first names. No RM figures in the preview except on the balance pill (e.g., `RM 240`), which is incidental rather than a headline stat.

**Responsiveness.** On mobile, the mock sits below the hero CTAs at full width, slightly scaled down. On desktop it anchors the right column at roughly 45% of the hero width.

## Features

Three cards, restyled:

- No gradient icon chips. Each icon rendered in `var(--ink)` on `var(--bg)` inside a small `--radius` square with a `var(--line)` border. Matches the app's icon treatment.
- Hairline dividers between cards (vertical on desktop, horizontal on mobile) rather than floating blurred cards. Equal heights.
- Copy:
  - "Recurring schedule" — body unchanged.
  - "Wallet billing" → rename to **"Wallet-based billing"**, body rewritten: *"Top up a student (or family) once. Each lesson auto-charges the wallet. No monthly invoicing, no payment reminders."*
  - "Mark-as-done" — body unchanged.

## Founder note

Replaces the entire social-proof section. Single centered card:

- Uppercase micro-label: `WHY I BUILT THIS`, `var(--ink-4)`, tracking-widest.
- Body paragraph, first person:
  > "I coach on weekends and spent every Sunday buried in a spreadsheet — who paid, who's on which package, who's coming next week. Nobody was going to build this for me, so I built it for myself. Now it runs my coaching business while I'm on the court."
- Signature row: `Avatar` with the founder's initials in ink, name, role "Founder, Coach" in `var(--ink-3)`. No fabricated student count or revenue stat.
- Card styling: `var(--panel)` bg, hairline `var(--line)` border, `--radius-lg` corners, no blur, modest padding.
- Kept in its own component: `src/app/_components/FounderNote.tsx`. Copy lives as a prop or inline default so the user can edit before shipping.

## Pricing

Structural layout stays 3 tiers (Starter / Pro / Lifetime). Visual reskin + targeted content fixes.

**Visual changes.**

- Drop green shadow on Pro and lavender gradient on Lifetime. All cards use `var(--panel)` with `var(--line)` border. Highlighted card (Pro) gets a 1px `var(--ink)` border instead of shadow lift + translate.
- "Most popular" badge: small `Chip` pinned top-right of the Pro card, not top-center overlapping the border.
- "One-time" pill on Lifetime: `Chip tone="accent"`, unchanged position.
- Billing toggle: paper-styled segmented control. Follow the pattern in `@/components/paper/Segmented.tsx` if it fits, else inline the same token-based styles. No backdrop blur.
- Feature checkmarks: `var(--good)` for all tiers (drop the indigo for Lifetime).
- CTA buttons: all tiers use `Btn` primitives — `primary` for Pro, `outline` for Starter, `accent` for Lifetime.

**Content fixes.**

- **Remove** "Waitlist management" (currently marked *Soon*) from the Pro tier feature list.
- **Keep** "Students & parents portal" (marked *Soon*) on the Pro tier — actively being built.
- **Trial language** everywhere it appears. Replace "7-day free trial · RM 0.00 today · Cancel anytime" with "Free during early access · no card required". Replace any "RM 0.00 due today" with "Free for now". Specifically:
  - Pricing section header chip
  - Each plan card's small-print line under the CTA
  - The final CTA block subhead
- Lifetime tier's "7-day money-back guarantee" line → "Lock in today's price. Refundable within 14 days of launch."

## FAQ

Keep the three questions. Restyle `<details>` with hairline `var(--line)` borders, `--radius` corners, `+` icon in ink (rotates to `×` on open).

**Content fix.** Question 1 rewrite:

- **Old:** "Will I be charged during the free trial?" — answer references a trial that doesn't exist.
- **New Q:** "Do I need a card to sign up?"
- **New A:** "No. CoachSimplify is free to use while we're in early access. No card, no trial period, no cancellation. When we launch paid plans, early-access coaches will have 14 days to decide."

Questions 2 and 3 unchanged.

## Final CTA

Replaces the blue-gradient panel.

- Background: `var(--ink)`. Text: `var(--bg)`.
- Headline: "Your weekly admin, gone by Sunday night." (unchanged).
- Subhead: "Free during early access. Set up in under 10 minutes."
- Single CTA: inverse button — `var(--bg)` bg, `var(--ink)` text, `Btn` pattern.
- Border: 1px `var(--ink)` (so it reads as a filled panel, not a card).

## Footer

Content unchanged ("© 2026 CoachSimplify · Built in Malaysia" and the Log in / Contact links). Restyled:

- Top divider: `var(--line)` instead of `white/40`.
- Text: `var(--ink-3)`, hover states to `var(--ink)`.

## Files changed

- `src/app/page.tsx` — full rewrite of nav, hero, features, founder note section, CTA, footer. Removes the standalone testimonial section and the imported `ShieldIcon`, inlined icon helpers no longer needed.
- `src/app/_components/PricingSection.tsx` — reskin (palette, radii, shadows) + content fixes (waitlist removed, trial copy updated, highlight style reworked, Lifetime card de-gradiented, button variants switched to `Btn`).
- `src/app/_components/OverviewPreview.tsx` — **new**. Static mock of the Overview page. No data deps.
- `src/app/_components/FounderNote.tsx` — **new**. Self-contained editorial card with avatar + copy.

No changes to:

- `globals.css` or any Paper token.
- `@/components/paper/*` primitives.
- Routing, auth, any data layer.

## Verification

Manual checks before shipping:

1. Open `/` in light mode, confirm every surface uses tokens from `globals.css` (no hardcoded hex or `slate-*` colors anywhere). Grep the two files for `blue-`, `emerald-`, `indigo-`, `slate-`, `white/`, `backdrop-blur` — expect zero matches.
2. Open `/` in dark mode (toggle via `/dashboard`, then navigate back). The `.dark` class is applied globally on `<html>` in `src/app/layout.tsx`, so moving the landing page onto `var(--*)` tokens means dark mode works automatically. Confirm every surface flips correctly and no hardcoded colours leak through.
3. Compare the hero mock against `/dashboard` side-by-side in a narrow browser window — the topbar, borders, typography should read as the same design family.
4. Search the codebase (`src/app/page.tsx`, `src/app/_components/`) for the removed strings: "Coach Aiden", "Waitlist management", "7-day free trial", "RM 0.00 today". Expect zero matches.
5. Click every CTA — "Start free", "See a live example", FAQ expand/collapse, pricing billing toggle, every plan CTA. Confirm no dead links.
6. Mobile viewport: hero stacks correctly, mock remains legible below the CTAs, pricing cards stack, founder note stays centered.

## Out of scope for this spec

- New hero illustrations, videos, or loom embeds.
- Email capture / waitlist form.
- Copy changes beyond the accuracy fixes listed above.

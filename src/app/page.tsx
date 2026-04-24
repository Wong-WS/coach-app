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
                a: "No. CoachSimplify is free to use while we’re in early access. No card, no trial period, no cancellation. When we launch paid plans, early-access coaches will have 14 days to decide.",
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

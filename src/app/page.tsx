import Link from 'next/link';
import { RedirectIfSignedIn } from '@/lib/auth-redirect';

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <RedirectIfSignedIn />

      {/* Vibrant background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[480px] w-[480px] rounded-full bg-blue-400 opacity-50 blur-[120px]" />
        <div className="absolute top-32 right-0 h-[420px] w-[420px] rounded-full bg-emerald-400 opacity-40 blur-[110px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-indigo-500 opacity-40 blur-[120px]" />
      </div>

      <div className="relative">
        {/* Nav */}
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white/40 px-4 py-2 backdrop-blur-xl">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white">
              C
            </div>
            <span className="font-semibold tracking-tight">CoachSimplify</span>
          </div>
          <div className="hidden items-center gap-1 rounded-2xl border border-white/30 bg-white/40 p-1.5 backdrop-blur-xl md:flex">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'FAQ', href: '#faq' },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-xl px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-white/60"
              >
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-xl px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white/40 md:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Start free
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/50 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Built for independent coaches
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold tracking-tight md:text-7xl">
            Run your coaching{' '}
            <span className="bg-gradient-to-br from-blue-600 to-emerald-500 bg-clip-text text-transparent">
              business
            </span>
            , not your spreadsheet.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600">
            Schedule recurring classes, track student wallets, and get paid —
            without the WhatsApp chaos. Made for coaches who&apos;d rather be on the
            court.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-colors hover:bg-slate-800"
            >
              Start 14-day free trial
            </Link>
            <a
              href="#features"
              className="rounded-xl border border-white/40 bg-white/50 px-6 py-3 text-sm font-semibold text-slate-700 backdrop-blur-md transition-colors hover:bg-white/70"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            No credit card required · Cancel anytime
          </p>

          {/* Glass dashboard preview */}
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="rounded-3xl border border-white/30 bg-white/30 p-3 shadow-2xl shadow-blue-900/10 backdrop-blur-2xl">
              <div className="rounded-2xl bg-white/70 p-6 backdrop-blur-xl">
                <div className="grid grid-cols-12 gap-4 text-left">
                  <div className="col-span-12 md:col-span-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      Today · Friday
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">3 classes</h3>
                    <div className="mt-4 space-y-2">
                      {[
                        { time: '09:00', name: 'Junior squad', court: 'Court 2', dot: 'bg-blue-500' },
                        { time: '16:30', name: 'Aiden · 1-on-1', court: 'Court 1', dot: 'bg-emerald-500' },
                        { time: '19:00', name: 'Adult intermediate', court: 'Court 3', dot: 'bg-indigo-500' },
                      ].map((c) => (
                        <div
                          key={c.time}
                          className="flex items-center gap-3 rounded-xl border border-white/40 bg-white/60 p-3 backdrop-blur-md"
                        >
                          <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                          <div className="flex-1">
                            <p className="text-sm font-semibold">{c.name}</p>
                            <p className="text-xs text-slate-500">{c.court}</p>
                          </div>
                          <span className="font-mono text-sm text-slate-700">{c.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-7">
                    <div className="grid grid-cols-2 gap-3">
                      <Stat label="This month" value="RM 4,820" trend="+18%" />
                      <Stat label="Active students" value="32" trend="+3" />
                      <Stat label="Wallet credit" value="RM 1,140" trend="" />
                      <Stat label="Hours coached" value="46h" trend="+4h" />
                    </div>
                    <div className="mt-3 rounded-2xl border border-white/40 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 p-5 backdrop-blur-md">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-700">
                        Mark today as done
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Auto-charges 3 wallets on tap. No invoices needed.
                      </p>
                      <div className="mt-3 inline-flex rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                        Done in one tap →
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-semibold tracking-tight md:text-4xl">
            Three things you do every week. Now they take five minutes.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              {
                icon: <CalendarIcon />,
                t: 'Recurring schedule',
                d: 'Define a weekly class once. We handle every Tuesday after that — including reschedules and one-off cancellations.',
              },
              {
                icon: <WalletIcon />,
                t: 'Wallet billing',
                d: 'Parents top up once. Each lesson auto-charges. No monthly invoicing, no awkward payment reminders.',
              },
              {
                icon: <CheckIcon />,
                t: 'Mark-as-done',
                d: 'Tap once. Lesson logged, wallet charged, history updated. Works on the court, from your phone.',
              },
            ].map((f) => (
              <div
                key={f.t}
                className="rounded-2xl border border-white/30 bg-white/50 p-6 backdrop-blur-xl"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
                  {f.icon}
                </div>
                <h3 className="mt-4 font-semibold">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Social proof */}
        <section className="mx-auto max-w-4xl px-6 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Trusted by coaches across Malaysia
          </p>
          <div className="mt-6 rounded-3xl border border-white/30 bg-white/50 p-8 backdrop-blur-xl">
            <p className="text-xl font-medium leading-relaxed text-slate-800">
              &ldquo;I dropped my Sunday admin from four hours to fifteen minutes.
              Parents see balance in real time, I stop chasing payments. It just
              runs.&rdquo;
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-emerald-400" />
              <div className="text-left">
                <p className="text-sm font-semibold">Coach Aiden</p>
                <p className="text-xs text-slate-500">
                  Tennis · Petaling Jaya · 28 students
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Simple pricing. Try it free for 14 days.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-600">
              Pay monthly, cancel anytime. Every plan includes scheduling, wallets,
              student tracking, and unlimited lessons.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            <PricingCard
              name="Starter"
              price="29"
              tagline="For coaches just getting organised."
              features={[
                'Up to 15 students',
                'Unlimited bookings & classes',
                'Wallet billing & top-ups',
                'Linked parents & siblings',
              ]}
              cta="Start free trial"
            />
            <PricingCard
              name="Pro"
              price="69"
              tagline="For growing coaching businesses."
              features={[
                'Up to 50 students',
                'Everything in Starter',
                'Priority email support',
                'Early access to new features',
              ]}
              cta="Start free trial"
              highlight
            />
            <PricingCard
              name="Business"
              price="149"
              tagline="For full-time coaches & small academies."
              features={[
                'Unlimited students',
                'Everything in Pro',
                'Custom branding (coming soon)',
                'Dedicated onboarding',
              ]}
              cta="Start free trial"
            />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-6 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mt-10 space-y-3">
            {[
              {
                q: 'Do I need a credit card to start the trial?',
                a: 'No. You get 14 days to try everything for free. We only ask for payment details after the trial, and only if you decide to continue.',
              },
              {
                q: 'What happens after the trial ends?',
                a: 'Your account stays on a limited free tier unless you upgrade. Nothing is deleted and your students keep working.',
              },
              {
                q: 'How do parents pay?',
                a: 'You share a private link with each parent. They see their wallet balance, top-up history, and upcoming classes. You accept bank transfer, FPX, or cash — we just track the balance.',
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
                className="group rounded-2xl border border-white/30 bg-white/50 p-5 backdrop-blur-xl"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-slate-400 transition-transform group-open:rotate-45">
                    <PlusIcon />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-blue-600 to-indigo-700 p-12 text-center text-white shadow-2xl shadow-blue-900/30">
            <h3 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Your weekly admin, gone by Sunday night.
            </h3>
            <p className="mx-auto mt-3 max-w-md text-blue-100">
              14-day free trial. No credit card. Set up in under 10 minutes.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition-colors hover:bg-slate-100"
            >
              Start free trial →
            </Link>
          </div>
        </section>

        <footer className="mx-auto max-w-6xl px-6 pb-10">
          <div className="flex flex-col items-center justify-between gap-4 border-t border-white/40 pt-8 text-sm text-slate-500 md:flex-row">
            <p>© 2026 CoachSimplify · Built in Malaysia</p>
            <div className="flex items-center gap-5">
              <Link href="/login" className="hover:text-slate-700">
                Log in
              </Link>
              <a href="mailto:weisiangwong@gmail.com" className="hover:text-slate-700">
                Contact
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-xl border border-white/40 bg-white/60 p-4 backdrop-blur-md">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {trend && <p className="mt-0.5 text-xs font-medium text-emerald-600">{trend}</p>}
    </div>
  );
}

function PricingCard({
  name,
  price,
  tagline,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-3xl border backdrop-blur-xl ${
        highlight
          ? 'border-blue-500/40 bg-white/70 shadow-2xl shadow-blue-900/10'
          : 'border-white/30 bg-white/50'
      } p-7`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-blue-900/20">
          Most popular
        </span>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="mt-1 text-sm text-slate-600">{tagline}</p>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-sm font-medium text-slate-500">RM</span>
        <span className="text-4xl font-semibold tracking-tight">{price}</span>
        <span className="text-sm text-slate-500">/ month</span>
      </div>
      <Link
        href="/signup"
        className={`mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
          highlight
            ? 'bg-slate-900 text-white hover:bg-slate-800'
            : 'border border-white/40 bg-white/60 text-slate-800 hover:bg-white/80'
        }`}
      >
        {cta}
      </Link>
      <ul className="mt-6 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
            <span className="mt-0.5 shrink-0 text-emerald-600">
              <CheckSmallIcon />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h14" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h3v-4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

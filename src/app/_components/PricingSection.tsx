'use client';

import { useState } from 'react';
import Link from 'next/link';

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
      { label: 'Waitlist management', soon: true },
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
    features: [
      { label: 'Everything in Pro' },
      { label: 'All future features included' },
      { label: 'Lock in today\u2019s price' },
      { label: 'Direct line to the founder' },
    ],
    cta: 'Get lifetime access',
  },
];

// Yearly = 2 months free → annual price = 10 × monthly
const YEARLY_MULTIPLIER = 10;

export function PricingSection() {
  const [billing, setBilling] = useState<Billing>('monthly');

  const displayPrice = (monthly: number) =>
    billing === 'monthly'
      ? monthly
      : Math.round((monthly * YEARLY_MULTIPLIER) / 12);

  const yearlyTotal = (monthly: number) => monthly * YEARLY_MULTIPLIER;
  const yearlySavings = (monthly: number) => monthly * 2;

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/50 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur-md">
          <ShieldIcon />
          7-day free trial · RM 0.00 today
        </span>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
          Focus on what you do best.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-600">
          We&rsquo;ll handle the rest — every student, every balance, every ringgit.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="mt-10 flex items-center justify-center">
        <div
          role="tablist"
          aria-label="Billing period"
          className="relative inline-flex items-center rounded-full border border-white/40 bg-white/60 p-1 backdrop-blur-xl"
        >
          <button
            role="tab"
            type="button"
            aria-selected={billing === 'monthly'}
            onClick={() => setBilling('monthly')}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
              billing === 'monthly'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Monthly
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={billing === 'yearly'}
            onClick={() => setBilling('yearly')}
            className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
              billing === 'yearly'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Yearly
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${
                billing === 'yearly'
                  ? 'bg-emerald-400 text-emerald-950'
                  : 'bg-emerald-500 text-white'
              }`}
            >
              2 months free
            </span>
          </button>
        </div>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isLifetime = plan.lifetime;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border p-7 backdrop-blur-xl md:p-8 ${
                plan.highlight
                  ? 'border-emerald-500/60 bg-white/90 shadow-2xl shadow-emerald-900/15 lg:-translate-y-4'
                  : isLifetime
                    ? 'border-indigo-500/50 bg-gradient-to-br from-indigo-50/80 via-white/80 to-violet-50/70 shadow-xl shadow-indigo-900/10'
                    : 'border-white/40 bg-white/50'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-emerald-900/20">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                {isLifetime && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                    <SparkIcon />
                    One-time
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">{plan.tagline}</p>

              <div className="mt-6">
                {isLifetime && plan.oneTimePrice !== undefined ? (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium text-slate-500">RM</span>
                      <span className="text-5xl font-semibold tracking-tight tabular-nums">
                        {plan.oneTimePrice.toLocaleString()}
                      </span>
                      <span className="text-sm text-slate-500">once</span>
                    </div>
                    <p className="mt-1.5 min-h-[1.25rem] text-xs text-slate-500">
                      One payment · no renewals · yours forever
                    </p>
                  </>
                ) : plan.monthlyPrice !== undefined ? (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium text-slate-500">RM</span>
                      <span className="text-5xl font-semibold tracking-tight tabular-nums">
                        {displayPrice(plan.monthlyPrice)}
                      </span>
                      <span className="text-sm text-slate-500">/ month</span>
                    </div>
                    <p className="mt-1.5 min-h-[1.25rem] text-xs text-slate-500">
                      {billing === 'yearly' ? (
                        <>
                          RM {yearlyTotal(plan.monthlyPrice).toLocaleString()} / year ·{' '}
                          <span className="font-semibold text-emerald-700">
                            save RM {yearlySavings(plan.monthlyPrice)}
                          </span>
                        </>
                      ) : (
                        '\u00A0'
                      )}
                    </p>
                  </>
                ) : null}
              </div>

              <Link
                href="/signup"
                className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white/50 ${
                  plan.highlight
                    ? 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900'
                    : isLifetime
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/20 hover:from-indigo-700 hover:to-violet-700 focus-visible:ring-indigo-600'
                      : 'border border-white/50 bg-white/60 text-slate-800 hover:bg-white/80 focus-visible:ring-slate-900'
                }`}
              >
                {plan.cta} →
              </Link>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                <ShieldIcon />
                {isLifetime
                  ? '7-day money-back guarantee'
                  : '7-day free trial · RM 0.00 today · Cancel anytime'}
              </p>

              <ul className="mt-6 space-y-3 border-t border-white/50 pt-6">
                {plan.features.map((f, i) => (
                  <li
                    key={f.label}
                    className={`flex items-start gap-2.5 text-sm ${
                      i === 0
                        ? 'font-semibold text-slate-900'
                        : 'text-slate-700'
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${
                        isLifetime ? 'text-indigo-600' : 'text-emerald-600'
                      }`}
                    >
                      <CheckIcon />
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span>{f.label}</span>
                      {f.soon && (
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                          Soon
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l2.09 6.26L20 9l-5.45 3.98L16.18 20 12 16.27 7.82 20l1.63-7.02L4 9l5.91-.74z" />
    </svg>
  );
}

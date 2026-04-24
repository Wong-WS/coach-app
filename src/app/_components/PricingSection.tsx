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
      { label: 'Lock in today\'s price' },
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

function getCtaVariant(plan: Plan): 'primary' | 'outline' | 'accent' {
  if (plan.lifetime) return 'accent';
  if (plan.highlight) return 'primary';
  return 'outline';
}

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
                          ' '
                        )}
                      </p>
                    </>
                  ) : null}
                </div>

                <div className="mt-6">
                  <Link href="/signup" className="block">
                    <Btn variant={getCtaVariant(plan)} size="lg" full>
                      {plan.cta} →
                    </Btn>
                  </Link>
                  <p
                    className="mt-3 text-center text-[12px]"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    {isLifetime
                      ? 'Lock in today\'s price · refundable within 14 days of launch'
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

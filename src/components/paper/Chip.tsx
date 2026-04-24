import { ReactNode } from 'react';

type Tone = 'soft' | 'accent' | 'good' | 'warn' | 'bad';

const toneStyles: Record<Tone, { bg: string; color: string }> = {
  soft: { bg: 'var(--line)', color: 'var(--ink-2)' },
  accent: { bg: 'var(--accent-soft)', color: 'var(--accent-ink)' },
  good: { bg: 'var(--good-soft)', color: 'var(--good)' },
  warn: { bg: 'var(--warn-soft)', color: 'var(--warn)' },
  bad: { bg: 'var(--bad-soft)', color: 'var(--bad)' },
};

export function Chip({ tone = 'soft', children }: { tone?: Tone; children: ReactNode }) {
  const { bg, color } = toneStyles[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-tight"
      style={{ background: bg, color, letterSpacing: '0.01em' }}
    >
      {children}
    </span>
  );
}

export function BalancePill({ balance, compact = false }: { balance: number; compact?: boolean }) {
  const positive = balance >= 0;
  const color = positive ? 'var(--good)' : 'var(--bad)';
  const bg = positive ? 'var(--good-soft)' : 'var(--bad-soft)';
  return (
    <span
      className={`mono tnum inline-flex items-center rounded-lg font-medium ${compact ? 'text-[11.5px] px-2 py-0.5' : 'text-[13px] px-2.5 py-1'}`}
      style={{ color, background: bg, letterSpacing: '-0.01em' }}
    >
      {positive ? '' : '−'}RM {Math.abs(balance).toFixed(0)}
    </span>
  );
}

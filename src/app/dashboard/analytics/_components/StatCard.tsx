import type { ReactNode } from 'react';
import type { ReasonBucket } from '@/lib/analytics/cancellations';
import type { Ranked } from '@/lib/analytics/families';
import { formatCentsGrouped } from '@/lib/money';

export function formatRM(cents: number): string {
  return `RM ${formatCentsGrouped(cents)}`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n.toLocaleString('en-MY')} ${n === 1 ? word : pluralWord}`;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[14px] border p-4 ${className}`}
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[10.5px] font-semibold uppercase"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
        {children}
      </div>
      {right}
    </div>
  );
}

export function Bar({ value, height = 8 }: { value: number; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="rounded-full overflow-hidden mt-2.5" style={{ height, background: 'var(--line)' }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--ink)' }} />
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  progress,
  delta,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  progress?: number;
  delta?: ReactNode;
}) {
  return (
    <Card className="p-3.5">
      <Label>{label}</Label>
      <div
        className="mono tnum mt-1 text-[20px] sm:text-[22px] font-semibold"
        style={{ color: 'var(--ink)', letterSpacing: '-0.5px' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {sub}
        </div>
      )}
      {progress !== undefined && <Bar value={progress} />}
      {delta && <div className="mt-2">{delta}</div>}
    </Card>
  );
}

/**
 * "▲ 2 vs 1–18 Oct". Green when the change is good (higher, or lower when
 * `lowerIsBetter`), red when bad, grey when unchanged.
 */
export function DeltaChip({
  diff,
  format,
  vsLabel,
  lowerIsBetter = false,
}: {
  diff: number;
  format: (n: number) => string;
  vsLabel: string;
  lowerIsBetter?: boolean;
}) {
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const style =
    diff === 0
      ? { background: 'var(--line)', color: 'var(--ink-3)' }
      : good
        ? { background: 'var(--good-soft)', color: 'var(--good)' }
        : { background: 'var(--bad-soft)', color: 'var(--bad)' };
  const arrow = diff === 0 ? '=' : diff > 0 ? '▲' : '▼';
  return (
    <span
      className="mono tnum inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      {arrow} {diff === 0 ? '' : `${format(Math.abs(diff))} `}vs {vsLabel}
    </span>
  );
}

const REASON_LABELS: { bucket: ReasonBucket; label: string }[] = [
  { bucket: 'weather', label: 'Weather' },
  { bucket: 'student', label: 'Student' },
  { bucket: 'coach', label: 'Me' },
  { bucket: 'other', label: 'Other' },
];

export function ReasonBars({ counts }: { counts: Record<ReasonBucket, number> }) {
  const max = Math.max(1, ...Object.values(counts));
  const rows = [...REASON_LABELS];
  if (counts.none > 0) rows.push({ bucket: 'none', label: 'No reason*' });
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(({ bucket, label }) => (
        <div key={bucket} className="grid items-center gap-2.5 text-[12.5px]" style={{ gridTemplateColumns: '84px 1fr 32px' }}>
          <span style={{ color: bucket === 'none' ? 'var(--ink-3)' : 'var(--ink-2)' }}>{label}</span>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${(counts[bucket] / max) * 100}%`,
                background: bucket === 'none' ? 'var(--ink-4)' : 'var(--ink)',
              }}
            />
          </div>
          <span className="mono tnum text-right" style={{ color: 'var(--ink)' }}>
            {counts[bucket]}
          </span>
        </div>
      ))}
      {counts.none > 0 && (
        <div className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
          * before reasons were tracked (18 Nov 2026)
        </div>
      )}
    </div>
  );
}

export function RankList({ title, items, unit }: { title: string; items: Ranked[]; unit?: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1">
        <Label>{title}</Label>
      </div>
      {items.map((r, i) => (
        <div
          key={r.key}
          className="flex items-center gap-3 py-2 text-[13px]"
          style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
        >
          <div className="flex-1 min-w-0 truncate" style={{ color: 'var(--ink)' }}>
            {r.name}
          </div>
          <span className="mono tnum" style={{ color: 'var(--ink-2)' }}>
            {r.count}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 text-[13px]" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex-1 min-w-0 truncate" style={{ color: 'var(--ink-2)' }}>
        {label}
      </div>
      <span className="mono tnum" style={{ color: 'var(--ink)' }}>
        {value}
      </span>
    </div>
  );
}

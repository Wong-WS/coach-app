'use client';

import { useMemo, useState } from 'react';
import { Btn, IconPlus, IconEdit } from '@/components/paper';
import { useAllAwayPeriods, useBookings, useClassExceptions } from '@/hooks/useCoachData';
import AwayPeriodModal from './AwayPeriodModal';
import type { AwayPeriod } from '@/types';

interface Props {
  coachId: string;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
    >
      {children}
    </div>
  );
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const sDate = new Date(sy, sm - 1, sd);
  const eDate = new Date(ey, em - 1, ed);
  const sameYear = sy === ey;
  const startLabel = sDate.toLocaleDateString('en-MY', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endLabel = eDate.toLocaleDateString('en-MY', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

function statusFor(period: AwayPeriod, todayStr: string): 'upcoming' | 'now' | 'past' {
  if (todayStr < period.startDate) return 'upcoming';
  if (todayStr > period.endDate) return 'past';
  return 'now';
}

export default function TimeOffSection({ coachId }: Props) {
  const { awayPeriods, loading } = useAllAwayPeriods(coachId);
  const { bookings } = useBookings(coachId, 'confirmed');
  const { classExceptions } = useClassExceptions(coachId);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AwayPeriod | null>(null);

  const todayStr = useMemo(() => ymd(new Date()), []);

  // Sort: upcoming/current first (by startDate asc), then past (by startDate desc)
  const sorted = useMemo(() => {
    const upcomingOrNow: AwayPeriod[] = [];
    const past: AwayPeriod[] = [];
    for (const p of awayPeriods) {
      if (statusFor(p, todayStr) === 'past') past.push(p);
      else upcomingOrNow.push(p);
    }
    upcomingOrNow.sort((a, b) => a.startDate.localeCompare(b.startDate));
    past.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return [...upcomingOrNow, ...past];
  }, [awayPeriods, todayStr]);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-2.5">
        <Eyebrow>Time off</Eyebrow>
        <Btn variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <IconPlus size={14} />
          <span className="ml-1">Add time off</span>
        </Btn>
      </div>
      <p className="text-[12.5px] mb-4" style={{ color: 'var(--ink-3)' }}>
        Block out vacations, conferences, or any stretch you&apos;re not teaching.
      </p>

      {loading ? (
        <div className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Loading…</div>
      ) : sorted.length === 0 ? (
        <div
          className="rounded-[12px] border p-4 text-[12.5px]"
          style={{ borderColor: 'var(--line-2)', color: 'var(--ink-3)' }}
        >
          No time off scheduled.
        </div>
      ) : (
        <div className="rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--line-2)' }}>
          {sorted.map((p, i) => {
            const status = statusFor(p, todayStr);
            const chipColor =
              status === 'now'
                ? 'var(--good)'
                : status === 'upcoming'
                  ? 'var(--accent)'
                  : 'var(--ink-3)';
            const chipLabel = status === 'now' ? 'Now' : status === 'upcoming' ? 'Upcoming' : 'Past';
            return (
              <button
                key={p.id}
                onClick={() => setEditing(p)}
                className="w-full flex items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-[var(--line)]"
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span
                    className="text-[13.5px] font-medium truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {formatRange(p.startDate, p.endDate)}
                  </span>
                  {p.label && (
                    <span
                      className="text-[12.5px] truncate"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      · {p.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[10.5px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    style={{
                      color: chipColor,
                      background: 'var(--line)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {chipLabel}
                  </span>
                  <IconEdit size={14} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <AwayPeriodModal
        open={showAdd || editing !== null}
        onClose={() => {
          setShowAdd(false);
          setEditing(null);
        }}
        coachId={coachId}
        editing={editing}
        allAwayPeriods={awayPeriods}
        bookings={bookings}
        exceptions={classExceptions}
      />
    </section>
  );
}

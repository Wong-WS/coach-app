'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/paper';
import { clampRange, comparisonRange, monthRange, rangeLabel, type DateRange } from '@/lib/analytics/periods';
import { projectPeriod, taughtIn } from '@/lib/analytics/projection';
import { collectCancellations, reasonCounts } from '@/lib/analytics/cancellations';
import { cancelsMost, familyResolver } from '@/lib/analytics/families';
import { likelyToReceive, type RunOut } from '@/lib/analytics/wallet-forecast';
import { parseDateString } from '@/lib/date-format';
import type { TopUp } from '@/lib/analytics/fetch';
import {
  Card,
  DeltaChip,
  formatRM,
  plural,
  RankList,
  ReasonBars,
  SectionTitle,
  StatCard,
} from './StatCard';
import type { AnalyticsInputs } from './types';
import { INFO } from './info-text';

const shortMonth = (date: string) => parseDateString(date).toLocaleDateString('en-MY', { month: 'short' });
const longMonth = (date: string) => parseDateString(date).toLocaleDateString('en-MY', { month: 'long' });
const dayMonth = (date: string) => `${Number(date.slice(8))} ${shortMonth(date)}`;

function received(topUps: TopUp[], range: DateRange) {
  const inRange = topUps.filter((t) => t.date >= range.start && t.date <= range.end);
  return { cents: inRange.reduce((s, t) => s + t.amountCents, 0), count: inRange.length };
}

function RunOutChip({ runOut }: { runOut: RunOut }) {
  if (runOut.kind === 'now') return <Chip tone="bad">Out now</Chip>;
  if (runOut.kind === 'tab') return <Chip>Pays after</Chip>;
  return <Chip tone="warn">~{dayMonth(runOut.date)}</Chip>;
}

export function MonthView({
  inputs,
  year,
  month,
  lastTopUps,
}: {
  inputs: AnalyticsInputs;
  year: number;
  month: number;
  lastTopUps: Record<string, number>;
}) {
  const { today, confirmed, allBookings, wallets, students, awayPeriods, logs, exceptions, topUps } = inputs;
  const [showAllWallets, setShowAllWallets] = useState(false);

  const m = useMemo(() => {
    const period = monthRange(year, month);
    const isCurrent = today >= period.start && today <= period.end;
    const cmp = comparisonRange(period, today);
    // So far: the current month up to today; a finished month in full.
    const soFar = (isCurrent && clampRange(period, undefined, today)) || period;

    const proj = projectPeriod(period, today, confirmed, exceptions, awayPeriods, logs);
    const cmpTaught = taughtIn(cmp, logs);
    const rec = received(topUps, soFar);
    const cmpRec = received(topUps, cmp);
    const likely = isCurrent
      ? likelyToReceive({
          wallets,
          bookings: confirmed,
          exceptions,
          awayPeriods,
          logs,
          today,
          monthEnd: period.end,
          lastTopUpCents: lastTopUps,
        })
      : null;
    const cancels = collectCancellations(soFar, exceptions, allBookings);
    const cmpCancels = collectCancellations(cmp, exceptions, allBookings);
    const resolve = familyResolver(wallets, students);

    const daysInMonth = Number(period.end.slice(8));
    const vsLabel = isCurrent ? rangeLabel(cmp) : shortMonth(cmp.start);
    const subtitle = isCurrent
      ? `Compared with ${vsLabel} · ${Number(today.slice(8))} of ${daysInMonth} days gone`
      : `Compared with ${longMonth(cmp.start)}`;

    return {
      period,
      isCurrent,
      proj,
      cmpTaught,
      rec,
      cmpRec,
      likely,
      cancels,
      cmpCancels,
      reasons: reasonCounts(cancels),
      topCancellers: cancelsMost(cancels, resolve),
      vsLabel,
      subtitle,
    };
  }, [year, month, today, confirmed, allBookings, wallets, students, awayPeriods, logs, exceptions, topUps, lastTopUps]);

  const { proj, isCurrent, vsLabel } = m;
  const count = (n: number) => n.toLocaleString('en-MY');
  const rows = m.likely?.rows ?? [];
  const visibleRows = showAllWallets ? rows : rows.slice(0, 4);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px] -mt-3" style={{ color: 'var(--ink-3)' }}>
        {m.subtitle}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard
          label="Classes"
          info={INFO.classes}
          value={
            isCurrent ? (
              <>
                {count(proj.taught.classes)}{' '}
                <span className="text-[14px]" style={{ color: 'var(--ink-3)' }}>
                  / {count(proj.projected.classes)}
                </span>
              </>
            ) : (
              count(proj.taught.classes)
            )
          }
          sub={isCurrent ? 'taught / projected' : 'taught'}
          progress={isCurrent && proj.projected.classes > 0 ? proj.taught.classes / proj.projected.classes : undefined}
          delta={<DeltaChip diff={proj.taught.classes - m.cmpTaught.classes} format={count} vsLabel={vsLabel} />}
        />
        <StatCard
          label="Taught"
          info={INFO.taught}
          value={formatRM(proj.taught.cents)}
          sub={isCurrent ? `of ${formatRM(proj.projected.cents)} projected` : 'earned this month'}
          progress={isCurrent && proj.projected.cents > 0 ? proj.taught.cents / proj.projected.cents : undefined}
          delta={<DeltaChip diff={proj.taught.cents - m.cmpTaught.cents} format={formatRM} vsLabel={vsLabel} />}
        />
        <StatCard
          label="Received"
          value={formatRM(m.rec.cents)}
          sub={plural(m.rec.count, 'top-up')}
          delta={<DeltaChip diff={m.rec.cents - m.cmpRec.cents} format={formatRM} vsLabel={vsLabel} />}
        />
        {m.likely && (
          <StatCard
            label="Likely to receive"
            info={INFO.likely}
            value={`+${formatRM(m.likely.totalCents)}`}
            sub={
              <>
                {plural(rows.length, 'wallet')} need{rows.length === 1 ? 's' : ''} paying by {dayMonth(m.period.end)}
                <br />
                <span style={{ color: 'var(--ink-2)' }}>
                  Month total if all pay: <b className="mono tnum">{formatRM(m.rec.cents + m.likely.totalCents)}</b>
                </span>
              </>
            }
          />
        )}
      </div>

      <div className={`grid gap-3 ${m.likely ? 'lg:grid-cols-2' : ''}`}>
        {m.likely && (
          <Card>
            <SectionTitle right={rows.length > 0 ? <Chip tone="warn">{rows.length}</Chip> : undefined}>
              Wallets running out this month
            </SectionTitle>
            {rows.length === 0 ? (
              <div className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                Every wallet lasts the month.
              </div>
            ) : (
              <>
                {visibleRows.map((r, i) => (
                  <div
                    key={r.walletId}
                    className="flex items-center gap-2 py-2 text-[13px]"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
                  >
                    <div className="flex-1 min-w-0 truncate">{r.name}</div>
                    <RunOutChip runOut={r.runOut} />
                    <span className="mono tnum w-[84px] text-right">
                      {r.amountCents === null ? '—' : formatRM(r.amountCents)}
                    </span>
                  </div>
                ))}
                {rows.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setShowAllWallets((v) => !v)}
                    className="text-[12.5px] font-medium pt-2"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {showAllWallets ? 'Show fewer' : `+ ${rows.length - 4} more`}
                  </button>
                )}
                <div className="text-[11px] mt-2" style={{ color: 'var(--ink-3)' }}>
                  Amount = their usual top-up (or last top-up). Pay-after wallets: what they&apos;ll owe.
                </div>
              </>
            )}
          </Card>
        )}

        <Card>
          <SectionTitle
            info={INFO.cancelledMonth}
            right={
              <span className="flex items-center gap-2">
                <span className="mono tnum text-[18px] font-semibold">{m.cancels.length}</span>
                <DeltaChip
                  diff={m.cancels.length - m.cmpCancels.length}
                  format={count}
                  vsLabel={vsLabel}
                  lowerIsBetter
                />
              </span>
            }
          >
            Cancelled {isCurrent ? 'so far' : 'this month'}
          </SectionTitle>
          <ReasonBars counts={m.reasons} />
          {m.topCancellers.length > 0 && (
            <div className="mt-4">
              <RankList title="Cancels most" items={m.topCancellers} unit="this month" info={INFO.cancelsMost} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

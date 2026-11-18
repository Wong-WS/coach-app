'use client';

import { useMemo } from 'react';
import type { DayOfWeek } from '@/types';
import { addDays, clampRange, sinceDate, yearRange } from '@/lib/analytics/periods';
import { taughtIn } from '@/lib/analytics/projection';
import {
  cancellationRate,
  collectCancellations,
  countReschedules,
  reasonCounts,
} from '@/lib/analytics/cancellations';
import { familyResolver, mostLessons } from '@/lib/analytics/families';
import {
  busiestSlot,
  classesByWeekday,
  daysSplit,
  minutesTaught,
  monthlyTaught,
  studentStats,
  yearForecast,
} from '@/lib/analytics/year';
import { parseDateString } from '@/lib/date-format';
import {
  Bar,
  Card,
  Label,
  RankList,
  ReasonBars,
  Row,
  SectionTitle,
  StatCard,
  formatRM,
  plural,
} from './StatCard';
import type { AnalyticsInputs } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS: { day: DayOfWeek; short: string; long: string }[] = [
  { day: 'monday', short: 'Mon', long: 'Monday' },
  { day: 'tuesday', short: 'Tue', long: 'Tuesday' },
  { day: 'wednesday', short: 'Wed', long: 'Wednesday' },
  { day: 'thursday', short: 'Thu', long: 'Thursday' },
  { day: 'friday', short: 'Fri', long: 'Friday' },
  { day: 'saturday', short: 'Sat', long: 'Saturday' },
  { day: 'sunday', short: 'Sun', long: 'Sunday' },
];

function hourLabel(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

const dayMonth = (date: string) =>
  parseDateString(date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });

export function YearView({
  inputs,
  year,
  onOpenMonth,
}: {
  inputs: AnalyticsInputs;
  year: number;
  onOpenMonth: (month: number) => void;
}) {
  const { today, confirmed, allBookings, wallets, students, awayPeriods, logs, exceptions, topUps, firstLogDate } = inputs;

  const y = useMemo(() => {
    const yr = yearRange(year);
    const isCurrent = today >= yr.start && today <= yr.end;
    const since = sinceDate(firstLogDate, year);
    const yearLogs = logs.filter((l) => l.date >= yr.start && l.date <= yr.end);
    const laterLogs = logs.filter((l) => l.date > yr.end);
    const toToday = clampRange(yr, undefined, today) ?? yr;

    // Usual cancellations: share of scheduled classes cancelled in the last 90 days.
    const rateWindow = { start: addDays(today, -89), end: today };
    const rate = isCurrent
      ? cancellationRate(
          collectCancellations(rateWindow, exceptions, allBookings).length,
          taughtIn(rateWindow, logs).classes,
        )
      : 0;

    const sched = { logs, bookings: confirmed, exceptions, awayPeriods, cancelRate: rate };
    const forecast = isCurrent ? yearForecast({ ...sched, year, today }) : null;
    const bars = monthlyTaught({ ...sched, year, today, firstLogDate });
    const taught = taughtIn(yr, logs);
    const minutes = minutesTaught(yearLogs);
    const daysRange = clampRange(yr, since ?? undefined, today);
    const days = daysRange ? daysSplit(daysRange, yearLogs, awayPeriods) : { worked: 0, timeOff: 0, other: 0 };
    const yearTopUps = topUps.filter((t) => t.date >= yr.start && t.date <= yr.end);
    const cancels = collectCancellations(toToday, exceptions, allBookings);

    return {
      isCurrent,
      since,
      rate,
      forecast,
      bars,
      taught,
      hours: minutes / 60,
      days,
      received: { cents: yearTopUps.reduce((s, t) => s + t.amountCents, 0), count: yearTopUps.length },
      cancels: cancels.length,
      reasons: reasonCounts(cancels),
      reschedules: countReschedules(toToday, exceptions, allBookings),
      weekdays: classesByWeekday(yearLogs),
      busiest: busiestSlot(yearLogs),
      students: studentStats({
        year,
        today,
        yearLogs,
        laterLogs,
        students,
        confirmedBookings: confirmed,
        isFirstYear: !firstLogDate || firstLogDate.startsWith(`${year}-`),
      }),
      most: mostLessons(yearLogs, familyResolver(wallets, students)),
    };
  }, [year, today, confirmed, allBookings, wallets, students, awayPeriods, logs, exceptions, topUps, firstLogDate]);

  const count = (n: number) => n.toLocaleString('en-MY');
  const maxBar = Math.max(1, ...y.bars.map((b) => b.cents));
  const maxDay = Math.max(1, ...Object.values(y.weekdays));
  const busiestDay = y.busiest ? DAYS.find((d) => d.day === y.busiest!.day)! : null;
  const daysTotal = y.days.worked + y.days.timeOff + y.days.other;
  const pct = (n: number) => (daysTotal > 0 ? (n / daysTotal) * 100 : 0);

  return (
    <div className="flex flex-col gap-3">
      {y.since && (
        <div className="text-[12.5px] -mt-3" style={{ color: 'var(--ink-3)' }}>
          Since {dayMonth(y.since)}, your first lesson in the app
        </div>
      )}

      {y.forecast && (
        <Card>
          <Label>Year-end forecast</Label>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1">
            <div className="mono tnum text-[28px] sm:text-[32px] font-semibold" style={{ letterSpacing: '-0.8px' }}>
              {formatRM(y.forecast.forecast.cents)}
            </div>
            <div className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              taught <b className="mono tnum" style={{ color: 'var(--ink)' }}>{formatRM(y.forecast.taught.cents)}</b> so
              far + about <b className="mono tnum" style={{ color: 'var(--ink)' }}>{formatRM(y.forecast.toCome.cents)}</b>{' '}
              still to come (after {Math.round(y.rate * 100)}% usual cancellations)
            </div>
          </div>
          <Bar
            height={10}
            value={y.forecast.forecast.cents > 0 ? y.forecast.taught.cents / y.forecast.forecast.cents : 0}
          />
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard
          label="Classes taught"
          value={count(y.taught.classes)}
          sub={y.forecast ? `~${count(y.forecast.forecast.classes)} by 31 Dec` : undefined}
        />
        <StatCard
          label="Hours coached"
          value={`${count(Math.round(y.hours))} h`}
          sub={y.days.worked > 0 ? `avg ${(y.hours / y.days.worked).toFixed(1)} h a working day` : undefined}
        />
        <StatCard
          label="Taught"
          value={formatRM(y.taught.cents)}
          sub={y.taught.classes > 0 ? `avg ${formatRM(Math.round(y.taught.cents / y.taught.classes))} a class` : undefined}
        />
        <StatCard label="Received" value={formatRM(y.received.cents)} sub={plural(y.received.count, 'top-up')} />
      </div>

      <Card>
        <SectionTitle
          right={
            y.isCurrent ? (
              <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                dashed = forecast
              </span>
            ) : undefined
          }
        >
          Taught, month by month
        </SectionTitle>
        <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: 150 }}>
          {y.bars.map((b) => {
            const h = `${Math.max(2, (b.cents / maxBar) * 100)}%`;
            const actual = b.kind === 'actual';
            return (
              <button
                key={b.month}
                type="button"
                disabled={!actual}
                onClick={() => onOpenMonth(b.month)}
                title={`${MONTHS[b.month - 1]}: ${formatRM(b.cents)}`}
                className="flex-1 h-full flex flex-col justify-end items-center gap-1.5 disabled:cursor-default"
              >
                <div
                  className="w-full rounded-t-[5px]"
                  style={
                    actual
                      ? { height: h, background: 'var(--ink)' }
                      : { height: h, border: '1.5px dashed var(--line-2)', borderBottom: 'none' }
                  }
                />
                <span className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                  {MONTHS[b.month - 1]}
                  {b.partial ? '*' : ''}
                </span>
              </button>
            );
          })}
        </div>
        <div className="text-[11px] mt-2" style={{ color: 'var(--ink-3)' }}>
          {y.bars.some((b) => b.partial) ? '* partial month. ' : ''}Tap a month to open it.
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <SectionTitle>Days</SectionTitle>
          <div className="flex h-3.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--line)' }}>
            <div style={{ width: `${pct(y.days.worked)}%`, background: 'var(--ink)' }} />
            <div style={{ width: `${pct(y.days.timeOff)}%`, background: 'var(--ink-4)' }} />
          </div>
          <Row label="Worked" value={count(y.days.worked)} />
          <Row label="Time off (planned)" value={count(y.days.timeOff)} />
          <Row label="Other days off" value={count(y.days.other)} />
        </Card>

        <Card>
          <SectionTitle>Cancelled &amp; moved</SectionTitle>
          <Row label="Cancelled" value={count(y.cancels)} />
          <Row label="Rescheduled" value={count(y.reschedules)} />
          <div className="mt-3">
            <ReasonBars counts={y.reasons} />
          </div>
        </Card>

        <Card>
          <SectionTitle>Classes by day</SectionTitle>
          <div className="flex flex-col gap-1.5">
            {DAYS.map((d) => (
              <div
                key={d.day}
                className="grid items-center gap-2.5 text-[12.5px]"
                style={{ gridTemplateColumns: '36px 1fr 40px' }}
              >
                <span style={{ color: 'var(--ink-2)' }}>{d.short}</span>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(y.weekdays[d.day] / maxDay) * 100}%`, background: 'var(--ink)' }}
                  />
                </div>
                <span className="mono tnum text-right">{count(y.weekdays[d.day])}</span>
              </div>
            ))}
          </div>
          {busiestDay && y.busiest && (
            <div className="text-[11.5px] mt-2.5" style={{ color: 'var(--ink-3)' }}>
              Busiest: <b style={{ color: 'var(--ink)' }}>{busiestDay.long}</b> · busiest time{' '}
              <b style={{ color: 'var(--ink)' }}>
                {busiestDay.short} {hourLabel(y.busiest.hour)}
              </b>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <SectionTitle>Students</SectionTitle>
          <Row label="Taught this year" value={count(y.students.taught)} />
          {y.students.newThisYear !== null && <Row label="New this year" value={count(y.students.newThisYear)} />}
          <Row label="Stopped this year" value={count(y.students.stopped)} />
        </Card>
        {y.most.length > 0 && (
          <Card>
            <RankList title="Most lessons" items={y.most} unit="classes" />
          </Card>
        )}
      </div>
    </div>
  );
}

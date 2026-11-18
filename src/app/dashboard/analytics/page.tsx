'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  useAllAwayPeriods,
  useBookings,
  useStudents,
  useWallets,
} from '@/hooks/useCoachData';
import { useAnalyticsData, useFirstLogDate, useLastTopUps } from '@/hooks/useAnalyticsData';
import {
  addDays,
  comparisonRange,
  monthRange,
  yearRange,
  ymd,
} from '@/lib/analytics/periods';
import { likelyToReceive } from '@/lib/analytics/wallet-forecast';
import { Segmented, IconChevL, IconChevR } from '@/components/paper';
import { Card } from './_components/StatCard';
import { MonthView } from './_components/MonthView';
import { YearView } from './_components/YearView';
import type { AnalyticsInputs } from './_components/types';

type View = 'month' | 'year';
const VIEW_OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AnalyticsPage() {
  const { coach } = useAuth();
  const coachId = coach?.id;
  const today = useMemo(() => ymd(new Date()), []);
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));

  const { bookings: allBookings, loading: bookingsLoading } = useBookings(coachId);
  const confirmed = useMemo(() => allBookings.filter((b) => b.status === 'confirmed'), [allBookings]);
  const { wallets, loading: walletsLoading } = useWallets(coachId);
  const { students } = useStudents(coachId);
  const { awayPeriods } = useAllAwayPeriods(coachId);
  const firstLogDate = useFirstLogDate(coachId);

  const [view, setView] = useState<View>('month');
  const [month, setMonth] = useState({ year: thisYear, month: thisMonth });
  const [year, setYear] = useState(thisYear);

  // Earliest period the steppers can reach: the first lesson ever marked done.
  const first = firstLogDate
    ? { year: Number(firstLogDate.slice(0, 4)), month: Number(firstLogDate.slice(5, 7)) }
    : { year: thisYear, month: thisMonth };

  // One fetch per view/period. Month: the month + its comparison window.
  // Current year: the year (exceptions to 31 Dec for the forecast) reaching
  // back 90 days for the cancellation rate. Past year: to today, so later
  // lessons can tell who stopped.
  const range = useMemo(() => {
    if (walletsLoading) return null;
    if (view === 'month') {
      const m = monthRange(month.year, month.month);
      return { start: comparisonRange(m, today).start, end: m.end };
    }
    const y = yearRange(year);
    if (year === thisYear) {
      const back = addDays(today, -89);
      return { start: back < y.start ? back : y.start, end: y.end };
    }
    return { start: y.start, end: today };
  }, [walletsLoading, view, month, year, today, thisYear]);

  const walletIds = useMemo(() => wallets.map((w) => w.id).sort(), [wallets]);
  const data = useAnalyticsData(coachId, range, walletIds);

  const inputs: AnalyticsInputs = {
    today,
    confirmed,
    allBookings,
    wallets,
    students,
    awayPeriods,
    logs: data.logs,
    exceptions: data.exceptions,
    topUps: data.topUps,
    firstLogDate: firstLogDate ?? null,
  };

  // Last top-up amounts, fetched only for wallets that will need one and have
  // no usual top-up set — keeps reads to a handful instead of every wallet.
  const isCurrentMonth = view === 'month' && month.year === thisYear && month.month === thisMonth;
  const needLastTopUp = useMemo(() => {
    if (!isCurrentMonth || data.loading) return [];
    const { rows } = likelyToReceive({
      wallets,
      bookings: confirmed,
      exceptions: data.exceptions,
      awayPeriods,
      logs: data.logs,
      today,
      monthEnd: monthRange(thisYear, thisMonth).end,
      lastTopUpCents: {},
    });
    return rows.filter((r) => r.amountCents === null).map((r) => r.walletId);
  }, [isCurrentMonth, data.loading, data.exceptions, data.logs, wallets, confirmed, awayPeriods, today, thisYear, thisMonth]);
  const lastTopUps = useLastTopUps(coachId, needLastTopUp);

  const atFirst =
    view === 'month'
      ? month.year * 12 + month.month <= first.year * 12 + first.month
      : year <= first.year;
  const atLast =
    view === 'month' ? month.year === thisYear && month.month === thisMonth : year === thisYear;

  const step = (dir: -1 | 1) => {
    if (view === 'year') {
      setYear((y) => y + dir);
      return;
    }
    setMonth(({ year: y, month: m }) => {
      const idx = y * 12 + (m - 1) + dir;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  };

  const title = view === 'month' ? `${MONTH_NAMES[month.month - 1]} ${month.year}` : `${year}`;
  const loading = bookingsLoading || walletsLoading || firstLogDate === undefined || data.loading;

  return (
    <div className="px-4 sm:px-6 py-5 sm:py-7 max-w-[1100px]" style={{ color: 'var(--ink)' }}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div
            className="text-[11px] font-semibold uppercase"
            style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
          >
            Analytics
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={atFirst}
              aria-label="Previous"
              className="p-1 rounded-md disabled:opacity-30"
              style={{ color: 'var(--ink-2)' }}
            >
              <IconChevL size={18} />
            </button>
            <div
              className="text-[22px] sm:text-[28px] font-semibold leading-tight"
              style={{ letterSpacing: '-0.6px' }}
            >
              {title}
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={atLast}
              aria-label="Next"
              className="p-1 rounded-md disabled:opacity-30"
              style={{ color: 'var(--ink-2)' }}
            >
              <IconChevR size={18} />
            </button>
          </div>
        </div>
        <Segmented size="sm" options={VIEW_OPTIONS} value={view} onChange={setView} />
      </div>

      {data.error ? (
        <Card>
          <div className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
            Couldn&apos;t load analytics. Try again later.
          </div>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderColor: 'var(--accent)' }}
          />
        </div>
      ) : view === 'month' ? (
        <MonthView inputs={inputs} year={month.year} month={month.month} lastTopUps={lastTopUps} />
      ) : (
        <YearView
          inputs={inputs}
          year={year}
          onOpenMonth={(m) => {
            setMonth({ year, month: m });
            setView('month');
          }}
        />
      )}
    </div>
  );
}

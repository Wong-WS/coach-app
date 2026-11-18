'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClassException, LessonLog } from '@/types';
import type { DateRange } from '@/lib/analytics/periods';
import {
  fetchExceptions,
  fetchFirstLogDate,
  fetchLastTopUps,
  fetchLessonLogs,
  fetchTopUps,
  type TopUp,
} from '@/lib/analytics/fetch';
import { createRequestCache } from '@/lib/analytics/request-cache';

export type AnalyticsData = { logs: LessonLog[]; exceptions: ClassException[]; topUps: TopUp[] };
const EMPTY: AnalyticsData = { logs: [], exceptions: [], topUps: [] };

/**
 * Fetch lesson logs, exceptions and top-ups for `range` once. Results are
 * cached for as long as the page stays mounted, and a period that's still
 * loading is never fetched twice (quick back-and-forth stepping), so flipping
 * between months costs no extra reads. Leaving and re-opening the page
 * refetches, so numbers are fresh after marking lessons done. Pass
 * `range: null` to wait (e.g. until wallets have loaded).
 *
 * `logsEnd` reads lesson logs past `range.end` (a past year needs later
 * lessons to tell who stopped) without reading later exceptions or top-ups.
 */
export function useAnalyticsData(
  coachId: string | undefined,
  range: DateRange | null,
  walletIds: string[],
  logsEnd?: string,
): AnalyticsData & { loading: boolean; error: boolean } {
  const walletKey = walletIds.join(',');
  const key = coachId && range ? `${coachId}|${range.start}|${range.end}|${logsEnd ?? ''}|${walletKey}` : null;
  const cache = useRef(createRequestCache<AnalyticsData>());
  const [, setVersion] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !coachId || !range || cache.current.peek(key)) return;
    let cancelled = false;
    const ids = walletKey ? walletKey.split(',') : [];
    cache.current
      .get(key, async () => {
        const [logs, exceptions, topUps] = await Promise.all([
          fetchLessonLogs(coachId, logsEnd ? { start: range.start, end: logsEnd } : range),
          fetchExceptions(coachId, range),
          fetchTopUps(coachId, ids, range),
        ]);
        return { logs, exceptions, topUps };
      })
      .then(() => {
        if (!cancelled) setVersion((v) => v + 1);
      })
      .catch((e) => {
        console.error('useAnalyticsData', e);
        if (!cancelled) setErrorKey(key);
      });
    return () => {
      cancelled = true;
    };
    // range/logsEnd are captured through key; walletIds through walletKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const data = key ? cache.current.peek(key) : undefined;
  return {
    ...(data ?? EMPTY),
    loading: !!key && !data && errorKey !== key,
    error: !!key && errorKey === key,
  };
}

/** The coach's first-ever lesson date: undefined while loading, null if none. */
export function useFirstLogDate(coachId: string | undefined): string | null | undefined {
  const [result, setResult] = useState<{ coachId: string; date: string | null } | null>(null);
  useEffect(() => {
    if (!coachId) return;
    let cancelled = false;
    fetchFirstLogDate(coachId)
      .then((date) => !cancelled && setResult({ coachId, date }))
      .catch((e) => {
        console.error('useFirstLogDate', e);
        if (!cancelled) setResult({ coachId, date: null });
      });
    return () => {
      cancelled = true;
    };
  }, [coachId]);
  return result && result.coachId === coachId ? result.date : undefined;
}

/**
 * Last top-up amount for each of `walletIds` — the fallback amount for
 * wallets with no usual top-up. Callers pass only those wallets to keep reads
 * down.
 */
export function useLastTopUps(
  coachId: string | undefined,
  walletIds: string[],
): { amounts: Record<string, number>; loading: boolean } {
  const walletKey = walletIds.join(',');
  const [result, setResult] = useState<{ key: string; amounts: Record<string, number> } | null>(null);
  const key = coachId ? `${coachId}|${walletKey}` : null;
  useEffect(() => {
    if (!key || !coachId || !walletKey) return;
    let cancelled = false;
    fetchLastTopUps(coachId, walletKey.split(','))
      .then((amounts) => !cancelled && setResult({ key, amounts }))
      .catch((e) => {
        console.error('useLastTopUps', e);
        if (!cancelled) setResult({ key, amounts: {} });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key || !walletKey) return { amounts: {}, loading: false };
  return result && result.key === key ? { amounts: result.amounts, loading: false } : { amounts: {}, loading: true };
}

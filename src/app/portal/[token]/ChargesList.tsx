'use client';

import { useState } from 'react';
import type { PortalChargeRow } from '@/lib/portal-data';
import { formatDateShort, parseDateString } from '@/lib/date-format';
import { groupCharges, formatNameList } from '@/lib/portal-charges';
import { formatCents } from '@/lib/money';

export default function ChargesList({
  token,
  initial,
  initialHasMore,
}: {
  token: string;
  initial: PortalChargeRow[];
  initialHasMore: boolean;
}) {
  const [items, setItems] = useState(initial);
  const groups = groupCharges(items);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    const cursor = items[items.length - 1]?.cursor;
    if (cursor == null) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/portal/${token}/transactions?type=charge&cursor=${cursor}`,
      );
      if (!res.ok) throw new Error('fetch failed');
      const page = (await res.json()) as { items: PortalChargeRow[]; hasMore: boolean };
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className="rounded-[12px] border divide-y"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        {groups.length === 0 ? (
          <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            No lessons yet.
          </div>
        ) : (
          groups.map((g) => (
            <div
              key={g.key}
              className="flex items-center gap-2.5 px-3 py-2.5"
              style={{ borderColor: 'var(--line)' }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: 'var(--ink)' }}
                >
                  {formatNameList(g.names) ||
                    (g.sessions > 1 ? `${g.sessions} lessons` : 'Lesson')}
                </div>
                <div className="text-[11px] mono" style={{ color: 'var(--ink-3)' }}>
                  {formatDateShort(parseDateString(g.date))}
                  {g.names.length > 0 && g.sessions > 1
                    ? ` · ${g.sessions} lessons`
                    : ''}
                </div>
              </div>
              <div
                className="mono tnum text-[13px] font-medium shrink-0"
                style={{ color: 'var(--ink)' }}
              >
                −RM {formatCents(g.amountCents)}
              </div>
            </div>
          ))
        )}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-2 w-full text-[12px] py-2 rounded-[10px] border"
          style={{
            background: 'var(--panel)',
            borderColor: 'var(--line)',
            color: 'var(--ink-2)',
          }}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
      {error && (
        <div
          className="mt-2 text-[11px] text-center"
          style={{ color: 'var(--bad)' }}
        >
          Couldn&apos;t load more. Tap Load more to retry.
        </div>
      )}
    </>
  );
}

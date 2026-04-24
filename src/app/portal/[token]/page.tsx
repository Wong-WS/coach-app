import { notFound } from 'next/navigation';
import { fetchPortalData, type PortalPayload } from '@/lib/portal-data';

export const dynamic = 'force-dynamic';

function formatShortDate(iso: string): string {
  // "2026-04-24" → "24 Apr"
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function formatRM(n: number): string {
  const abs = Math.abs(n).toFixed(0);
  return `${n < 0 ? '−' : ''}RM ${abs}`;
}

function statusChip(status: PortalPayload['wallet']['status']) {
  const map: Record<PortalPayload['wallet']['status'], { label: string; bg: string; fg: string }> = {
    healthy: { label: 'Healthy', bg: 'var(--good-soft)', fg: 'var(--good)' },
    low: { label: 'Low', bg: 'var(--warn-soft)', fg: 'var(--warn)' },
    empty: { label: 'Empty', bg: 'var(--warn-soft)', fg: 'var(--warn)' },
    owing: { label: 'Owing', bg: 'var(--bad-soft)', fg: 'var(--bad)' },
    tab: { label: 'Tab mode', bg: 'var(--line)', fg: 'var(--ink-2)' },
    inactive: { label: 'Inactive', bg: 'var(--line)', fg: 'var(--ink-2)' },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchPortalData(token);
  if (!data) notFound();

  const { coach, wallet, suggestion, charges, topUps } = data;
  const owing = wallet.balance < 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {coach.displayName}
        </div>
        <div
          className="text-[20px] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {wallet.name}
        </div>
      </div>

      {/* Balance card */}
      <div
        className="rounded-[12px] border p-4"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <div
            className="text-[10.5px] font-semibold uppercase"
            style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
          >
            Current balance
          </div>
          {statusChip(wallet.status)}
        </div>
        <div
          className="mono tnum text-[34px] font-semibold"
          style={{
            color: owing ? 'var(--bad)' : 'var(--ink)',
            letterSpacing: '-0.8px',
          }}
        >
          {formatRM(wallet.balance)}
        </div>
        {wallet.rate > 0 && wallet.status !== 'tab' && (
          <div
            className="text-[11.5px] mt-1.5"
            style={{ color: 'var(--ink-3)' }}
          >
            Next lesson ≈ RM {wallet.rate.toFixed(0)}
          </div>
        )}
      </div>

      {/* Top-up suggestion (only when status is empty/owing AND we have a signal) */}
      {suggestion && (
        <div
          className="rounded-[12px] border p-4"
          style={{
            background: owing ? 'var(--bad-soft)' : 'var(--warn-soft)',
            borderColor: owing ? 'var(--bad)' : 'var(--warn)',
          }}
        >
          <div
            className="text-[13.5px] font-semibold mb-1"
            style={{ color: 'var(--ink)' }}
          >
            Time for the next top-up
          </div>
          <div className="mono tnum text-[22px] font-semibold" style={{ color: 'var(--ink)' }}>
            Suggested: RM {suggestion.amount}
          </div>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--ink-3)' }}>
            Tops you up to your usual RM {suggestion.usual}.
          </div>
        </div>
      )}

      {/* Recent lessons */}
      <section>
        <div
          className="text-[10.5px] font-semibold uppercase mb-2"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Recent lessons
        </div>
        <div
          className="rounded-[12px] border divide-y"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
        >
          {charges.length === 0 ? (
            <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              No lessons yet.
            </div>
          ) : (
            charges.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2.5"
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-medium truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {c.studentName || 'Lesson'}
                  </div>
                  <div className="text-[11px] mono" style={{ color: 'var(--ink-3)' }}>
                    {formatShortDate(c.date)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="mono tnum text-[13px] font-medium"
                    style={{ color: 'var(--ink)' }}
                  >
                    −RM {c.amount.toFixed(0)}
                  </div>
                  <div className="mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                    bal {formatRM(c.balanceAfter)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Top-up history */}
      <section>
        <div
          className="text-[10.5px] font-semibold uppercase mb-2"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Top-ups
        </div>
        <div
          className="rounded-[12px] border divide-y"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
        >
          {topUps.length === 0 ? (
            <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              No top-ups yet.
            </div>
          ) : (
            topUps.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2.5"
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-medium"
                    style={{ color: 'var(--ink)' }}
                  >
                    Top-up
                  </div>
                  <div className="text-[11px] mono" style={{ color: 'var(--ink-3)' }}>
                    {formatShortDate(t.date)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="mono tnum text-[13px] font-medium"
                    style={{ color: 'var(--good)' }}
                  >
                    +RM {t.amount.toFixed(0)}
                  </div>
                  <div className="mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                    bal {formatRM(t.balanceAfter)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Footer */}
      <div
        className="text-[11.5px] text-center pt-3 pb-6"
        style={{ color: 'var(--ink-3)' }}
      >
        Questions? Contact your coach.
      </div>
    </div>
  );
}

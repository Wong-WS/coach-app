// src/app/_components/OverviewPreview.tsx
import { IconCheck } from '@/components/paper';

interface MockClass {
  time: string;
  name: string;
  location: string;
  balance: number;
}

const MOCK_CLASSES: MockClass[] = [
  { time: '09:00', name: 'Junior squad', location: 'Court 2', balance: 320 },
  { time: '16:30', name: 'Aiden · 1-on-1', location: 'Court 1', balance: 240 },
  { time: '19:00', name: 'Adult intermediate', location: 'Court 3', balance: 180 },
];

export function OverviewPreview() {
  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--line)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Faux topbar — matches dashboard/layout.tsx */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--line)' }}
      >
        <div
          className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center font-bold text-[11px]"
          style={{
            background: 'var(--ink)',
            color: 'var(--bg)',
            letterSpacing: '-0.5px',
          }}
        >
          C
        </div>
        <span className="text-[13px] font-semibold" style={{ letterSpacing: '-0.2px' }}>
          Coach
        </span>
        <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>
          /demo-coach
        </span>
        <div className="flex-1" />
        <div
          className="w-[20px] h-[20px] rounded-full"
          style={{ background: 'var(--line)' }}
          aria-hidden="true"
        />
      </div>

      {/* Body */}
      <div className="p-5">
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: 'var(--ink-4)' }}
        >
          Today · Friday
        </div>
        <h3
          className="mt-1 text-[20px] font-semibold"
          style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
        >
          3 classes today
        </h3>

        <ul className="mt-4 space-y-2">
          {MOCK_CLASSES.map((c) => (
            <li
              key={c.time}
              className="flex items-center gap-3 rounded-[10px] border px-3 py-2.5"
              style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
            >
              <span
                className="mono tnum text-[12.5px] font-medium w-[42px]"
                style={{ color: 'var(--ink-2)' }}
              >
                {c.time}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-semibold truncate"
                  style={{ color: 'var(--ink)' }}
                >
                  {c.name}
                </p>
                <p className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                  {c.location}
                </p>
              </div>
              <span
                className="mono tnum text-[11.5px] font-medium rounded-lg px-2 py-0.5"
                style={{
                  color: 'var(--good)',
                  background: 'var(--good-soft)',
                  letterSpacing: '-0.01em',
                }}
              >
                RM {c.balance}
              </span>
            </li>
          ))}
        </ul>

        <div
          className="mt-4 flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5"
          style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
              Mark today as done
            </p>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              Lessons logged, wallets charged.
            </p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            <IconCheck size={13} sw={2.2} />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

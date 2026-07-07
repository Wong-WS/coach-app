'use client';

import { useState } from 'react';
import type { PortalLessonSets, PortalSet } from '@/lib/portal-sets';
import { formatDateShort, parseDateString } from '@/lib/date-format';

function reconNote(set: PortalSet, current: boolean): { text: string; color: string } | null {
  const r = set.reconciliation;
  if (r.kind === 'none') return null;
  if (r.kind === 'credit') {
    return {
      // Earlier sets already carried their leftover forward → short form.
      text: current ? `RM ${r.amount} credit — carries to your next top-up` : `RM ${r.amount} credit`,
      color: 'var(--good)',
    };
  }
  return {
    text: current ? `RM ${r.amount} owed — added to your next payment` : `RM ${r.amount} owed`,
    color: 'var(--bad)',
  };
}

function SetCard({ set, current }: { set: PortalSet; current: boolean }) {
  const rows = [];
  for (let i = 0; i < set.slots; i++) {
    const lesson = set.lessons[i]; // oldest-first; lesson.n === i + 1
    rows.push(
      <div
        key={i}
        className="flex items-center gap-2.5 px-3 py-2.5"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="mono text-[12px] w-5 text-right shrink-0" style={{ color: 'var(--ink-3)' }}>
          {i + 1}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {lesson ? (
            <>
              <span className="text-[12px]" style={{ color: 'var(--good)' }}>
                ✓
              </span>
              <span className="mono text-[12.5px] truncate" style={{ color: 'var(--ink)' }}>
                {formatDateShort(parseDateString(lesson.date))}
              </span>
            </>
          ) : (
            <span className="mono text-[12.5px]" style={{ color: 'var(--ink-4)' }}>
              —
            </span>
          )}
        </div>
        <div className="mono tnum text-[12.5px] shrink-0" style={{ color: 'var(--ink-2)' }}>
          {lesson ? `RM ${lesson.price.toFixed(0)}` : ''}
        </div>
      </div>,
    );
  }

  const header = set.topUp
    ? `RM ${set.topUp.amount.toFixed(0)} · ${formatDateShort(parseDateString(set.topUp.date))}`
    : 'Lessons';
  const note = reconNote(set, current);

  return (
    <div
      className="rounded-[12px] border overflow-hidden"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <span
          className="text-[10.5px] font-semibold uppercase"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          {current ? 'Current set' : 'Earlier set'}
        </span>
        <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {header}
        </span>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
        {rows}
      </div>

      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <span className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
          {set.done} done · {set.left} left
        </span>
        {note && (
          <span className="text-[11px] font-medium text-right" style={{ color: note.color }}>
            {note.text}
          </span>
        )}
      </div>
    </div>
  );
}

function FlatList({ flat }: { flat: PortalLessonSets['flat'] }) {
  return (
    <div
      className="rounded-[12px] border divide-y"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      {flat.length === 0 ? (
        <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          No lessons yet.
        </div>
      ) : (
        flat.map((c, i) => (
          <div
            key={`${c.date}-${i}`}
            className="flex items-center gap-2.5 px-3 py-2.5"
            style={{ borderColor: 'var(--line)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
                Lesson
              </div>
              <div className="text-[11px] mono" style={{ color: 'var(--ink-3)' }}>
                {formatDateShort(parseDateString(c.date))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="mono tnum text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
                −RM {c.price.toFixed(0)}
              </div>
              <div className="mono text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                bal {c.balanceAfter < 0 ? '−' : ''}RM {Math.abs(c.balanceAfter).toFixed(0)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function LessonSets({ sets }: { sets: PortalLessonSets }) {
  const [shown, setShown] = useState(0);

  if (sets.mode === 'flat') {
    return <FlatList flat={sets.flat} />;
  }

  if (!sets.current) {
    return (
      <div
        className="rounded-[12px] border px-3 py-4 text-[12.5px]"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink-3)' }}
      >
        No lessons yet.
      </div>
    );
  }

  const earlier = sets.earlier.slice(0, shown);
  const moreLeft = shown < sets.earlier.length;

  return (
    <div className="space-y-3">
      <SetCard set={sets.current} current />
      {earlier.map((s, i) => (
        <SetCard key={i} set={s} current={false} />
      ))}
      {moreLeft && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 1)}
          className="w-full text-[12px] py-2 rounded-[10px] border"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}
        >
          Show earlier lessons
        </button>
      )}
    </div>
  );
}

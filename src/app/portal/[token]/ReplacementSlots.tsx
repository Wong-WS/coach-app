'use client';

import { useState } from 'react';
import { visibleWindow, weekLabel, type ReplacementSection } from '@/lib/replacement-slots';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${DAY[new Date(y, m - 1, d).getDay()]} ${d} ${MONTH[m - 1]}`;
}

/** "1–2pm", "11:30am–12:30pm". */
function timeRange(start: string, end: string): string {
  const part = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return { label: `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}`, ap: h < 12 ? 'am' : 'pm' };
  };
  const a = part(start);
  const b = part(end);
  return `${a.label}${a.ap === b.ap ? '' : a.ap}–${b.label}${b.ap}`;
}

function lengthLabel(minutes: number): string {
  if (minutes === 60) return '1-hour';
  if (minutes === 90) return '1½-hour';
  return `${minutes}-minute`;
}

const caps: React.CSSProperties = { color: 'var(--ink-3)', letterSpacing: '0.06em' };

function Section({ section, today, coachName }: { section: ReplacementSection; today: string; coachName: string }) {
  const [showMornings, setShowMornings] = useState(!section.hideWeekdayMornings);
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const weeks: { label: string; days: ReplacementSection['days'] }[] = [];
  for (const day of section.days) {
    const label = weekLabel(day.date, today);
    const last = weeks[weeks.length - 1];
    if (last && last.label === label) last.days.push(day);
    else weeks.push({ label, days: [day] });
  }
  const visibleWeeks = showAllWeeks ? weeks : weeks.slice(0, 2);
  const hiddenWeek = weeks[2];

  return (
    <div className="pt-1">
      <div className="text-[12px] mb-2" style={{ color: 'var(--ink-3)' }}>
        Free times at <b style={{ color: 'var(--ink-2)' }}>{section.poolName}</b>
        {section.forClass ? ` for the ${section.forClass} class` : ''}. Any{' '}
        {lengthLabel(section.lessonMinutes)} lesson inside these times works.
      </div>

      {section.hideWeekdayMornings && (
        <button
          type="button"
          onClick={() => setShowMornings((v) => !v)}
          className="text-[12px] font-medium mb-1 rounded-full border px-3 py-1"
          style={{ color: 'var(--ink-2)', borderColor: 'var(--line-2)' }}
        >
          {showMornings ? 'Hide weekday mornings' : 'Show morning slots'}
        </button>
      )}

      {visibleWeeks.map((week) => (
        <div key={week.label}>
          <div className="text-[10.5px] font-semibold uppercase mt-3 mb-1" style={caps}>
            {week.label}
          </div>
          {week.days.map((day) => {
            const shown = day.windows
              .map((w) => visibleWindow(w, showMornings, section.lessonMinutes))
              .filter((w): w is { start: string; end: string } => w !== null);
            const onlyMornings = shown.length === 0 && day.windows.length > 0;
            return (
              <div key={day.date} className="flex gap-2.5 py-2 border-t" style={{ borderColor: 'var(--line)' }}>
                <div className="w-[78px] shrink-0 text-[12.5px] font-semibold pt-1" style={{ color: 'var(--ink)' }}>
                  {dateLabel(day.date)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {shown.length > 0 ? (
                    shown.map((s) => (
                      <span
                        key={s.start}
                        className="mono tnum text-[12.5px] font-semibold rounded-full px-2.5 py-1"
                        style={{ background: 'var(--good-soft)', color: 'var(--good)' }}
                      >
                        {timeRange(s.start, s.end)}
                      </span>
                    ))
                  ) : (
                    <span className="text-[12px] pt-1" style={{ color: 'var(--ink-3)' }}>
                      {onlyMornings ? 'Mornings only' : 'Fully booked'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {!showAllWeeks && hiddenWeek && (
        <button
          type="button"
          onClick={() => setShowAllWeeks(true)}
          className="text-[12.5px] font-medium pt-2"
          style={{ color: 'var(--ink-2)' }}
        >
          + {hiddenWeek.label} ›
        </button>
      )}

      <div className="text-[12px] mt-3" style={{ color: 'var(--ink-2)' }}>
        Message {coachName} with the time you&apos;d like.
      </div>
    </div>
  );
}

/**
 * Folded "Need a replacement class?" row for the parent portal. Shows the
 * coach's free slots at the family's pool when opened. Read-only: parents
 * message the coach to book.
 */
export default function ReplacementSlots({
  sections,
  today,
  coachName,
}: {
  sections: ReplacementSection[];
  today: string;
  coachName: string;
}) {
  const [open, setOpen] = useState(false);
  if (sections.length === 0) return null;
  const pools = [...new Set(sections.map((s) => s.poolName))].join(' & ');

  return (
    <div className="rounded-[12px] border" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
            Need a replacement class?
          </div>
          <div className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
            See {coachName}&apos;s free slots at {pools}
          </div>
        </div>
        <span className="text-[16px] shrink-0" style={{ color: 'var(--ink-3)' }}>
          {open ? '⌄' : '›'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div
            className="rounded-[10px] px-3 py-2 mb-2 text-[12px] leading-snug"
            style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
          >
            <b>For one-off replacement classes only.</b> These are gaps that happen to be free on these
            dates, often because another class moved or was cancelled. They are not regular weekly slots
            and can change any time.
          </div>
          {sections.map((section) => (
            <Section key={`${section.poolName}|${section.forClass}`} section={section} today={today} coachName={coachName} />
          ))}
          <div className="text-[11px] mt-2" style={{ color: 'var(--ink-3)' }}>
            Updated live — check back if nothing fits.
          </div>
        </div>
      )}
    </div>
  );
}

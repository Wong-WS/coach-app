import { describe, it, expect } from 'vitest';
import { freeWindowsForDate, mainWeeklyClass, replacementSections, visibleWindow, weekLabel } from '@/lib/replacement-slots';
import { getClassesForDate } from '@/lib/class-schedule';
import type { AwayPeriod, Booking, ClassException } from '@/types';

function cls(startTime: string, endTime: string, locationId: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id: `${locationId}-${startTime}`,
    locationId,
    locationName: locationId[0].toUpperCase() + locationId.slice(1),
    dayOfWeek: 'thursday',
    startTime,
    endTime,
    status: 'confirmed',
    className: '',
    notes: '',
    studentIds: ['other'],
    studentPriceCents: { other: 6000 },
    studentWallets: {},
    createdAt: new Date(),
    ...overrides,
  };
}

const spans = (w: { start: string; end: string }[]) => w.map((x) => `${x.start}-${x.end}`);

describe('freeWindowsForDate', () => {
  it('is one window from 8 am to 9 pm on a free day', () => {
    expect(freeWindowsForDate([], 'permai', 60)).toEqual([{ start: '08:00', end: '21:00' }]);
  });

  it('splits around a class at the same pool with no travel', () => {
    expect(spans(freeWindowsForDate([cls('16:30', '17:30', 'permai')], 'permai', 60))).toEqual([
      '08:00-16:30',
      '17:30-21:00',
    ]);
  });

  it('keeps an evening window whole, so any hour inside it can be asked for (6:30–9pm)', () => {
    const day = [cls('17:00', '18:00', 'quavside')];
    expect(spans(freeWindowsForDate(day, 'brezza', 60))).toContain('18:30-21:00');
  });

  it('allows travel time only towards a different pool', () => {
    const day = [cls('12:00', '13:00', 'granito'), cls('14:30', '15:30', 'quavside')];
    expect(spans(freeWindowsForDate(day, 'granito', 60))).toContain('13:00-14:00');
    expect(spans(freeWindowsForDate(day, 'quavside', 60))).toContain('13:30-14:30');
  });

  it('leaves out a gap too short once travel both ways is counted', () => {
    const day = [cls('12:00', '13:00', 'granito'), cls('14:00', '15:00', 'quavside')];
    const between = freeWindowsForDate(day, 'permai', 60).filter((w) => w.start >= '13:00' && w.end <= '14:00');
    expect(between).toEqual([]);
  });

  it('only keeps windows long enough for the lesson (45 minutes here)', () => {
    const day = [cls('10:00', '11:00', 'permai'), cls('11:40', '12:40', 'permai')];
    expect(spans(freeWindowsForDate(day, 'permai', 45))).not.toContain('11:00-11:40');
    expect(spans(freeWindowsForDate(day, 'permai', 30))).toContain('11:00-11:40');
  });

  it('starts after a class that runs past 8 am', () => {
    expect(freeWindowsForDate([cls('07:00', '08:30', 'permai')], 'permai', 60)[0].start).toBe('08:30');
  });

  it('leaves travel time after an early class at another pool that ends before 8 am', () => {
    expect(freeWindowsForDate([cls('07:00', '07:45', 'granito')], 'permai', 60)[0].start).toBe('08:15');
  });

  it('stops before a late class', () => {
    const w = freeWindowsForDate([cls('20:30', '21:30', 'permai')], 'permai', 60);
    expect(w[w.length - 1].end).toBe('20:30');
  });

  it('waits for the later of two overlapping classes to finish', () => {
    const day = [cls('10:00', '11:00', 'permai'), cls('10:30', '11:30', 'permai')];
    expect(freeWindowsForDate(day, 'permai', 60).find((w) => w.start >= '10:00')?.start).toBe('11:30');
  });

  it('reflects that date: a cancelled class frees its time, a one-off blocks it', () => {
    const weekly = cls('16:30', '17:30', 'permai', { id: 'weekly' });
    const oneOff = cls('10:00', '11:00', 'permai', { id: 'oneoff', startDate: '2026-11-19', endDate: '2026-11-19' });
    const cancelled: ClassException = {
      id: 'ex',
      bookingId: 'weekly',
      originalDate: '2026-11-19',
      type: 'cancelled',
      createdAt: new Date(),
    };
    const covers = (w: { start: string; end: string }[], from: string, to: string) => w.some((x) => x.start <= from && x.end >= to);
    const withClass = freeWindowsForDate(getClassesForDate('2026-11-19', [weekly, oneOff], []), 'permai', 60);
    expect(covers(withClass, '16:30', '17:30')).toBe(false);
    const day = freeWindowsForDate(getClassesForDate('2026-11-19', [weekly, oneOff], [cancelled]), 'permai', 60);
    expect(covers(day, '16:30', '17:30')).toBe(true);
    expect(covers(day, '10:00', '11:00')).toBe(false);
  });
});

describe('visibleWindow', () => {
  const w = (start: string, end: string, weekdayMorning: boolean) => ({ start, end, weekdayMorning });

  it('trims a weekday window to start at noon when mornings are hidden', () => {
    expect(visibleWindow(w('08:00', '15:00', true), false, 60)).toEqual({ start: '12:00', end: '15:00' });
  });

  it('drops a weekday morning window with no full lesson left after noon', () => {
    expect(visibleWindow(w('08:00', '12:30', true), false, 60)).toBeNull();
  });

  it('shows everything once mornings are shown, and never trims weekends', () => {
    expect(visibleWindow(w('08:00', '15:00', true), true, 60)).toEqual({ start: '08:00', end: '15:00' });
    expect(visibleWindow(w('08:00', '15:00', false), false, 60)).toEqual({ start: '08:00', end: '15:00' });
  });
});

// ── Sections for a family ───────────────────────────────────────────────────

const TODAY = '2026-11-18'; // Wednesday
const weekly = (id: string, day: Booking['dayOfWeek'], start: string, end: string, loc: string, studentIds: string[], extra: Partial<Booking> = {}) =>
  cls(start, end, loc, { id, dayOfWeek: day, studentIds, studentPriceCents: Object.fromEntries(studentIds.map((s) => [s, 6000])), ...extra });

describe('mainWeeklyClass', () => {
  it('picks the pool with the most weekly classes', () => {
    const b = [
      weekly('p1', 'monday', '16:00', '17:00', 'permai', ['s1']),
      weekly('p2', 'thursday', '16:00', '17:00', 'permai', ['s1']),
      weekly('q1', 'tuesday', '09:00', '10:00', 'quavside', ['s1']),
    ];
    expect(mainWeeklyClass('s1', b, TODAY)?.locationId).toBe('permai');
  });

  it('ignores one-offs and ended series, and returns null with no weekly class', () => {
    const b = [
      weekly('one', 'friday', '16:00', '17:00', 'permai', ['s1'], { startDate: '2026-11-20', endDate: '2026-11-20' }),
      weekly('ended', 'monday', '16:00', '17:00', 'permai', ['s1'], { endDate: '2026-11-01' }),
    ];
    expect(mainWeeklyClass('s1', b, TODAY)).toBeNull();
  });
});

describe('replacementSections', () => {
  const ethan = weekly('weekly-thu', 'thursday', '16:30', '17:30', 'permai', ['s1']);
  const run = (bookings: Booking[], awayPeriods: AwayPeriod[] = [], studentIds = ['s1']) =>
    replacementSections({ studentIds, bookings, exceptions: [], awayPeriods, today: TODAY });

  it('covers tomorrow to the Sunday of the week after next', () => {
    const [section] = run([ethan]);
    expect(section.days[0].date).toBe('2026-11-19');
    expect(section.days[section.days.length - 1].date).toBe('2026-12-06');
    expect(section).toMatchObject({ poolName: 'Permai', lessonMinutes: 60, forClass: null });
  });

  it('leaves out days inside time off', () => {
    const away: AwayPeriod = { id: 'a', startDate: '2026-11-21', endDate: '2026-11-23', createdAt: new Date(), updatedAt: new Date() };
    const dates = run([ethan], [away])[0].days.map((d) => d.date);
    expect(dates).not.toContain('2026-11-21');
    expect(dates).not.toContain('2026-11-23');
    expect(dates).toContain('2026-11-24');
  });

  it('hides weekday mornings for an afternoon student, but not weekend mornings', () => {
    const [section] = run([ethan]);
    expect(section.hideWeekdayMornings).toBe(true);
    const fri = section.days.find((d) => d.date === '2026-11-20')!;
    const sat = section.days.find((d) => d.date === '2026-11-21')!;
    expect(fri.windows).toEqual([{ start: '08:00', end: '21:00', weekdayMorning: true }]);
    expect(sat.windows).toEqual([{ start: '08:00', end: '21:00', weekdayMorning: false }]);
  });

  it('shows everything for a student whose weekly class starts before 2 pm', () => {
    expect(run([weekly('w', 'thursday', '13:00', '14:00', 'permai', ['s1'])])[0].hideWeekdayMornings).toBe(false);
  });

  it('gives siblings on the same class one section, and different pools two', () => {
    expect(run([weekly('w', 'thursday', '16:30', '17:30', 'permai', ['s1', 's2'])], [], ['s1', 's2'])).toHaveLength(1);
    const two = run(
      [ethan, weekly('sat', 'saturday', '09:00', '10:00', 'quavside', ['s2'])],
      [],
      ['s1', 's2'],
    );
    expect(two.map((s) => [s.poolName, s.forClass])).toEqual([
      ['Permai', 'Thu 4:30pm'],
      ['Quavside', 'Sat 9am'],
    ]);
  });

  it('is empty when nobody has a weekly class', () => {
    expect(run([])).toEqual([]);
  });

  it("doesn't leak booking ids, student ids or other pools", () => {
    const otherFamily = weekly('secret-booking', 'friday', '12:00', '13:00', 'granito', ['other-kid']);
    const json = JSON.stringify(run([ethan, otherFamily]));
    expect(json).not.toContain('weekly-thu');
    expect(json).not.toContain('secret-booking');
    expect(json).not.toContain('s1');
    expect(json).not.toContain('other-kid');
    expect(json).not.toContain('Granito');
  });
});

describe('weekLabel', () => {
  it('names this week, next week, then the Monday of later weeks', () => {
    expect(weekLabel('2026-11-20', TODAY)).toBe('This week');
    expect(weekLabel('2026-11-24', TODAY)).toBe('Next week');
    expect(weekLabel('2026-12-01', TODAY)).toBe('Week of 30 Nov');
  });
});

describe('bad lesson lengths', () => {
  it('offers nothing for a zero-length lesson', () => {
    expect(freeWindowsForDate([], 'permai', 0)).toEqual([]);
  });

  it('skips a weekly class whose end is not after its start', () => {
    const broken = weekly('broken', 'thursday', '16:00', '16:00', 'permai', ['s1']);
    expect(replacementSections({ studentIds: ['s1'], bookings: [broken], exceptions: [], awayPeriods: [], today: TODAY })).toEqual([]);
  });
});

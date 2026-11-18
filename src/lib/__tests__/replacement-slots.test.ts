import { describe, it, expect } from 'vitest';
import { mainWeeklyClass, replacementSections, slotsForDate, weekLabel } from '@/lib/replacement-slots';
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

const starts = (slots: { start: string; end: string }[]) => slots.map((s) => `${s.start}-${s.end}`);

describe('slotsForDate', () => {
  it('offers every hour from 8 am to 9 pm on a free day', () => {
    const slots = slotsForDate([], 'permai', 60);
    expect(slots).toHaveLength(13);
    expect(slots[0]).toEqual({ start: '08:00', end: '09:00' });
    expect(slots[12]).toEqual({ start: '20:00', end: '21:00' });
  });

  it('offers the slots right before and after a class at the same pool', () => {
    const slots = starts(slotsForDate([cls('16:30', '17:30', 'permai')], 'permai', 60));
    expect(slots[0]).toBe('08:00-09:00');
    expect(slots).toContain('15:30-16:30');
    expect(slots).toContain('17:30-18:30');
    expect(slots).not.toContain('16:00-17:00');
  });

  it('allows travel time only towards a different pool', () => {
    const day = [cls('12:00', '13:00', 'granito'), cls('14:30', '15:30', 'quavside')];
    expect(starts(slotsForDate(day, 'granito', 60))).toContain('13:00-14:00');
    expect(starts(slotsForDate(day, 'quavside', 60))).toContain('13:30-14:30');
  });

  it('offers nothing in a gap too short once travel both ways is counted', () => {
    const day = [cls('12:00', '13:00', 'granito'), cls('14:00', '15:00', 'quavside')];
    const between = slotsForDate(day, 'permai', 60).filter((s) => s.start >= '13:00' && s.end <= '14:00');
    expect(between).toEqual([]);
  });

  it('uses the lesson length, here 45 minutes', () => {
    const slots = starts(slotsForDate([cls('16:00', '16:45', 'permai')], 'permai', 45));
    expect(slots).toContain('15:15-16:00');
    expect(slots).toContain('16:45-17:30');
    expect(slots[0]).toBe('08:00-08:45');
  });

  it('starts after a class that runs past 8 am', () => {
    expect(slotsForDate([cls('07:00', '08:30', 'permai')], 'permai', 60)[0]).toEqual({ start: '08:30', end: '09:30' });
  });

  it('never runs past the start of a late class or past 9 pm', () => {
    const slots = slotsForDate([cls('20:30', '21:30', 'permai')], 'permai', 60);
    expect(slots[slots.length - 1].end <= '20:30').toBe(true);
  });

  it('waits for the later of two overlapping classes to finish', () => {
    const day = [cls('10:00', '11:00', 'permai'), cls('10:30', '11:30', 'permai')];
    const after = slotsForDate(day, 'permai', 60).filter((s) => s.start >= '10:00');
    expect(after[0]).toEqual({ start: '11:30', end: '12:30' });
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
    const withClass = starts(slotsForDate(getClassesForDate('2026-11-19', [weekly, oneOff], []), 'permai', 60));
    expect(withClass).not.toContain('16:00-17:00'); // the weekly class is in the way

    const day = getClassesForDate('2026-11-19', [weekly, oneOff], [cancelled]);
    const slots = starts(slotsForDate(day, 'permai', 60));
    expect(slots).toContain('16:00-17:00'); // cancelled → that time is free
    expect(slots).not.toContain('10:00-11:00'); // the one-off on that date blocks it
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
    expect(fri.slots.find((s) => s.start === '09:00')?.weekdayMorning).toBe(true);
    expect(fri.slots.find((s) => s.start === '13:00')?.weekdayMorning).toBe(false);
    expect(sat.slots.find((s) => s.start === '09:00')?.weekdayMorning).toBe(false);
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

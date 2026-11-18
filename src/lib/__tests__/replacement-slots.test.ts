import { describe, it, expect } from 'vitest';
import { slotsForDate } from '@/lib/replacement-slots';
import { getClassesForDate } from '@/lib/class-schedule';
import type { Booking, ClassException } from '@/types';

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

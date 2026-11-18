import { describe, it, expect } from 'vitest';
import {
  cancellationRate,
  collectCancellations,
  countReschedules,
  reasonCounts,
} from '@/lib/analytics/cancellations';
import { monthRange } from '@/lib/analytics/periods';
import type { Booking, ClassException } from '@/types';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b',
    locationId: 'loc1',
    locationName: 'Pool A',
    dayOfWeek: 'monday',
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    className: 'Swim',
    notes: '',
    studentIds: ['s1'],
    studentPriceCents: { s1: 6000 },
    studentWallets: {},
    createdAt: new Date(),
    ...overrides,
  };
}

function makeEx(overrides: Partial<ClassException> = {}): ClassException {
  return {
    id: 'ex',
    bookingId: 'b',
    originalDate: '2026-11-16', // a Monday
    type: 'cancelled',
    createdAt: new Date(),
    ...overrides,
  };
}

const NOV = monthRange(2026, 11);
const DEC = monthRange(2026, 12);
const b = makeBooking();

describe('collectCancellations — weekly classes', () => {
  it('records a cancelled date with its reason and students', () => {
    expect(collectCancellations(NOV, [makeEx({ reason: 'weather' })], [b])).toEqual([
      { date: '2026-11-16', bucket: 'weather', bookingId: 'b', studentIds: ['s1'] },
    ]);
  });

  it('puts cancellations without a reason in the "none" bucket', () => {
    expect(collectCancellations(NOV, [makeEx()], [b])[0].bucket).toBe('none');
  });

  it('leaves out classes skipped for time off', () => {
    expect(collectCancellations(NOV, [makeEx({ reason: 'away' })], [b])).toEqual([]);
  });

  it('skips a cancellation on a day the class does not run (left behind by an edit)', () => {
    expect(collectCancellations(NOV, [makeEx({ originalDate: '2026-11-17' })], [b])).toEqual([]);
  });

  it('skips a cancellation after the series ended', () => {
    const ended = makeBooking({ endDate: '2026-11-09' });
    expect(collectCancellations(NOV, [makeEx()], [ended])).toEqual([]);
  });

  it('skips a cancellation whose booking no longer exists', () => {
    expect(collectCancellations(NOV, [makeEx()], [])).toEqual([]);
  });

  it('counts a moved-then-cancelled class on the day it was moved to', () => {
    const ex = makeEx({ originalDate: '2026-11-30', newDate: '2026-12-02' });
    expect(collectCancellations(NOV, [ex], [b])).toEqual([]);
    expect(collectCancellations(DEC, [ex], [b])[0].date).toBe('2026-12-02');
  });

  it("uses a moved class's own student list", () => {
    const ex = makeEx({ newDate: '2026-11-18', newStudentIds: ['s1', 's2'] });
    expect(collectCancellations(NOV, [ex], [b])[0].studentIds).toEqual(['s1', 's2']);
  });

  it('ignores rescheduled exceptions', () => {
    expect(collectCancellations(NOV, [makeEx({ type: 'rescheduled', newDate: '2026-11-18' })], [b])).toEqual([]);
  });
});

describe('collectCancellations — one-off classes', () => {
  const oneOff = (overrides: Partial<Booking>) =>
    makeBooking({
      id: 'one',
      dayOfWeek: 'friday',
      startDate: '2026-11-20',
      endDate: '2026-11-20',
      status: 'cancelled',
      cancelReason: 'student',
      ...overrides,
    });

  it('records a soft-cancelled one-off on its date', () => {
    expect(collectCancellations(NOV, [], [oneOff({})])).toEqual([
      { date: '2026-11-20', bucket: 'student', bookingId: 'one', studentIds: ['s1'] },
    ]);
  });

  it('leaves out one-offs cancelled for time off', () => {
    expect(collectCancellations(NOV, [], [oneOff({ cancelReason: 'away' })])).toEqual([]);
  });

  it('leaves out one-offs cancelled by deleting their student (no reason)', () => {
    expect(collectCancellations(NOV, [], [oneOff({ cancelReason: undefined })])).toEqual([]);
  });

  it('does not count a confirmed one-off', () => {
    expect(collectCancellations(NOV, [], [oneOff({ status: 'confirmed', cancelReason: undefined })])).toEqual([]);
  });

  it('does not count a one-off from another month', () => {
    expect(collectCancellations(DEC, [], [oneOff({})])).toEqual([]);
  });
});

describe('reasonCounts', () => {
  it('counts every bucket, including zeros', () => {
    const records = collectCancellations(
      NOV,
      [
        makeEx({ id: 'a', reason: 'weather' }),
        makeEx({ id: 'b2', originalDate: '2026-11-23', reason: 'weather' }),
        makeEx({ id: 'c', originalDate: '2026-11-30' }),
      ],
      [b],
    );
    expect(reasonCounts(records)).toEqual({ weather: 2, student: 0, coach: 0, other: 0, none: 1 });
  });
});

describe('countReschedules', () => {
  it('counts real moves (new date or new time) but not plain one-date edits', () => {
    const movedDate = makeEx({ id: 'm1', type: 'rescheduled', newDate: '2026-11-18' });
    const movedTime = makeEx({ id: 'm2', type: 'rescheduled', originalDate: '2026-11-23', newDate: '2026-11-23', newStartTime: '12:00' });
    const plainEdit = makeEx({ id: 'm3', type: 'rescheduled', originalDate: '2026-11-30', newDate: '2026-11-30', newStartTime: '10:00' });
    expect(countReschedules(NOV, [movedDate, movedTime, plainEdit], [b])).toBe(2);
  });

  it('skips moves left behind on a day the class does not run', () => {
    const orphan = makeEx({ type: 'rescheduled', originalDate: '2026-11-17', newDate: '2026-11-19' });
    expect(countReschedules(NOV, [orphan], [b])).toBe(0);
  });
});

describe('cancellationRate', () => {
  it('is zero with no classes at all', () => {
    expect(cancellationRate(0, 0)).toBe(0);
  });

  it('is cancelled out of cancelled + taught', () => {
    expect(cancellationRate(16, 84)).toBeCloseTo(0.16);
  });
});

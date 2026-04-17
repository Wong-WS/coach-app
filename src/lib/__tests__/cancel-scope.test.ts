import { describe, it, expect } from 'vitest';
import { computeCancelFuture } from '@/lib/cancel-scope';
import type { Booking, ClassException } from '@/types';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    locationId: 'loc1',
    locationName: 'Court A',
    dayOfWeek: 'monday',
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    clientName: 'Alice',
    clientPhone: '+60123456789',
    lessonType: 'private',
    groupSize: 1,
    notes: '',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeException(overrides: Partial<ClassException> = {}): ClassException {
  return {
    id: 'ex1',
    bookingId: 'b1',
    originalDate: '2026-04-20',
    type: 'cancelled',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('computeCancelFuture', () => {
  it('sets endDate to the day before when cutoff is after the booking start', () => {
    const booking = makeBooking({ startDate: '2026-01-05' });
    const result = computeCancelFuture(booking, [], '2026-04-20');
    expect(result).toEqual({ action: 'endDate', newEndDate: '2026-04-19', exceptionIdsToDelete: [] });
  });

  it('deletes the booking when the cutoff equals the booking start', () => {
    const booking = makeBooking({ startDate: '2026-04-20' });
    const result = computeCancelFuture(booking, [], '2026-04-20');
    expect(result.action).toBe('delete');
  });

  it('deletes the booking when the cutoff precedes the booking start', () => {
    const booking = makeBooking({ startDate: '2026-05-01' });
    const result = computeCancelFuture(booking, [], '2026-04-20');
    expect(result.action).toBe('delete');
  });

  it('keeps past exceptions and drops exceptions on or after the cutoff', () => {
    const booking = makeBooking({ startDate: '2026-01-05' });
    const exceptions: ClassException[] = [
      makeException({ id: 'past', originalDate: '2026-03-02' }),
      makeException({ id: 'cutoff', originalDate: '2026-04-20' }),
      makeException({ id: 'future', originalDate: '2026-05-04' }),
      makeException({ id: 'other-booking', bookingId: 'b2', originalDate: '2026-04-20' }),
    ];
    const result = computeCancelFuture(booking, exceptions, '2026-04-20');
    if (result.action !== 'endDate') throw new Error(`expected endDate, got ${result.action}`);
    expect(result.newEndDate).toBe('2026-04-19');
    expect(new Set(result.exceptionIdsToDelete)).toEqual(new Set(['cutoff', 'future']));
  });

  it('drops ALL exceptions for this booking when deleting outright', () => {
    const booking = makeBooking({ startDate: '2026-05-01' });
    const exceptions: ClassException[] = [
      makeException({ id: 'before', originalDate: '2026-04-10' }),
      makeException({ id: 'after', originalDate: '2026-06-01' }),
      makeException({ id: 'other', bookingId: 'b2', originalDate: '2026-04-10' }),
    ];
    const result = computeCancelFuture(booking, exceptions, '2026-04-20');
    expect(result.action).toBe('delete');
    expect(new Set(result.exceptionIdsToDelete)).toEqual(new Set(['before', 'after']));
  });

  it('treats a booking with no startDate as open-ended and updates endDate', () => {
    const booking = makeBooking({ startDate: undefined });
    const result = computeCancelFuture(booking, [], '2026-04-20');
    expect(result).toEqual({ action: 'endDate', newEndDate: '2026-04-19', exceptionIdsToDelete: [] });
  });

  it('handles month-boundary dates correctly', () => {
    const booking = makeBooking({ startDate: '2026-01-05' });
    const result = computeCancelFuture(booking, [], '2026-05-01');
    if (result.action !== 'endDate') throw new Error(`expected endDate, got ${result.action}`);
    expect(result.newEndDate).toBe('2026-04-30');
  });
});

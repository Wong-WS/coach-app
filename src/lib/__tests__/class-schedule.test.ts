import { describe, it, expect } from 'vitest';
import {
  getClassesForDate,
  getDayOfWeekForDate,
  isRescheduledToDate,
  getCancelledClassesForDate,
  getScheduledRevenueForDateRange,
} from '@/lib/class-schedule';
import { Booking, ClassException } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    locationId: 'loc1',
    locationName: 'Court A',
    dayOfWeek: 'tuesday',
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    className: 'Test Class',
    studentIds: [],
    studentPrices: {},
    studentWallets: {},
    notes: '',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeException(overrides: Partial<ClassException> = {}): ClassException {
  return {
    id: 'ex1',
    bookingId: 'b1',
    originalDate: '2026-03-24',
    type: 'cancelled',
    createdAt: new Date(),
    ...overrides,
  };
}

// 2026-03-24 is a Tuesday
const TUESDAY = '2026-03-24';
const WEDNESDAY = '2026-03-25';
const THURSDAY = '2026-03-26';

// ---------------------------------------------------------------------------
// getDayOfWeekForDate
// ---------------------------------------------------------------------------

describe('getDayOfWeekForDate', () => {
  it('returns correct day for a known Tuesday', () => {
    expect(getDayOfWeekForDate(TUESDAY)).toBe('tuesday');
  });

  it('returns correct day for a known Wednesday', () => {
    expect(getDayOfWeekForDate(WEDNESDAY)).toBe('wednesday');
  });

  it('returns sunday for 2026-03-29', () => {
    expect(getDayOfWeekForDate('2026-03-29')).toBe('sunday');
  });

  it('handles year boundary (Jan 1 2026 is Thursday)', () => {
    expect(getDayOfWeekForDate('2026-01-01')).toBe('thursday');
  });
});

// ---------------------------------------------------------------------------
// getClassesForDate
// ---------------------------------------------------------------------------

describe('getClassesForDate', () => {
  it('returns bookings matching the day of week', () => {
    const bookings = [makeBooking({ id: 'b1', dayOfWeek: 'tuesday' })];
    const result = getClassesForDate(TUESDAY, bookings, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
  });

  it('excludes bookings for a different day of week', () => {
    const bookings = [makeBooking({ id: 'b1', dayOfWeek: 'monday' })];
    const result = getClassesForDate(TUESDAY, bookings, []);
    expect(result).toHaveLength(0);
  });

  // Date range filtering
  describe('date range filtering', () => {
    it('includes booking when date is within startDate/endDate', () => {
      const bookings = [makeBooking({ startDate: '2026-03-01', endDate: '2026-03-31' })];
      const result = getClassesForDate(TUESDAY, bookings, []);
      expect(result).toHaveLength(1);
    });

    it('excludes booking before startDate', () => {
      const bookings = [makeBooking({ startDate: '2026-04-01' })];
      const result = getClassesForDate(TUESDAY, bookings, []);
      expect(result).toHaveLength(0);
    });

    it('excludes booking after endDate', () => {
      const bookings = [makeBooking({ endDate: '2026-03-17' })];
      const result = getClassesForDate(TUESDAY, bookings, []);
      expect(result).toHaveLength(0);
    });

    it('includes booking on exact startDate', () => {
      const bookings = [makeBooking({ startDate: TUESDAY })];
      const result = getClassesForDate(TUESDAY, bookings, []);
      expect(result).toHaveLength(1);
    });

    it('includes booking on exact endDate', () => {
      const bookings = [makeBooking({ endDate: TUESDAY })];
      const result = getClassesForDate(TUESDAY, bookings, []);
      expect(result).toHaveLength(1);
    });

    it('includes booking with no date range (always active)', () => {
      const bookings = [makeBooking({})];
      const result = getClassesForDate(TUESDAY, bookings, []);
      expect(result).toHaveLength(1);
    });
  });

  // Cancelled exception
  describe('cancelled exception', () => {
    it('removes booking from date when cancelled', () => {
      const bookings = [makeBooking()];
      const exceptions = [makeException({ type: 'cancelled', originalDate: TUESDAY })];
      const result = getClassesForDate(TUESDAY, bookings, exceptions);
      expect(result).toHaveLength(0);
    });

    it('does not affect booking on other dates', () => {
      const bookings = [makeBooking()];
      const exceptions = [makeException({ type: 'cancelled', originalDate: '2026-03-17' })];
      // 2026-03-17 is also a Tuesday, so the exception is for a different week
      const result = getClassesForDate(TUESDAY, bookings, exceptions);
      expect(result).toHaveLength(1);
    });
  });

  // Rescheduled exception
  describe('rescheduled exception', () => {
    it('removes booking from original date', () => {
      const bookings = [makeBooking()];
      const exceptions = [
        makeException({
          type: 'rescheduled',
          originalDate: TUESDAY,
          newDate: THURSDAY,
        }),
      ];
      const result = getClassesForDate(TUESDAY, bookings, exceptions);
      expect(result).toHaveLength(0);
    });

    it('adds booking to new date', () => {
      const bookings = [makeBooking({ dayOfWeek: 'tuesday' })];
      const exceptions = [
        makeException({
          type: 'rescheduled',
          originalDate: TUESDAY,
          newDate: THURSDAY,
        }),
      ];
      const result = getClassesForDate(THURSDAY, bookings, exceptions);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b1');
    });

    it('applies time/location/price overrides on rescheduled booking', () => {
      const bookings = [makeBooking({ studentIds: ['s1'], studentPrices: { s1: 50 } })];
      const exceptions = [
        makeException({
          type: 'rescheduled',
          originalDate: TUESDAY,
          newDate: THURSDAY,
          newStartTime: '14:00',
          newEndTime: '15:00',
          newLocationId: 'loc2',
          newLocationName: 'Court B',
          newStudentPrices: { s1: 100 },
        }),
      ];
      const result = getClassesForDate(THURSDAY, bookings, exceptions);
      expect(result).toHaveLength(1);
      expect(result[0].startTime).toBe('14:00');
      expect(result[0].endTime).toBe('15:00');
      expect(result[0].locationId).toBe('loc2');
      expect(result[0].locationName).toBe('Court B');
      expect(result[0].studentPrices.s1).toBe(100);
    });
  });

  // Same-date edit (rescheduled to same date)
  describe('same-date edit', () => {
    it('applies overrides without duplicating the booking', () => {
      const bookings = [makeBooking({ dayOfWeek: 'tuesday' })];
      const exceptions = [
        makeException({
          type: 'rescheduled',
          originalDate: TUESDAY,
          newDate: TUESDAY,
          newStartTime: '11:00',
          newEndTime: '12:00',
        }),
      ];
      // The booking's originalDate is TUESDAY (removed) and newDate is TUESDAY (re-added with overrides).
      // Since it was removed first, existingIdx check won't find it; it will be added fresh.
      const result = getClassesForDate(TUESDAY, bookings, exceptions);
      expect(result).toHaveLength(1);
      expect(result[0].startTime).toBe('11:00');
      expect(result[0].endTime).toBe('12:00');
    });
  });

  // Multiple exceptions on same date
  describe('multiple exceptions on same date', () => {
    it('handles two different bookings cancelled on same date', () => {
      const bookings = [
        makeBooking({ id: 'b1' }),
        makeBooking({ id: 'b2', startTime: '12:00', endTime: '13:00' }),
      ];
      const exceptions = [
        makeException({ id: 'ex1', bookingId: 'b1', type: 'cancelled', originalDate: TUESDAY }),
        makeException({ id: 'ex2', bookingId: 'b2', type: 'cancelled', originalDate: TUESDAY }),
      ];
      const result = getClassesForDate(TUESDAY, bookings, exceptions);
      expect(result).toHaveLength(0);
    });

    it('handles one cancelled and one rescheduled on same date', () => {
      const bookings = [
        makeBooking({ id: 'b1' }),
        makeBooking({ id: 'b2', startTime: '12:00', endTime: '13:00' }),
      ];
      const exceptions = [
        makeException({ id: 'ex1', bookingId: 'b1', type: 'cancelled', originalDate: TUESDAY }),
        makeException({
          id: 'ex2',
          bookingId: 'b2',
          type: 'rescheduled',
          originalDate: TUESDAY,
          newDate: THURSDAY,
        }),
      ];
      const result = getClassesForDate(TUESDAY, bookings, exceptions);
      expect(result).toHaveLength(0);
    });
  });

  // Edge: cancelled on rescheduled-to date
  describe('cancellation on rescheduled-to date', () => {
    it('cancellation on the target date blocks the rescheduled class', () => {
      // Booking b1 is rescheduled from Tuesday to Thursday.
      // But there's also a cancellation for b1 with originalDate = Thursday.
      // The code checks cancelledOnThisDate — cancellations where originalDate === date.
      const bookings = [makeBooking({ id: 'b1', dayOfWeek: 'tuesday' })];
      const exceptions = [
        makeException({
          id: 'ex1',
          bookingId: 'b1',
          type: 'rescheduled',
          originalDate: TUESDAY,
          newDate: THURSDAY,
        }),
        makeException({
          id: 'ex2',
          bookingId: 'b1',
          type: 'cancelled',
          originalDate: THURSDAY,
        }),
      ];
      const result = getClassesForDate(THURSDAY, bookings, exceptions);
      expect(result).toHaveLength(0);
    });
  });

  // Sort order
  describe('sort order', () => {
    it('sorts classes by startTime ascending', () => {
      const bookings = [
        makeBooking({ id: 'b2', startTime: '14:00', endTime: '15:00' }),
        makeBooking({ id: 'b1', startTime: '09:00', endTime: '10:00' }),
        makeBooking({ id: 'b3', startTime: '11:00', endTime: '12:00' }),
      ];
      const result = getClassesForDate(TUESDAY, bookings, []);
      expect(result.map((c) => c.id)).toEqual(['b1', 'b3', 'b2']);
    });

    it('sorts rescheduled classes into correct position', () => {
      const bookings = [
        makeBooking({ id: 'b1', dayOfWeek: 'tuesday', startTime: '14:00', endTime: '15:00' }),
        makeBooking({ id: 'b2', dayOfWeek: 'wednesday', startTime: '09:00', endTime: '10:00' }),
      ];
      const exceptions = [
        makeException({
          bookingId: 'b2',
          type: 'rescheduled',
          originalDate: WEDNESDAY,
          newDate: TUESDAY,
          newStartTime: '08:00',
          newEndTime: '09:00',
        }),
      ];
      const result = getClassesForDate(TUESDAY, bookings, exceptions);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('b2'); // 08:00 comes before 14:00
      expect(result[1].id).toBe('b1');
    });
  });
});

// ---------------------------------------------------------------------------
// isRescheduledToDate
// ---------------------------------------------------------------------------

describe('isRescheduledToDate', () => {
  it('returns true when booking is rescheduled to the given date', () => {
    const exceptions = [
      makeException({ bookingId: 'b1', type: 'rescheduled', newDate: THURSDAY }),
    ];
    expect(isRescheduledToDate('b1', THURSDAY, exceptions)).toBe(true);
  });

  it('returns false when booking is cancelled (not rescheduled)', () => {
    const exceptions = [makeException({ bookingId: 'b1', type: 'cancelled' })];
    expect(isRescheduledToDate('b1', TUESDAY, exceptions)).toBe(false);
  });

  it('returns false when rescheduled to a different date', () => {
    const exceptions = [
      makeException({ bookingId: 'b1', type: 'rescheduled', newDate: WEDNESDAY }),
    ];
    expect(isRescheduledToDate('b1', THURSDAY, exceptions)).toBe(false);
  });

  it('returns false for a different booking id', () => {
    const exceptions = [
      makeException({ bookingId: 'b1', type: 'rescheduled', newDate: THURSDAY }),
    ];
    expect(isRescheduledToDate('b2', THURSDAY, exceptions)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCancelledClassesForDate
// ---------------------------------------------------------------------------

describe('getCancelledClassesForDate', () => {
  it('returns cancelled classes for the given date', () => {
    const bookings = [makeBooking({ id: 'b1' })];
    const exceptions = [makeException({ type: 'cancelled', originalDate: TUESDAY })];
    const result = getCancelledClassesForDate(TUESDAY, bookings, exceptions);
    expect(result).toHaveLength(1);
    expect(result[0].booking.id).toBe('b1');
    expect(result[0].exceptionId).toBe('ex1');
  });

  it('returns empty when no cancellations exist', () => {
    const bookings = [makeBooking()];
    const result = getCancelledClassesForDate(TUESDAY, bookings, []);
    expect(result).toHaveLength(0);
  });

  it('ignores rescheduled exceptions (only returns cancelled)', () => {
    const bookings = [makeBooking()];
    const exceptions = [
      makeException({ type: 'rescheduled', originalDate: TUESDAY, newDate: THURSDAY }),
    ];
    const result = getCancelledClassesForDate(TUESDAY, bookings, exceptions);
    expect(result).toHaveLength(0);
  });

  it('ignores cancellations for other dates', () => {
    const bookings = [makeBooking()];
    const exceptions = [makeException({ type: 'cancelled', originalDate: '2026-03-17' })];
    const result = getCancelledClassesForDate(TUESDAY, bookings, exceptions);
    expect(result).toHaveLength(0);
  });

  it('sorts cancelled classes by startTime', () => {
    const bookings = [
      makeBooking({ id: 'b2', startTime: '14:00', endTime: '15:00' }),
      makeBooking({ id: 'b1', startTime: '09:00', endTime: '10:00' }),
    ];
    const exceptions = [
      makeException({ id: 'ex1', bookingId: 'b1', type: 'cancelled', originalDate: TUESDAY }),
      makeException({ id: 'ex2', bookingId: 'b2', type: 'cancelled', originalDate: TUESDAY }),
    ];
    const result = getCancelledClassesForDate(TUESDAY, bookings, exceptions);
    expect(result[0].booking.id).toBe('b1');
    expect(result[1].booking.id).toBe('b2');
  });

  it('skips cancellation if booking not found', () => {
    const bookings: Booking[] = [];
    const exceptions = [makeException({ type: 'cancelled', originalDate: TUESDAY })];
    const result = getCancelledClassesForDate(TUESDAY, bookings, exceptions);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getScheduledRevenueForDateRange
// ---------------------------------------------------------------------------

// Range: 2026-03-23 (Mon) through 2026-03-29 (Sun) — one full week.
const WEEK_START = '2026-03-23';
const WEEK_END = '2026-03-29';
const MONDAY = '2026-03-23';
const SUNDAY = '2026-03-29';

describe('getScheduledRevenueForDateRange', () => {
  it('returns 0 when no bookings exist', () => {
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [], [])).toBe(0);
  });

  it('sums getBookingTotal across days in range for recurring bookings', () => {
    // Tue and Thu bookings — both recur weekly; each lesson RM 100.
    const tue = makeBooking({ id: 'tue', dayOfWeek: 'tuesday', studentPrices: { s1: 100 } });
    const thu = makeBooking({ id: 'thu', dayOfWeek: 'thursday', studentPrices: { s1: 100 } });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [tue, thu], [])).toBe(200);
  });

  it('sums across multiple students in one booking', () => {
    const b = makeBooking({ dayOfWeek: 'tuesday', studentPrices: { s1: 60, s2: 60 } });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [b], [])).toBe(120);
  });

  it('excludes cancelled classes', () => {
    const b = makeBooking({ dayOfWeek: 'tuesday', studentPrices: { s1: 100 } });
    const cancelled = makeException({
      bookingId: b.id,
      originalDate: TUESDAY,
      type: 'cancelled',
    });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [b], [cancelled])).toBe(0);
  });

  it('follows rescheduled classes that stay within range', () => {
    const b = makeBooking({ dayOfWeek: 'tuesday', studentPrices: { s1: 100 } });
    const rescheduled = makeException({
      bookingId: b.id,
      originalDate: TUESDAY,
      type: 'rescheduled',
      newDate: THURSDAY,
    });
    // Same week → still RM 100.
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [b], [rescheduled])).toBe(100);
  });

  it('drops classes rescheduled out of the range', () => {
    const b = makeBooking({ dayOfWeek: 'tuesday', studentPrices: { s1: 100 } });
    const rescheduled = makeException({
      bookingId: b.id,
      originalDate: TUESDAY,
      type: 'rescheduled',
      newDate: '2026-04-07', // two weeks later
    });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [b], [rescheduled])).toBe(0);
  });

  it('counts classes rescheduled INTO the range', () => {
    // One-off Tuesday booking after the range; rescheduled to Thursday inside range.
    const b = makeBooking({
      dayOfWeek: 'tuesday',
      startDate: '2026-03-31',
      endDate: '2026-03-31',
      studentPrices: { s1: 100 },
    });
    const rescheduled = makeException({
      bookingId: b.id,
      originalDate: '2026-03-31',
      type: 'rescheduled',
      newDate: THURSDAY, // inside range
    });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [b], [rescheduled])).toBe(100);
  });

  it('respects price overrides on rescheduled classes', () => {
    const b = makeBooking({
      dayOfWeek: 'tuesday',
      studentIds: ['s1'],
      studentPrices: { s1: 100 },
      studentWallets: { s1: 'w1' },
    });
    const rescheduled = makeException({
      bookingId: b.id,
      originalDate: TUESDAY,
      type: 'rescheduled',
      newDate: THURSDAY,
      newStudentIds: ['s1'],
      newStudentPrices: { s1: 150 },
      newStudentWallets: { s1: 'w1' },
    });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [b], [rescheduled])).toBe(150);
  });

  it('includes date-bounded bookings that overlap the range', () => {
    // Booking active 2026-03-20 through 2026-03-27 — covers Tuesday of the week.
    const b = makeBooking({
      dayOfWeek: 'tuesday',
      startDate: '2026-03-20',
      endDate: '2026-03-27',
      studentPrices: { s1: 100 },
    });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [b], [])).toBe(100);
  });

  it('excludes bookings whose date range does not overlap', () => {
    const b = makeBooking({
      dayOfWeek: 'tuesday',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      studentPrices: { s1: 100 },
    });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [b], [])).toBe(0);
  });

  it('counts one-off bookings (startDate === endDate) within range', () => {
    const oneOff = makeBooking({
      id: 'adhoc',
      dayOfWeek: 'saturday',
      startDate: '2026-03-28',
      endDate: '2026-03-28',
      studentPrices: { s1: 80 },
    });
    expect(getScheduledRevenueForDateRange(WEEK_START, WEEK_END, [oneOff], [])).toBe(80);
  });

  it('works on single-day ranges', () => {
    const b = makeBooking({ dayOfWeek: 'monday', studentPrices: { s1: 60 } });
    expect(getScheduledRevenueForDateRange(MONDAY, MONDAY, [b], [])).toBe(60);
    // And Sunday-only range picks nothing up for a Monday booking.
    expect(getScheduledRevenueForDateRange(SUNDAY, SUNDAY, [b], [])).toBe(0);
  });
});

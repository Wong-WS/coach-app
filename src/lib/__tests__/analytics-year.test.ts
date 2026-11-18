import { describe, it, expect } from 'vitest';
import {
  busiestSlot,
  classesByWeekday,
  daysSplit,
  minutesTaught,
  monthlyTaught,
  studentStats,
  yearForecast,
} from '@/lib/analytics/year';
import type { AwayPeriod, Booking, LessonLog, Student } from '@/types';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
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

let n = 0;
function log(overrides: Partial<LessonLog> = {}): LessonLog {
  n += 1;
  return {
    id: `l${n}`,
    date: '2026-11-16',
    bookingId: `b-${n}`,
    studentId: 's1',
    studentName: 'Ana',
    locationName: 'Pool A',
    startTime: '10:00',
    endTime: '11:00',
    priceCents: 6000,
    createdAt: new Date(),
    ...overrides,
  };
}

function student(id: string, createdAt: string): Student {
  return { id, clientName: id, clientPhone: '', notes: '', createdAt: new Date(createdAt), updatedAt: new Date() };
}

const away = (startDate: string, endDate: string): AwayPeriod => ({
  id: `a-${startDate}`,
  startDate,
  endDate,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('yearForecast', () => {
  it('adds still-to-come, less the usual cancellations, to what was taught', () => {
    // Only Monday 28 Dec is left in the year.
    const result = yearForecast({
      year: 2026,
      today: '2026-12-28',
      logs: [log({ date: '2026-06-01', priceCents: 7_456_000 })],
      bookings: [booking({ studentPriceCents: { s1: 1_406_000 } })],
      exceptions: [],
      awayPeriods: [],
      cancelRate: 0.16,
    });
    expect(result.taught).toEqual({ classes: 1, cents: 7_456_000 });
    expect(result.toCome).toEqual({ classes: 1, cents: 1_181_040 });
    expect(result.forecast).toEqual({ classes: 2, cents: 8_637_040 });
  });

  it('is all zeros for a coach with no data', () => {
    const result = yearForecast({
      year: 2026, today: '2026-11-18', logs: [], bookings: [], exceptions: [], awayPeriods: [], cancelRate: 0,
    });
    expect(result.forecast).toEqual({ classes: 0, cents: 0 });
  });
});

describe('monthlyTaught', () => {
  it('runs from the first lesson month, actual up to this month, forecast after', () => {
    const bars = monthlyTaught({
      year: 2026,
      today: '2026-11-18',
      logs: [log({ date: '2026-04-20', priceCents: 1000 }), log({ date: '2026-11-02', priceCents: 2000 })],
      bookings: [booking()],
      exceptions: [],
      awayPeriods: [],
      cancelRate: 0,
      firstLogDate: '2026-04-18',
    });
    expect(bars.map((b) => b.month)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(bars[0]).toEqual({ month: 4, cents: 1000, kind: 'actual', partial: true });
    expect(bars[7]).toEqual({ month: 11, cents: 2000, kind: 'actual', partial: false });
    // Mondays in Dec 2026: 7, 14, 21, 28
    expect(bars[8]).toEqual({ month: 12, cents: 24000, kind: 'forecast', partial: false });
  });

  it('covers the whole year when there is no earlier first lesson', () => {
    const bars = monthlyTaught({
      year: 2027, today: '2027-03-05', logs: [], bookings: [], exceptions: [], awayPeriods: [], cancelRate: 0, firstLogDate: '2026-04-18',
    });
    expect(bars).toHaveLength(12);
    expect(bars.every((b) => b.cents === 0 && !b.partial)).toBe(true);
  });
});

describe('daysSplit', () => {
  it('splits days into worked, time off and other, counting a taught day inside time off as worked', () => {
    const logs = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-06'].map((date) => log({ date }));
    expect(daysSplit({ start: '2026-11-01', end: '2026-11-10' }, logs, [away('2026-11-05', '2026-11-07')])).toEqual({
      worked: 4,
      timeOff: 2,
      other: 4,
    });
  });
});

describe('minutesTaught', () => {
  it('counts each class once, not once per student', () => {
    const logs = [
      log({ bookingId: 'x', studentId: 's1' }),
      log({ bookingId: 'x', studentId: 's2' }),
      log({ bookingId: 'y', startTime: '09:30', endTime: '10:15' }),
    ];
    expect(minutesTaught(logs)).toBe(105);
  });

  it('is zero with no lessons', () => {
    expect(minutesTaught([])).toBe(0);
  });
});

describe('classesByWeekday / busiestSlot', () => {
  const logs = [
    log({ date: '2026-11-07', startTime: '09:00' }),
    log({ date: '2026-11-14', startTime: '09:00' }),
    log({ date: '2026-11-21', startTime: '09:30' }),
    log({ date: '2026-11-08', startTime: '09:00' }),
    log({ date: '2026-11-15', startTime: '09:00' }),
  ];

  it('counts classes on every day of the week', () => {
    expect(classesByWeekday(logs)).toEqual({
      monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 3, sunday: 2,
    });
  });

  it('finds the busiest day and start hour', () => {
    expect(busiestSlot(logs)).toEqual({ day: 'saturday', hour: 9 });
  });

  it('is null with no lessons', () => {
    expect(busiestSlot([])).toBeNull();
  });
});

describe('studentStats', () => {
  const yearLogs = [log({ studentId: 's1' }), log({ studentId: 's2' })];
  const students = [student('s1', '2026-05-01'), student('s2', '2025-03-01')];

  it('hides "new this year" in the first year and counts stopped students', () => {
    expect(
      studentStats({
        year: 2026,
        today: '2026-11-18',
        yearLogs,
        laterLogs: [],
        students,
        confirmedBookings: [booking({ studentIds: ['s1'] })],
        isFirstYear: true,
      }),
    ).toEqual({ taught: 2, newThisYear: null, stopped: 1 });
  });

  it('counts students created this year as new', () => {
    expect(
      studentStats({
        year: 2026, today: '2026-11-18', yearLogs, laterLogs: [], students,
        confirmedBookings: [booking({ studentIds: ['s1', 's2'] })], isFirstYear: false,
      }),
    ).toEqual({ taught: 2, newThisYear: 1, stopped: 0 });
  });

  it('does not keep a student whose series has ended', () => {
    expect(
      studentStats({
        year: 2026, today: '2026-11-18', yearLogs, laterLogs: [], students,
        confirmedBookings: [booking({ studentIds: ['s1', 's2'], endDate: '2026-11-09' })], isFirstYear: true,
      }).stopped,
    ).toBe(2);
  });

  it('for a past year, counts students not taught in any later year as stopped', () => {
    expect(
      studentStats({
        year: 2025, today: '2026-11-18', yearLogs, laterLogs: [log({ studentId: 's1', date: '2026-02-02' })],
        students, confirmedBookings: [], isFirstYear: false,
      }).stopped,
    ).toBe(1);
  });
});

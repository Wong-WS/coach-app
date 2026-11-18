import { describe, it, expect } from 'vitest';
import { projectPeriod, stillToCome, stillToComeByDate, taughtIn } from '@/lib/analytics/projection';
import { monthRange } from '@/lib/analytics/periods';
import { classKey, countClasses } from '@/lib/lesson-logs';
import type { AwayPeriod, Booking, LessonLog } from '@/types';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
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
    studentWallets: { s1: 'w1' },
    createdAt: new Date(),
    ...overrides,
  };
}

function makeLog(overrides: Partial<LessonLog> = {}): LessonLog {
  return {
    id: 'l1',
    date: '2026-11-16',
    bookingId: 'b1',
    studentId: 's1',
    studentName: 'Ana',
    locationName: 'Pool A',
    startTime: '10:00',
    endTime: '11:00',
    priceCents: 5000,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeAway(overrides: Partial<AwayPeriod> = {}): AwayPeriod {
  return {
    id: 'a1',
    startDate: '2026-11-16',
    endDate: '2026-11-20',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const NOV = monthRange(2026, 11); // Mondays: 2, 9, 16, 23, 30
const OCT = monthRange(2026, 10);
const b = makeBooking();

describe('taughtIn', () => {
  it('sums logged classes and their charged price', () => {
    expect(taughtIn(NOV, [makeLog()])).toEqual({ classes: 1, cents: 5000 });
  });

  it('counts a two-student class once but sums both prices', () => {
    const logs = [makeLog(), makeLog({ id: 'l2', studentId: 's2', priceCents: 4000 })];
    expect(taughtIn(NOV, logs)).toEqual({ classes: 1, cents: 9000 });
  });

  it('ignores logs outside the range', () => {
    expect(taughtIn(OCT, [makeLog()])).toEqual({ classes: 0, cents: 0 });
  });
});

describe('stillToCome', () => {
  it('counts scheduled classes from today to the end of the range', () => {
    expect(stillToCome(NOV, '2026-11-18', [b], [], [], [makeLog()])).toEqual({
      classes: 2,
      cents: 12000,
    });
  });

  it("counts today's class until it has been marked done", () => {
    expect(stillToCome(NOV, '2026-11-16', [b], [], [], []).classes).toBe(3);
    expect(stillToCome(NOV, '2026-11-16', [b], [], [], [makeLog()]).classes).toBe(2);
  });

  it('skips classes inside planned time off', () => {
    expect(stillToCome(NOV, '2026-11-16', [b], [], [makeAway()], []).classes).toBe(2);
  });

  it('on the 1st of the month includes the whole month', () => {
    expect(stillToCome(NOV, '2026-11-01', [b], [], [], []).classes).toBe(5);
  });

  it('is zero for a range already in the past', () => {
    expect(stillToCome(OCT, '2026-11-18', [b], [], [], [])).toEqual({ classes: 0, cents: 0 });
  });

  it('lists the classes with their dates in order', () => {
    expect(stillToComeByDate(NOV, '2026-11-18', [b], [], [], []).map((c) => c.date)).toEqual([
      '2026-11-23',
      '2026-11-30',
    ]);
  });
});

describe('projectPeriod', () => {
  it('projects taught so far plus still to come, ignoring past days never marked done', () => {
    // 2 and 9 Nov were never marked done, so they are not projected.
    expect(projectPeriod(NOV, '2026-11-18', [b], [], [], [makeLog()])).toEqual({
      taught: { classes: 1, cents: 5000 },
      toCome: { classes: 2, cents: 12000 },
      projected: { classes: 3, cents: 17000 },
    });
  });
});

describe('classKey', () => {
  it('keys a class by booking and date, and countClasses still dedupes students', () => {
    expect(classKey(makeLog())).toBe(classKey(makeLog({ id: 'l2', studentId: 's2' })));
    expect(countClasses([makeLog(), makeLog({ id: 'l2', studentId: 's2' })])).toBe(1);
  });
});

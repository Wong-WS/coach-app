import { describe, it, expect } from 'vitest';
import { countClasses } from '@/lib/lesson-logs';
import type { LessonLog } from '@/types';

function makeLog(overrides: Partial<LessonLog> = {}): LessonLog {
  return {
    id: 'l1',
    date: '2026-10-03',
    bookingId: 'b1',
    studentId: 's1',
    studentName: 'Sunny',
    locationName: 'Quayside',
    startTime: '16:00',
    endTime: '17:00',
    priceCents: 6000,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('countClasses', () => {
  it('counts a group class once, however many students were marked done', () => {
    const logs = [makeLog({ studentId: 'a' }), makeLog({ studentId: 'b' }), makeLog({ studentId: 'c' })];
    expect(countClasses(logs)).toBe(1);
  });

  it('counts the same booking on different dates separately', () => {
    expect(countClasses([makeLog(), makeLog({ date: '2026-10-10' })])).toBe(2);
  });

  it('counts different bookings on the same date separately', () => {
    expect(countClasses([makeLog(), makeLog({ bookingId: 'b2', startTime: '17:00' })])).toBe(2);
  });

  it('groups logs without a bookingId by date, time and location', () => {
    const logs = [
      makeLog({ bookingId: undefined, studentId: 'a' }),
      makeLog({ bookingId: undefined, studentId: 'b' }),
      makeLog({ bookingId: undefined, startTime: '18:00' }),
    ];
    expect(countClasses(logs)).toBe(2);
  });

  it('returns 0 for no logs', () => {
    expect(countClasses([])).toBe(0);
  });
});

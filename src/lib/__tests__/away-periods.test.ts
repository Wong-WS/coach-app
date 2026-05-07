import { describe, it, expect } from 'vitest';
import { isDateInAwayPeriod, awayPeriodsOverlapping } from '@/lib/away-periods';
import type { AwayPeriod } from '@/types';

function makePeriod(overrides: Partial<AwayPeriod> = {}): AwayPeriod {
  return {
    id: 'a1',
    startDate: '2026-05-01',
    endDate: '2026-05-30',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('isDateInAwayPeriod', () => {
  it('returns null when there are no periods', () => {
    expect(isDateInAwayPeriod('2026-05-15', [])).toBeNull();
  });

  it('returns the matching period when date is inside the range', () => {
    const p = makePeriod();
    expect(isDateInAwayPeriod('2026-05-15', [p])).toEqual(p);
  });

  it('matches the exact start date (inclusive)', () => {
    const p = makePeriod();
    expect(isDateInAwayPeriod('2026-05-01', [p])).toEqual(p);
  });

  it('matches the exact end date (inclusive)', () => {
    const p = makePeriod();
    expect(isDateInAwayPeriod('2026-05-30', [p])).toEqual(p);
  });

  it('returns null one day before the range', () => {
    expect(isDateInAwayPeriod('2026-04-30', [makePeriod()])).toBeNull();
  });

  it('returns null one day after the range', () => {
    expect(isDateInAwayPeriod('2026-05-31', [makePeriod()])).toBeNull();
  });

  it('returns the first matching period when multiple exist', () => {
    const a = makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-10' });
    const b = makePeriod({ id: 'a2', startDate: '2026-06-01', endDate: '2026-06-10' });
    expect(isDateInAwayPeriod('2026-06-05', [a, b])).toEqual(b);
  });
});

describe('awayPeriodsOverlapping', () => {
  it('returns empty when no periods overlap', () => {
    const existing = [makePeriod({ startDate: '2026-05-01', endDate: '2026-05-10' })];
    expect(awayPeriodsOverlapping('2026-06-01', '2026-06-10', existing)).toEqual([]);
  });

  it('returns the period when fully contained inside an existing one', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-30' })];
    const result = awayPeriodsOverlapping('2026-05-10', '2026-05-15', existing);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('returns the period when ranges are identical', () => {
    const existing = [makePeriod({ id: 'a1' })];
    const result = awayPeriodsOverlapping('2026-05-01', '2026-05-30', existing);
    expect(result).toHaveLength(1);
  });

  it('returns the period on a partial-end overlap', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-15' })];
    const result = awayPeriodsOverlapping('2026-05-10', '2026-05-20', existing);
    expect(result).toHaveLength(1);
  });

  it('returns the period on a partial-start overlap', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-10', endDate: '2026-05-20' })];
    const result = awayPeriodsOverlapping('2026-05-05', '2026-05-12', existing);
    expect(result).toHaveLength(1);
  });

  it('treats touching boundaries as no overlap (Apr 30 → May 1)', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-30' })];
    expect(awayPeriodsOverlapping('2026-04-15', '2026-04-30', existing)).toEqual([]);
  });

  it('treats touching boundaries as no overlap (May 30 → May 31)', () => {
    const existing = [makePeriod({ id: 'a1', startDate: '2026-05-01', endDate: '2026-05-30' })];
    expect(awayPeriodsOverlapping('2026-05-31', '2026-06-15', existing)).toEqual([]);
  });

  it('honours excludeId so editing the same period doesn\'t self-conflict', () => {
    const existing = [makePeriod({ id: 'a1' })];
    const result = awayPeriodsOverlapping('2026-05-01', '2026-05-30', existing, 'a1');
    expect(result).toEqual([]);
  });
});

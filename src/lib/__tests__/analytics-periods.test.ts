import { describe, it, expect } from 'vitest';
import {
  addDays,
  clampRange,
  comparisonRange,
  eachDate,
  monthRange,
  sinceDate,
  yearRange,
  ymd,
} from '@/lib/analytics/periods';

describe('monthRange / yearRange', () => {
  it('gives the first and last day of a month', () => {
    expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange(2026, 11)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
  });

  it('handles a leap February', () => {
    expect(monthRange(2028, 2).end).toBe('2028-02-29');
  });

  it('gives the whole year', () => {
    expect(yearRange(2027)).toEqual({ start: '2027-01-01', end: '2027-12-31' });
  });
});

describe('comparisonRange', () => {
  it('compares the current month with last month up to the same day', () => {
    expect(comparisonRange(monthRange(2026, 11), '2026-11-18')).toEqual({
      start: '2026-10-01',
      end: '2026-10-18',
    });
  });

  it('stops at the end of a shorter previous month', () => {
    expect(comparisonRange(monthRange(2026, 3), '2026-03-31')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('on the 1st compares with just the 1st of last month', () => {
    expect(comparisonRange(monthRange(2026, 12), '2026-12-01')).toEqual({
      start: '2026-11-01',
      end: '2026-11-01',
    });
  });

  it('compares a finished month with the full previous month', () => {
    expect(comparisonRange(monthRange(2026, 10), '2026-11-18')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });

  it('wraps back into the previous year', () => {
    expect(comparisonRange(monthRange(2026, 1), '2026-01-10')).toEqual({
      start: '2025-12-01',
      end: '2025-12-10',
    });
  });
});

describe('sinceDate', () => {
  it('returns the first lesson date when the year started partway', () => {
    expect(sinceDate('2026-04-18', 2026)).toBe('2026-04-18');
  });

  it('returns null for later years', () => {
    expect(sinceDate('2026-04-18', 2027)).toBeNull();
  });

  it('returns null when the first lesson was on 1 January', () => {
    expect(sinceDate('2026-01-01', 2026)).toBeNull();
  });

  it('returns null with no lessons', () => {
    expect(sinceDate(null, 2026)).toBeNull();
  });
});

describe('eachDate / clampRange / addDays / ymd', () => {
  it('lists every date in a range across a month boundary', () => {
    expect(eachDate({ start: '2026-02-27', end: '2026-03-02' })).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('clamps the start of a range', () => {
    expect(clampRange({ start: '2026-11-01', end: '2026-11-30' }, '2026-11-18')).toEqual({
      start: '2026-11-18',
      end: '2026-11-30',
    });
  });

  it('clamps the end of a range', () => {
    expect(clampRange({ start: '2026-11-01', end: '2026-11-30' }, undefined, '2026-11-18')).toEqual({
      start: '2026-11-01',
      end: '2026-11-18',
    });
  });

  it('returns null when clamping empties the range', () => {
    expect(clampRange({ start: '2026-11-01', end: '2026-11-30' }, '2026-12-01')).toBeNull();
  });

  it('adds and subtracts days across months', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('formats a local date', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

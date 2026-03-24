import { describe, it, expect } from 'vitest';
import {
  formatDateFull,
  formatDateMedium,
  formatDateShort,
  parseDateString,
} from '@/lib/date-format';

// ---------------------------------------------------------------------------
// parseDateString
// ---------------------------------------------------------------------------

describe('parseDateString', () => {
  it('creates a Date with correct year, month, and day', () => {
    const date = parseDateString('2026-03-24');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // 0-indexed: March = 2
    expect(date.getDate()).toBe(24);
  });

  it('does not shift to a different date due to timezone', () => {
    // The T00:00:00 suffix should keep it in local timezone
    const date = parseDateString('2026-01-01');
    expect(date.getDate()).toBe(1);
    expect(date.getMonth()).toBe(0);
  });

  it('handles month boundary (last day of month)', () => {
    const date = parseDateString('2026-02-28');
    expect(date.getDate()).toBe(28);
    expect(date.getMonth()).toBe(1);
  });

  it('handles year boundary (Dec 31)', () => {
    const date = parseDateString('2025-12-31');
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(31);
  });

  it('handles leap year date', () => {
    const date = parseDateString('2028-02-29');
    expect(date.getDate()).toBe(29);
    expect(date.getMonth()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatDateFull
// ---------------------------------------------------------------------------

describe('formatDateFull', () => {
  it('includes weekday, day, month, and year', () => {
    const date = new Date(2026, 2, 24); // March 24, 2026 (Tuesday)
    const result = formatDateFull(date);
    // en-MY locale: "Tuesday, 24 March 2026"
    expect(result).toContain('Tuesday');
    expect(result).toContain('24');
    expect(result).toContain('March');
    expect(result).toContain('2026');
  });
});

// ---------------------------------------------------------------------------
// formatDateMedium
// ---------------------------------------------------------------------------

describe('formatDateMedium', () => {
  it('includes day, abbreviated month, and year', () => {
    const date = new Date(2026, 2, 24);
    const result = formatDateMedium(date);
    expect(result).toContain('24');
    expect(result).toContain('Mar');
    expect(result).toContain('2026');
  });

  it('does not include weekday', () => {
    const date = new Date(2026, 2, 24);
    const result = formatDateMedium(date);
    expect(result).not.toContain('Tuesday');
  });
});

// ---------------------------------------------------------------------------
// formatDateShort
// ---------------------------------------------------------------------------

describe('formatDateShort', () => {
  it('includes day and abbreviated month', () => {
    const date = new Date(2026, 2, 24);
    const result = formatDateShort(date);
    expect(result).toContain('24');
    expect(result).toContain('Mar');
  });

  it('does not include year', () => {
    const date = new Date(2026, 2, 24);
    const result = formatDateShort(date);
    expect(result).not.toContain('2026');
  });
});

// ---------------------------------------------------------------------------
// Cross-format consistency
// ---------------------------------------------------------------------------

describe('cross-format consistency', () => {
  it('all formats agree on the same date components', () => {
    const date = new Date(2026, 0, 1); // Jan 1, 2026
    const full = formatDateFull(date);
    const medium = formatDateMedium(date);
    const short = formatDateShort(date);

    // All should contain "1" for the day
    expect(full).toContain('1');
    expect(medium).toContain('1');
    expect(short).toContain('1');

    // Full and medium should contain the year
    expect(full).toContain('2026');
    expect(medium).toContain('2026');
  });
});

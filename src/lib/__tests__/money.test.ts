import { describe, it, expect } from 'vitest';
import {
  formatCents,
  parseMoneyToCents,
  centsToInputValue,
  rmToCents,
  centsFromLegacy,
  mapRmToCents,
  formatCentsGrouped,
} from '@/lib/money';

describe('formatCents', () => {
  it('renders a whole amount with no decimals', () => {
    expect(formatCents(20000)).toBe('200');
  });

  it('renders cents when they are non-zero', () => {
    expect(formatCents(15050)).toBe('150.50');
  });

  it('pads a single-digit cents value', () => {
    expect(formatCents(15005)).toBe('150.05');
  });

  it('renders zero as a bare 0', () => {
    expect(formatCents(0)).toBe('0');
  });

  it('keeps the sign on negative amounts', () => {
    expect(formatCents(-15050)).toBe('-150.50');
    expect(formatCents(-20000)).toBe('-200');
  });

  it('renders amounts below one ringgit', () => {
    expect(formatCents(50)).toBe('0.50');
    expect(formatCents(5)).toBe('0.05');
  });
});

describe('parseMoneyToCents', () => {
  it('parses a whole ringgit amount', () => {
    expect(parseMoneyToCents('200')).toBe(20000);
  });

  it('parses an amount with cents', () => {
    expect(parseMoneyToCents('150.50')).toBe(15050);
  });

  it('parses a single decimal place as tens of cents', () => {
    expect(parseMoneyToCents('150.5')).toBe(15050);
  });

  it('rounds beyond two decimal places to the nearest cent', () => {
    expect(parseMoneyToCents('150.567')).toBe(15057);
    expect(parseMoneyToCents('0.005')).toBe(1);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseMoneyToCents('  150.50  ')).toBe(15050);
  });

  it('parses negative amounts', () => {
    expect(parseMoneyToCents('-150.50')).toBe(-15050);
  });

  it('returns null for an empty string', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('   ')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('12abc')).toBeNull();
  });

  it('avoids the floating-point error of naive multiplication', () => {
    // 1.15 * 100 is 114.99999999999999 in IEEE 754.
    expect(parseMoneyToCents('1.15')).toBe(115);
    expect(parseMoneyToCents('8.29')).toBe(829);
  });
});

describe('centsToInputValue', () => {
  it('renders a whole amount without decimals for the input box', () => {
    expect(centsToInputValue(20000)).toBe('200');
  });

  it('renders cents when present', () => {
    expect(centsToInputValue(15050)).toBe('150.50');
  });

  it('renders zero as an empty string so the placeholder shows', () => {
    expect(centsToInputValue(0)).toBe('');
  });
});

describe('rmToCents', () => {
  it('converts a whole ringgit value', () => {
    expect(rmToCents(200)).toBe(20000);
  });

  it('converts a fractional ringgit value', () => {
    expect(rmToCents(150.5)).toBe(15050);
  });

  it('rounds a float that cannot be represented exactly', () => {
    expect(rmToCents(1.15)).toBe(115);
    expect(rmToCents(220.50000000000003)).toBe(22050);
  });

  it('converts zero and negatives', () => {
    expect(rmToCents(0)).toBe(0);
    expect(rmToCents(-80)).toBe(-8000);
  });
});

describe('centsFromLegacy', () => {
  it('prefers the migrated cents value when present', () => {
    expect(centsFromLegacy(15050, 999)).toBe(15050);
  });

  it('converts the legacy ringgit value when cents is missing', () => {
    expect(centsFromLegacy(undefined, 150.5)).toBe(15050);
  });

  it('keeps a migrated zero rather than falling back', () => {
    expect(centsFromLegacy(0, 200)).toBe(0);
  });

  it('returns 0 when neither is present', () => {
    expect(centsFromLegacy(undefined, undefined)).toBe(0);
  });
});

describe('mapRmToCents', () => {
  it('converts every value in the map', () => {
    expect(mapRmToCents({ s1: 200, s2: 150.5 })).toEqual({ s1: 20000, s2: 15050 });
  });

  it('handles an empty map', () => {
    expect(mapRmToCents({})).toEqual({});
  });
});

describe('formatCentsGrouped', () => {
  it('groups thousands', () => {
    expect(formatCentsGrouped(1250000)).toBe('12,500');
  });

  it('groups thousands and keeps cents', () => {
    expect(formatCentsGrouped(1250050)).toBe('12,500.50');
  });

  it('leaves amounts under a thousand ungrouped', () => {
    expect(formatCentsGrouped(20000)).toBe('200');
  });

  it('keeps the sign', () => {
    expect(formatCentsGrouped(-1250050)).toBe('-12,500.50');
  });
});

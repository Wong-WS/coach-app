import { describe, it, expect } from 'vitest';
import { parseTimeInput } from '@/lib/time-input';

describe('parseTimeInput — suffix forms', () => {
  it('parses "9a" as 09:00', () => {
    expect(parseTimeInput('9a')).toBe('09:00');
  });
  it('parses "9am" as 09:00', () => {
    expect(parseTimeInput('9am')).toBe('09:00');
  });
  it('parses "9 AM" as 09:00', () => {
    expect(parseTimeInput('9 AM')).toBe('09:00');
  });
  it('parses "9p" as 21:00', () => {
    expect(parseTimeInput('9p')).toBe('21:00');
  });
  it('parses "12pm" as 12:00 (noon)', () => {
    expect(parseTimeInput('12pm')).toBe('12:00');
  });
  it('parses "12am" as 00:00 (midnight)', () => {
    expect(parseTimeInput('12am')).toBe('00:00');
  });
  it('parses "9:05 pm" as 21:05', () => {
    expect(parseTimeInput('9:05 pm')).toBe('21:05');
  });
});

describe('parseTimeInput — numeric forms without suffix', () => {
  it('parses "9" as 09:00 (AM default)', () => {
    expect(parseTimeInput('9')).toBe('09:00');
  });
  it('parses "905" as 09:05', () => {
    expect(parseTimeInput('905')).toBe('09:05');
  });
  it('parses "9:05" as 09:05', () => {
    expect(parseTimeInput('9:05')).toBe('09:05');
  });
  it('parses "9 30" as 09:30 (space separator)', () => {
    expect(parseTimeInput('9 30')).toBe('09:30');
  });
  it('parses "13" as 13:00 (24h interpretation for >12)', () => {
    expect(parseTimeInput('13')).toBe('13:00');
  });
  it('parses "1305" as 13:05', () => {
    expect(parseTimeInput('1305')).toBe('13:05');
  });
  it('parses "21:05" as 21:05', () => {
    expect(parseTimeInput('21:05')).toBe('21:05');
  });
  it('parses "0" as 00:00', () => {
    expect(parseTimeInput('0')).toBe('00:00');
  });
  it('parses "12" as 12:00 (noon)', () => {
    expect(parseTimeInput('12')).toBe('12:00');
  });
});

describe('parseTimeInput — contextHalfDay biasing', () => {
  it('bare "2" with contextHalfDay=PM becomes 14:00', () => {
    expect(parseTimeInput('2', { contextHalfDay: 'PM' })).toBe('14:00');
  });
  it('bare "2" with contextHalfDay=AM stays 02:00', () => {
    expect(parseTimeInput('2', { contextHalfDay: 'AM' })).toBe('02:00');
  });
  it('contextHalfDay does not override explicit suffix', () => {
    expect(parseTimeInput('2am', { contextHalfDay: 'PM' })).toBe('02:00');
  });
  it('contextHalfDay does not apply to 24h numbers >12', () => {
    expect(parseTimeInput('14', { contextHalfDay: 'AM' })).toBe('14:00');
  });
  it('bare "12" with contextHalfDay=PM stays 12:00 (noon)', () => {
    expect(parseTimeInput('12', { contextHalfDay: 'PM' })).toBe('12:00');
  });
  it('bare "12" with contextHalfDay=AM flips to 00:00 (midnight)', () => {
    expect(parseTimeInput('12', { contextHalfDay: 'AM' })).toBe('00:00');
  });
});

describe('parseTimeInput — invalid input', () => {
  it('returns null for empty string', () => {
    expect(parseTimeInput('')).toBeNull();
  });
  it('returns null for whitespace only', () => {
    expect(parseTimeInput('   ')).toBeNull();
  });
  it('returns null for letters only', () => {
    expect(parseTimeInput('abc')).toBeNull();
  });
  it('returns null for hours >= 24', () => {
    expect(parseTimeInput('25')).toBeNull();
  });
  it('returns null for minutes >= 60', () => {
    expect(parseTimeInput('9:75')).toBeNull();
  });
  it('returns null for negative numbers', () => {
    expect(parseTimeInput('-1')).toBeNull();
  });
  it('returns null for "13pm" (13 with pm is contradictory)', () => {
    expect(parseTimeInput('13pm')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { isoDateInTimeZone } from '@/lib/time-zone';

describe('isoDateInTimeZone', () => {
  it("gives Malaysia's date when the server clock (UTC) is still on the previous day", () => {
    // 17:30 UTC = 1:30 am next day in Kuala Lumpur
    expect(isoDateInTimeZone(new Date('2026-11-18T17:30:00Z'), 'Asia/Kuala_Lumpur')).toBe('2026-11-19');
  });

  it('gives the same date in the Malaysian afternoon', () => {
    expect(isoDateInTimeZone(new Date('2026-11-18T07:00:00Z'), 'Asia/Kuala_Lumpur')).toBe('2026-11-18');
  });
});

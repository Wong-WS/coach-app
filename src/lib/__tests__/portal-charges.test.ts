import { describe, it, expect } from 'vitest';
import {
  groupCharges,
  formatNameList,
  sessionKeyFromDescription,
} from '@/lib/portal-charges';
import type { PortalChargeRow } from '@/lib/portal-data';

const row = (
  date: string,
  studentName: string,
  amountCents: number,
  sessionKey: string,
  cursor: number,
): PortalChargeRow => ({ date, studentName, amountCents, sessionKey, cursor });

describe('groupCharges', () => {
  it('rolls two students in one session into a single one-lesson row', () => {
    const groups = groupCharges([
      row('2026-08-23', 'Jian', 5000, '08:30', 300),
      row('2026-08-23', 'Seoan', 5000, '08:30', 300),
      row('2026-08-21', 'Seoan', 5000, '17:00', 100),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      date: '2026-08-23',
      names: ['Jian', 'Seoan'],
      sessions: 1,
      amountCents: 10000,
    });
    expect(groups[1]).toMatchObject({ date: '2026-08-21', sessions: 1, amountCents: 5000 });
  });

  it('counts two different times on one day as two lessons', () => {
    const groups = groupCharges([
      row('2026-08-23', 'Jian', 5000, '17:00', 400),
      row('2026-08-23', 'Seoan', 5000, '17:00', 400),
      row('2026-08-23', 'Jian', 5000, '08:30', 300),
      row('2026-08-23', 'Seoan', 5000, '08:30', 300),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ sessions: 2, amountCents: 20000, names: ['Jian', 'Seoan'] });
  });

  it('counts one student attending twice in a day as two lessons', () => {
    const groups = groupCharges([
      row('2026-08-23', 'Jian', 5000, '17:00', 400),
      row('2026-08-23', 'Jian', 5000, '08:30', 300),
    ]);
    expect(groups[0]).toMatchObject({ names: ['Jian'], sessions: 2, amountCents: 10000 });
  });

  it('under-counts rather than invents sessions when the time is missing', () => {
    const groups = groupCharges([
      row('2026-08-23', 'Jian', 5000, '', 300),
      row('2026-08-23', 'Seoan', 5000, '', 300),
    ]);
    expect(groups[0].sessions).toBe(1);
  });

  it('merges a date split across pages when the next page is appended', () => {
    const page1 = [row('2026-08-23', 'Jian', 5000, '08:30', 300)];
    const page2 = [row('2026-08-23', 'Seoan', 5000, '08:30', 300)];
    const groups = groupCharges([...page1, ...page2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].amountCents).toBe(10000);
    expect(groups[0].sessions).toBe(1);
  });

  it('keeps a backdated charge in its own date row', () => {
    const groups = groupCharges([
      row('2026-08-23', 'Jian', 5000, '08:30', 300),
      row('2026-08-21', 'Seoan', 5000, '17:00', 250),
      row('2026-08-23', 'Seoan', 5000, '08:30', 200),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-08-23', '2026-08-21']);
    expect(groups[0].sessions).toBe(1);
    expect(groups[0].amountCents).toBe(10000);
  });

  it('leaves names empty for single-student wallets', () => {
    const groups = groupCharges([row('2026-08-23', '', 50, '08:30', 300)]);
    expect(groups[0].names).toEqual([]);
  });

  it('returns nothing for an empty list', () => {
    expect(groupCharges([])).toEqual([]);
  });
});

describe('sessionKeyFromDescription', () => {
  it('pulls the start time out of a mark-as-done description', () => {
    expect(sessionKeyFromDescription('Lesson — Jian (08:30)')).toBe('08:30');
    expect(sessionKeyFromDescription('Lesson — Seoan Wong-Lee (17:00)')).toBe('17:00');
    expect(sessionKeyFromDescription('Lesson — Jian (9:05)')).toBe('9:05');
  });

  it('returns an empty key for anything else', () => {
    expect(sessionKeyFromDescription('Manual charge')).toBe('');
    expect(sessionKeyFromDescription('Lesson — Jian (morning)')).toBe('');
    expect(sessionKeyFromDescription(undefined)).toBe('');
    expect(sessionKeyFromDescription(42)).toBe('');
  });
});

describe('formatNameList', () => {
  it('formats one, two and three names', () => {
    expect(formatNameList([])).toBe('');
    expect(formatNameList(['Jian'])).toBe('Jian');
    expect(formatNameList(['Jian', 'Seoan'])).toBe('Jian & Seoan');
    expect(formatNameList(['Jian', 'Seoan', 'Rui'])).toBe('Jian, Seoan & Rui');
  });
});

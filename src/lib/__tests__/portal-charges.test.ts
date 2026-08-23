import { describe, it, expect } from 'vitest';
import { groupCharges, formatNameList } from '@/lib/portal-charges';
import type { PortalChargeRow } from '@/lib/portal-data';

const row = (
  date: string,
  studentName: string,
  amount: number,
  cursor: number,
): PortalChargeRow => ({ date, studentName, amount, cursor });

describe('groupCharges', () => {
  it('rolls two students on the same date into one row', () => {
    const groups = groupCharges([
      row('2026-08-23', 'Jian', 50, 300),
      row('2026-08-23', 'Seoan', 50, 200),
      row('2026-08-21', 'Seoan', 50, 100),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      date: '2026-08-23',
      names: ['Jian', 'Seoan'],
      count: 2,
      amount: 100,
    });
    expect(groups[1]).toMatchObject({ date: '2026-08-21', count: 1, amount: 50 });
  });

  it('merges a date split across pages when the next page is appended', () => {
    const page1 = [row('2026-08-23', 'Jian', 50, 300)];
    const page2 = [row('2026-08-23', 'Seoan', 50, 200)];
    const groups = groupCharges([...page1, ...page2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].amount).toBe(100);
  });

  it('keeps a backdated charge in its own date row', () => {
    const groups = groupCharges([
      row('2026-08-23', 'Jian', 50, 300),
      row('2026-08-21', 'Seoan', 50, 250),
      row('2026-08-23', 'Seoan', 50, 200),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-08-23', '2026-08-21']);
    expect(groups[0].count).toBe(2);
  });

  it('does not repeat a name when the same student has two lessons that day', () => {
    const groups = groupCharges([
      row('2026-08-23', 'Jian', 50, 300),
      row('2026-08-23', 'Jian', 50, 200),
    ]);
    expect(groups[0].names).toEqual(['Jian']);
    expect(groups[0].count).toBe(2);
    expect(groups[0].amount).toBe(100);
  });

  it('leaves names empty for single-student wallets', () => {
    const groups = groupCharges([row('2026-08-23', '', 50, 300)]);
    expect(groups[0].names).toEqual([]);
  });

  it('returns nothing for an empty list', () => {
    expect(groupCharges([])).toEqual([]);
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

import { describe, it, expect } from 'vitest';
import { filterOptionGroups } from '@/lib/combobox-filter';
import type { OptionGroup } from '@/lib/combobox-filter';

const groups: OptionGroup[] = [
  {
    label: 'At I-Santorini 6A',
    options: [
      { value: 's1', label: 'Kenny' },
      { value: 's2', label: 'Mia - Joyce Tang' },
      { value: 's3', label: 'Mila - Joyce Tang' },
      { value: 's4', label: 'Peach' },
    ],
  },
  {
    label: 'Other students',
    options: [
      { value: 's5', label: 'Aaron' },
      { value: 's6', label: 'Ain' },
      { value: 's7', label: 'Amir' },
    ],
  },
];

describe('filterOptionGroups', () => {
  it('returns every group unchanged for an empty query', () => {
    expect(filterOptionGroups(groups, '')).toEqual(groups);
  });

  it('returns every group unchanged for a whitespace-only query', () => {
    expect(filterOptionGroups(groups, '   ')).toEqual(groups);
  });

  it('keeps only options whose label matches the query', () => {
    const result = filterOptionGroups(groups, 'mi');

    expect(result).toEqual([
      {
        label: 'At I-Santorini 6A',
        options: [
          { value: 's2', label: 'Mia - Joyce Tang' },
          { value: 's3', label: 'Mila - Joyce Tang' },
        ],
      },
      {
        label: 'Other students',
        options: [{ value: 's7', label: 'Amir' }],
      },
    ]);
  });

  it('matches case-insensitively', () => {
    const result = filterOptionGroups(groups, 'KENNY');

    expect(result).toHaveLength(1);
    expect(result[0].options.map((o) => o.label)).toEqual(['Kenny']);
  });

  it('drops groups left with no matching options', () => {
    const result = filterOptionGroups(groups, 'peach');

    expect(result.map((g) => g.label)).toEqual(['At I-Santorini 6A']);
  });

  it('matches on a substring in the middle of a label', () => {
    const result = filterOptionGroups(groups, 'joyce');

    expect(result.map((g) => g.label)).toEqual(['At I-Santorini 6A']);
    expect(result[0].options.map((o) => o.value)).toEqual(['s2', 's3']);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterOptionGroups(groups, '  kenny  ')).toEqual(
      filterOptionGroups(groups, 'kenny')
    );
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterOptionGroups(groups, 'zzzzz')).toEqual([]);
  });

  it('preserves group order and option order', () => {
    const result = filterOptionGroups(groups, 'a');

    expect(result.map((g) => g.label)).toEqual(['At I-Santorini 6A', 'Other students']);
    expect(result[0].options.map((o) => o.value)).toEqual(['s2', 's3', 's4']);
    expect(result[1].options.map((o) => o.value)).toEqual(['s5', 's6', 's7']);
  });

  it('handles an empty group list', () => {
    expect(filterOptionGroups([], 'anything')).toEqual([]);
  });

  it('drops a group that was already empty', () => {
    const withEmpty: OptionGroup[] = [{ label: 'Nobody', options: [] }, ...groups];

    const result = filterOptionGroups(withEmpty, 'kenny');

    expect(result.map((g) => g.label)).toEqual(['At I-Santorini 6A']);
  });
});

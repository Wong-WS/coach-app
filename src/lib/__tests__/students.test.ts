import { describe, it, expect } from 'vitest';
import { findStudentsWithSameName } from '@/lib/students';
import type { Student } from '@/types';

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 's1',
    clientName: 'Sunny',
    clientPhone: '',
    notes: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('findStudentsWithSameName', () => {
  it('matches an existing student with the same name', () => {
    const sunny = makeStudent();
    expect(findStudentsWithSameName([sunny], 'Sunny')).toEqual([sunny]);
  });

  it('ignores case and extra whitespace', () => {
    const sunny = makeStudent({ clientName: 'Sunny  Lee' });
    expect(findStudentsWithSameName([sunny], '  sunny lee ')).toEqual([sunny]);
  });

  it('matches regardless of phone number', () => {
    const sunny = makeStudent({ clientPhone: '0123456789' });
    expect(findStudentsWithSameName([sunny], 'Sunny')).toEqual([sunny]);
  });

  it('returns every student sharing the name', () => {
    const a = makeStudent({ id: 'a' });
    const b = makeStudent({ id: 'b', clientPhone: '0198765432' });
    const other = makeStudent({ id: 'c', clientName: 'Woojin' });
    expect(findStudentsWithSameName([a, b, other], 'Sunny')).toEqual([a, b]);
  });

  it('does not match partial names', () => {
    const sunny = makeStudent({ clientName: 'Sunny Lee' });
    expect(findStudentsWithSameName([sunny], 'Sunny')).toEqual([]);
  });

  it('returns nothing for a blank name', () => {
    expect(findStudentsWithSameName([makeStudent()], '   ')).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { cancelsMost, familyResolver, mostLessons } from '@/lib/analytics/families';
import type { CancellationRecord, ReasonBucket } from '@/lib/analytics/cancellations';
import type { LessonLog, Student, Wallet } from '@/types';

function wallet(id: string, name: string, studentIds: string[], archived = false): Wallet {
  return { id, name, balanceCents: 0, studentIds, archived, createdAt: new Date(), updatedAt: new Date() };
}

function student(id: string, clientName: string): Student {
  return { id, clientName, clientPhone: '', notes: '', createdAt: new Date(), updatedAt: new Date() };
}

function rec(studentIds: string[], bucket: ReasonBucket, date = '2026-11-16'): CancellationRecord {
  return { date, bucket, bookingId: 'b', studentIds };
}

function log(overrides: Partial<LessonLog>): LessonLog {
  return {
    id: 'l',
    date: '2026-11-16',
    bookingId: 'b',
    studentId: 's1',
    studentName: 'Ethan',
    locationName: 'Pool',
    startTime: '10:00',
    endTime: '11:00',
    priceCents: 6000,
    createdAt: new Date(),
    ...overrides,
  };
}

const wallets = [wallet('w1', 'Lee siblings', ['s1', 's2']), wallet('w9', 'Old Lee wallet', ['s1'], true)];
const students = [student('s1', 'Ethan Lee'), student('s2', 'Chloe Lee'), student('s3', 'Marcus')];
const resolve = familyResolver(wallets, students);

describe('familyResolver', () => {
  it('maps a student to their wallet, preferring an active one', () => {
    expect(resolve('s1')).toEqual({ key: 'w:w1', name: 'Lee siblings' });
  });

  it('falls back to the student when they have no wallet', () => {
    expect(resolve('s3')).toEqual({ key: 's:s3', name: 'Marcus' });
  });

  it('uses the fallback name for an unknown student', () => {
    expect(resolve('gone', 'Old Name')).toEqual({ key: 's:gone', name: 'Old Name' });
    expect(resolve('gone')).toEqual({ key: 's:gone', name: 'Unknown' });
  });

  it('uses an archived wallet when it is the only one', () => {
    const r = familyResolver([wallet('w9', 'Old wallet', ['s4'], true)], []);
    expect(r('s4')).toEqual({ key: 'w:w9', name: 'Old wallet' });
  });
});

describe('cancelsMost', () => {
  it('counts siblings in the same class once for the family', () => {
    expect(cancelsMost([rec(['s1', 's2'], 'student')], resolve)).toMatchObject([{ name: 'Lee siblings', count: 1 }]);
  });

  it('ignores weather and coach cancellations', () => {
    expect(cancelsMost([rec(['s3'], 'weather'), rec(['s3'], 'coach')], resolve)).toMatchObject([]);
  });

  it('counts student, other and no-reason cancellations', () => {
    expect(cancelsMost([rec(['s3'], 'none'), rec(['s3'], 'other'), rec(['s3'], 'student')], resolve)).toMatchObject([
      { name: 'Marcus', count: 3 },
    ]);
  });

  it('counts each family on a mixed group class', () => {
    expect(cancelsMost([rec(['s1', 's3'], 'student')], resolve)).toMatchObject([
      { name: 'Lee siblings', count: 1 },
      { name: 'Marcus', count: 1 },
    ]);
  });

  it('sorts by count then name and keeps the top N', () => {
    const records = [rec(['s3'], 'none'), rec(['s3'], 'none'), rec(['s1'], 'none'), rec(['s1'], 'none'), rec(['s1'], 'none')];
    expect(cancelsMost(records, resolve, 1)).toMatchObject([{ name: 'Lee siblings', count: 3 }]);
  });
});

describe('ranked keys', () => {
  it('keeps two families with the same name apart', () => {
    const twins = familyResolver(
      [wallet('wa', 'Lee family', ['a']), wallet('wb', 'Lee family', ['b'])],
      [],
    );
    const ranked = cancelsMost([rec(['a'], 'none'), rec(['b'], 'none')], twins);
    expect(ranked.map((r) => r.key)).toEqual(['w:wa', 'w:wb']);
  });
});

describe('mostLessons', () => {
  it('counts a class once per family even with two siblings logged', () => {
    const logs = [log({ id: 'a', studentId: 's1' }), log({ id: 'b', studentId: 's2' })];
    expect(mostLessons(logs, resolve)).toMatchObject([{ name: 'Lee siblings', count: 1 }]);
  });

  it('ranks families by classes taught', () => {
    const logs = [
      log({ id: 'a', studentId: 's3', studentName: 'Marcus' }),
      log({ id: 'b', studentId: 's3', studentName: 'Marcus', date: '2026-11-23' }),
      log({ id: 'c', studentId: 's1' }),
    ];
    expect(mostLessons(logs, resolve)).toMatchObject([
      { name: 'Marcus', count: 2 },
      { name: 'Lee siblings', count: 1 },
    ]);
  });
});

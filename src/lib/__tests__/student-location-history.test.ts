import { describe, it, expect } from 'vitest';
import { groupStudentsByLocation } from '@/lib/student-location-history';
import type { Booking, Student } from '@/types';

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 's1',
    clientName: 'Woojin',
    clientPhone: '',
    notes: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    locationId: 'loc1',
    locationName: 'I-Santorini 6A',
    dayOfWeek: 'monday',
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    className: '',
    notes: '',
    studentIds: ['s1'],
    studentPriceCents: {},
    studentWallets: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe('groupStudentsByLocation', () => {
  it('puts students with a booking at the location in `here`', () => {
    const students = [makeStudent({ id: 's1' })];
    const bookings = [makeBooking({ locationId: 'loc1', studentIds: ['s1'] })];

    const result = groupStudentsByLocation(students, bookings, 'loc1');

    expect(result.here.map((s) => s.id)).toEqual(['s1']);
    expect(result.others).toEqual([]);
  });

  it('puts students with no booking at the location in `others`', () => {
    const students = [makeStudent({ id: 's1' }), makeStudent({ id: 's2' })];
    const bookings = [makeBooking({ locationId: 'loc1', studentIds: ['s1'] })];

    const result = groupStudentsByLocation(students, bookings, 'loc1');

    expect(result.here.map((s) => s.id)).toEqual(['s1']);
    expect(result.others.map((s) => s.id)).toEqual(['s2']);
  });

  it('counts a student who has bookings at several locations at each of them', () => {
    const students = [makeStudent({ id: 's1' })];
    const bookings = [
      makeBooking({ id: 'b1', locationId: 'loc1', studentIds: ['s1'] }),
      makeBooking({ id: 'b2', locationId: 'loc2', studentIds: ['s1'] }),
    ];

    expect(groupStudentsByLocation(students, bookings, 'loc1').here.map((s) => s.id)).toEqual(['s1']);
    expect(groupStudentsByLocation(students, bookings, 'loc2').here.map((s) => s.id)).toEqual(['s1']);
  });

  it('counts every student on a group booking', () => {
    const students = [makeStudent({ id: 's1' }), makeStudent({ id: 's2' })];
    const bookings = [makeBooking({ locationId: 'loc1', studentIds: ['s1', 's2'] })];

    const result = groupStudentsByLocation(students, bookings, 'loc1');

    expect(result.here.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(result.others).toEqual([]);
  });

  it('returns everyone in `others` when the location has no history', () => {
    const students = [makeStudent({ id: 's1' }), makeStudent({ id: 's2' })];
    const bookings = [makeBooking({ locationId: 'loc1', studentIds: ['s1'] })];

    const result = groupStudentsByLocation(students, bookings, 'loc-unused');

    expect(result.here).toEqual([]);
    expect(result.others.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('returns everyone in `others` when no location is selected', () => {
    const students = [makeStudent({ id: 's1' })];
    const bookings = [makeBooking({ locationId: 'loc1', studentIds: ['s1'] })];

    const result = groupStudentsByLocation(students, bookings, '');

    expect(result.here).toEqual([]);
    expect(result.others.map((s) => s.id)).toEqual(['s1']);
  });

  it('returns everyone in `others` while a new location is being created', () => {
    const students = [makeStudent({ id: 's1' })];
    const bookings = [makeBooking({ locationId: 'loc1', studentIds: ['s1'] })];

    const result = groupStudentsByLocation(students, bookings, '__new');

    expect(result.here).toEqual([]);
    expect(result.others.map((s) => s.id)).toEqual(['s1']);
  });

  it('preserves the incoming student order within each group', () => {
    const students = [
      makeStudent({ id: 's1' }),
      makeStudent({ id: 's2' }),
      makeStudent({ id: 's3' }),
      makeStudent({ id: 's4' }),
    ];
    const bookings = [makeBooking({ locationId: 'loc1', studentIds: ['s3', 's1'] })];

    const result = groupStudentsByLocation(students, bookings, 'loc1');

    expect(result.here.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(result.others.map((s) => s.id)).toEqual(['s2', 's4']);
  });

  it('ignores bookings with no studentIds', () => {
    const students = [makeStudent({ id: 's1' })];
    const bookings = [
      { ...makeBooking({ locationId: 'loc1' }), studentIds: undefined } as unknown as Booking,
    ];

    const result = groupStudentsByLocation(students, bookings, 'loc1');

    expect(result.here).toEqual([]);
    expect(result.others.map((s) => s.id)).toEqual(['s1']);
  });

  it('ignores booking studentIds that no longer match a student', () => {
    const students = [makeStudent({ id: 's1' })];
    const bookings = [makeBooking({ locationId: 'loc1', studentIds: ['deleted-student'] })];

    const result = groupStudentsByLocation(students, bookings, 'loc1');

    expect(result.here).toEqual([]);
    expect(result.others.map((s) => s.id)).toEqual(['s1']);
  });

  it('handles an empty student list', () => {
    const result = groupStudentsByLocation([], [makeBooking()], 'loc1');

    expect(result.here).toEqual([]);
    expect(result.others).toEqual([]);
  });
});

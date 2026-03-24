import { describe, it, expect } from 'vitest';
import {
  calculateAvailability,
  formatTimeDisplay,
  getDayDisplayName,
  DayAvailability,
} from '@/lib/availability-engine';
import { Booking, WorkingHours } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkingHours(
  day: WorkingHours['day'],
  ranges: { startTime: string; endTime: string }[],
  enabled = true
): WorkingHours {
  return { day, enabled, timeRanges: ranges };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    locationId: 'loc1',
    locationName: 'Court A',
    dayOfWeek: 'monday',
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    clientName: 'Alice',
    clientPhone: '+60123456789',
    lessonType: 'private',
    groupSize: 1,
    notes: '',
    createdAt: new Date(),
    ...overrides,
  };
}

/** Shortcut to get slots for a specific day from the full result. */
function getSlotsForDay(result: DayAvailability[], day: string) {
  return result.find((d) => d.dayOfWeek === day)?.slots ?? [];
}

// ---------------------------------------------------------------------------
// formatTimeDisplay
// ---------------------------------------------------------------------------

describe('formatTimeDisplay', () => {
  it('formats morning time', () => {
    expect(formatTimeDisplay('09:00')).toBe('9:00 AM');
  });

  it('formats noon', () => {
    expect(formatTimeDisplay('12:00')).toBe('12:00 PM');
  });

  it('formats afternoon time', () => {
    expect(formatTimeDisplay('14:30')).toBe('2:30 PM');
  });

  it('formats midnight', () => {
    expect(formatTimeDisplay('00:00')).toBe('12:00 AM');
  });

  it('formats 1 AM', () => {
    expect(formatTimeDisplay('01:05')).toBe('1:05 AM');
  });
});

// ---------------------------------------------------------------------------
// getDayDisplayName
// ---------------------------------------------------------------------------

describe('getDayDisplayName', () => {
  it('capitalizes day name', () => {
    expect(getDayDisplayName('monday')).toBe('Monday');
    expect(getDayDisplayName('sunday')).toBe('Sunday');
  });
});

// ---------------------------------------------------------------------------
// calculateAvailability
// ---------------------------------------------------------------------------

describe('calculateAvailability', () => {
  const DEFAULT_DURATION = 60; // 60-minute lesson
  const DEFAULT_BUFFER = 30; // 30-minute travel buffer

  describe('empty day (no bookings)', () => {
    it('generates all possible slots within working hours', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '12:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      // 09:00-10:00, 09:30-10:30, 10:00-11:00, 10:30-11:30, 11:00-12:00 = 5 slots
      expect(slots).toHaveLength(5);
      expect(slots[0]).toEqual({ startTime: '09:00', endTime: '10:00' });
      expect(slots[4]).toEqual({ startTime: '11:00', endTime: '12:00' });
    });
  });

  describe('disabled day', () => {
    it('returns no slots when day is disabled', () => {
      const result = calculateAvailability({
        workingHours: [
          makeWorkingHours('monday', [{ startTime: '09:00', endTime: '17:00' }], false),
        ],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [],
        clientLocationId: 'loc1',
      });

      expect(getSlotsForDay(result, 'monday')).toHaveLength(0);
    });
  });

  describe('single booking gaps', () => {
    it('generates slots in gaps before and after the booking', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '14:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [
          makeBooking({ startTime: '11:00', endTime: '12:00', locationId: 'loc1' }),
        ],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      const startTimes = slots.map((s) => s.startTime);
      // Before booking: 09:00, 09:30, 10:00
      // After booking: 12:00, 12:30, 13:00
      expect(startTimes).toContain('09:00');
      expect(startTimes).toContain('10:00');
      expect(startTimes).toContain('12:00');
      expect(startTimes).toContain('13:00');
      // Slots overlapping with booking should not exist
      expect(startTimes).not.toContain('10:30');
      expect(startTimes).not.toContain('11:00');
      expect(startTimes).not.toContain('11:30');
    });
  });

  describe('travel buffer', () => {
    it('applies travel buffer for DIFFERENT location', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '14:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 30,
        confirmedBookings: [
          makeBooking({
            startTime: '11:00',
            endTime: '12:00',
            locationId: 'loc2', // different from client
          }),
        ],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      const startTimes = slots.map((s) => s.startTime);
      // Before booking: gap is 09:00 to 11:00, but need 30-min buffer before the booking
      // usable: 09:00 to 10:30 -> slots at 09:00 (09:00-10:00), 09:30 (09:30-10:30)
      expect(startTimes).toContain('09:00');
      expect(startTimes).toContain('09:30');
      expect(startTimes).not.toContain('10:00'); // 10:00-11:00 leaves no buffer before 11:00 booking

      // After booking: gap is 12:00 to 14:00, but need 30-min buffer after the booking
      // usable: 12:30 to 14:00 -> slots at 12:30 (12:30-13:30), 13:00 (13:00-14:00)
      expect(startTimes).not.toContain('12:00');
      expect(startTimes).toContain('12:30');
      expect(startTimes).toContain('13:00');
    });

    it('does NOT apply travel buffer for SAME location', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '14:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 30,
        confirmedBookings: [
          makeBooking({
            startTime: '11:00',
            endTime: '12:00',
            locationId: 'loc1', // same as client
          }),
        ],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      const startTimes = slots.map((s) => s.startTime);
      // No buffer needed: slots right next to booking should exist
      expect(startTimes).toContain('10:00'); // 10:00-11:00 (right before booking)
      expect(startTimes).toContain('12:00'); // 12:00-13:00 (right after booking)
    });
  });

  describe('multiple time ranges per day', () => {
    it('generates slots across multiple ranges', () => {
      const result = calculateAvailability({
        workingHours: [
          makeWorkingHours('monday', [
            { startTime: '08:00', endTime: '10:00' },
            { startTime: '14:00', endTime: '16:00' },
          ]),
        ],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      const startTimes = slots.map((s) => s.startTime);
      // Range 1: 08:00, 08:30, 09:00
      // Range 2: 14:00, 14:30, 15:00
      expect(startTimes).toEqual(['08:00', '08:30', '09:00', '14:00', '14:30', '15:00']);
    });
  });

  describe('booking spanning across a time range boundary', () => {
    it('clips booking to range boundaries', () => {
      // Booking from 09:00 to 11:00 spans the end of range 08:00-10:00
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '08:00', endTime: '10:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [
          makeBooking({ startTime: '09:00', endTime: '11:00', locationId: 'loc1' }),
        ],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      // Only gap is 08:00-09:00 which fits exactly one 60-min slot
      expect(slots).toHaveLength(1);
      expect(slots[0]).toEqual({ startTime: '08:00', endTime: '09:00' });
    });
  });

  describe('back-to-back bookings', () => {
    it('produces no slots between back-to-back bookings', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '12:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [
          makeBooking({ id: 'b1', startTime: '09:00', endTime: '10:00', locationId: 'loc1' }),
          makeBooking({ id: 'b2', startTime: '10:00', endTime: '11:00', locationId: 'loc1' }),
        ],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      // Only gap: 11:00-12:00
      expect(slots).toHaveLength(1);
      expect(slots[0]).toEqual({ startTime: '11:00', endTime: '12:00' });
    });
  });

  describe('30-min increment validation', () => {
    it('generates slots in 30-minute increments', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '12:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      function toMinutes(t: string) {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      }
      for (let i = 1; i < slots.length; i++) {
        const diff = toMinutes(slots[i].startTime) - toMinutes(slots[i - 1].startTime);
        expect(diff).toBe(30);
      }
    });
  });

  describe('lesson duration too long for gap', () => {
    it('returns no slots when gap is shorter than lesson duration', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '12:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [
          makeBooking({ id: 'b1', startTime: '09:00', endTime: '10:00', locationId: 'loc1' }),
          makeBooking({ id: 'b2', startTime: '10:30', endTime: '12:00', locationId: 'loc1' }),
        ],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      // Gap is 10:00-10:30 (30 min) — too short for 60-min lesson
      expect(slots).toHaveLength(0);
    });
  });

  describe('edge: booking exactly fills the range', () => {
    it('returns no slots when booking fills entire range', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '10:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [
          makeBooking({ startTime: '09:00', endTime: '10:00', locationId: 'loc1' }),
        ],
        clientLocationId: 'loc1',
      });

      expect(getSlotsForDay(result, 'monday')).toHaveLength(0);
    });
  });

  describe('edge: working hours range shorter than lesson duration', () => {
    it('returns no slots when range is too short', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '09:30' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [],
        clientLocationId: 'loc1',
      });

      expect(getSlotsForDay(result, 'monday')).toHaveLength(0);
    });
  });

  describe('cancelled bookings are ignored', () => {
    it('does not treat cancelled bookings as occupied time', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '12:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [
          makeBooking({ startTime: '10:00', endTime: '11:00', status: 'cancelled' }),
        ],
        clientLocationId: 'loc1',
      });

      const slots = getSlotsForDay(result, 'monday');
      // Cancelled booking should not block any slots — same as no bookings
      expect(slots).toHaveLength(5);
    });
  });

  describe('returns all 7 days', () => {
    it('returns availability for every day of the week', () => {
      const result = calculateAvailability({
        workingHours: [],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [],
        clientLocationId: 'loc1',
      });

      expect(result).toHaveLength(7);
      expect(result.map((d) => d.dayOfWeek)).toEqual([
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ]);
    });
  });

  describe('no working hours for a day', () => {
    it('returns empty slots for days with no working hours config', () => {
      const result = calculateAvailability({
        workingHours: [makeWorkingHours('monday', [{ startTime: '09:00', endTime: '12:00' }])],
        lessonDurationMinutes: 60,
        travelBufferMinutes: 0,
        confirmedBookings: [],
        clientLocationId: 'loc1',
      });

      expect(getSlotsForDay(result, 'tuesday')).toHaveLength(0);
    });
  });
});

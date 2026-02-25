import { Booking, DayOfWeek, WorkingHours, TimeSlot } from '@/types';

interface AvailabilityInput {
  workingHours: WorkingHours[];
  lessonDurationMinutes: number;
  travelBufferMinutes: number;
  confirmedBookings: Booking[];
  clientLocationId: string;
}

interface DayAvailability {
  dayOfWeek: DayOfWeek;
  slots: TimeSlot[];
}

// Minimal booking shape for gap calculations within a time range
interface RangeBooking {
  locationId: string;
  start: number;
  end: number;
}

// Convert "HH:MM" to minutes from midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Convert minutes from midnight to "HH:MM"
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Generate slots in 30-minute increments within a time window
function generateSlots(
  windowStart: number,
  windowEnd: number,
  lessonDuration: number
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const increment = 30;

  for (let start = windowStart; start + lessonDuration <= windowEnd; start += increment) {
    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + lessonDuration),
    });
  }

  return slots;
}

// Calculate available slots within a single time range, accounting for bookings
function calculateRangeSlots(
  rangeStart: number,
  rangeEnd: number,
  dayBookings: Booking[],
  lessonDuration: number,
  travelBuffer: number,
  clientLocationId: string
): TimeSlot[] {
  // Filter bookings overlapping this range and clip to range boundaries
  const rangeBookings: RangeBooking[] = dayBookings
    .filter(b => {
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      return bStart < rangeEnd && bEnd > rangeStart;
    })
    .map(b => ({
      locationId: b.locationId,
      start: Math.max(timeToMinutes(b.startTime), rangeStart),
      end: Math.min(timeToMinutes(b.endTime), rangeEnd),
    }))
    .sort((a, b) => a.start - b.start);

  if (rangeBookings.length === 0) {
    return generateSlots(rangeStart, rangeEnd, lessonDuration);
  }

  const allSlots: TimeSlot[] = [];

  // Process gaps: before first booking, between bookings, after last booking
  for (let i = 0; i <= rangeBookings.length; i++) {
    let gapStart: number;
    let gapEnd: number;
    let bufferBefore = 0;
    let bufferAfter = 0;

    if (i === 0) {
      gapStart = rangeStart;
      gapEnd = rangeBookings[0].start;
      if (rangeBookings[0].locationId !== clientLocationId) {
        bufferAfter = travelBuffer;
      }
    } else if (i === rangeBookings.length) {
      gapStart = rangeBookings[i - 1].end;
      gapEnd = rangeEnd;
      if (rangeBookings[i - 1].locationId !== clientLocationId) {
        bufferBefore = travelBuffer;
      }
    } else {
      gapStart = rangeBookings[i - 1].end;
      gapEnd = rangeBookings[i].start;
      if (rangeBookings[i - 1].locationId !== clientLocationId) {
        bufferBefore = travelBuffer;
      }
      if (rangeBookings[i].locationId !== clientLocationId) {
        bufferAfter = travelBuffer;
      }
    }

    const usableStart = gapStart + bufferBefore;
    const usableEnd = gapEnd - bufferAfter;

    if (usableEnd - usableStart >= lessonDuration) {
      allSlots.push(...generateSlots(usableStart, usableEnd, lessonDuration));
    }
  }

  return allSlots;
}

// Calculate available slots for a single day across all its time ranges
function calculateDayAvailability(
  dayHours: WorkingHours,
  bookings: Booking[],
  lessonDuration: number,
  travelBuffer: number,
  clientLocationId: string
): TimeSlot[] {
  if (!dayHours.enabled || !dayHours.timeRanges || dayHours.timeRanges.length === 0) {
    return [];
  }

  const dayBookings = bookings
    .filter(b => b.status === 'confirmed')
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const allSlots: TimeSlot[] = [];

  for (const range of dayHours.timeRanges) {
    const rangeStart = timeToMinutes(range.startTime);
    const rangeEnd = timeToMinutes(range.endTime);
    if (rangeEnd > rangeStart) {
      allSlots.push(
        ...calculateRangeSlots(rangeStart, rangeEnd, dayBookings, lessonDuration, travelBuffer, clientLocationId)
      );
    }
  }

  return allSlots;
}

// Main function: calculate availability for all days
export function calculateAvailability(input: AvailabilityInput): DayAvailability[] {
  const { workingHours, lessonDurationMinutes, travelBufferMinutes, confirmedBookings, clientLocationId } = input;

  const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  return days.map(day => {
    const dayHours = workingHours.find(wh => wh.day === day);
    if (!dayHours) {
      return { dayOfWeek: day, slots: [] };
    }

    const dayBookings = confirmedBookings.filter(b => b.dayOfWeek === day);
    const slots = calculateDayAvailability(dayHours, dayBookings, lessonDurationMinutes, travelBufferMinutes, clientLocationId);

    return { dayOfWeek: day, slots };
  });
}

// Helper to format time for display
export function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Helper to get day display name
export function getDayDisplayName(day: DayOfWeek): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

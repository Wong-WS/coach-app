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
  const increment = 30; // 30-minute increments

  for (let start = windowStart; start + lessonDuration <= windowEnd; start += increment) {
    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + lessonDuration),
    });
  }

  return slots;
}

// Calculate available slots for a single day
function calculateDayAvailability(
  dayHours: WorkingHours,
  bookings: Booking[],
  lessonDuration: number,
  travelBuffer: number,
  clientLocationId: string
): TimeSlot[] {
  if (!dayHours.enabled) {
    return [];
  }

  const workStart = timeToMinutes(dayHours.startTime);
  const workEnd = timeToMinutes(dayHours.endTime);

  // Filter confirmed bookings for this day and sort by start time
  const dayBookings = bookings
    .filter(b => b.status === 'confirmed')
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  if (dayBookings.length === 0) {
    // No bookings - entire working hours available
    return generateSlots(workStart, workEnd, lessonDuration);
  }

  const allSlots: TimeSlot[] = [];

  // Process gaps between bookings (including before first and after last)
  for (let i = 0; i <= dayBookings.length; i++) {
    let gapStart: number;
    let gapEnd: number;
    let bufferBefore = 0;
    let bufferAfter = 0;

    if (i === 0) {
      // Gap before first booking
      gapStart = workStart;
      gapEnd = timeToMinutes(dayBookings[0].startTime);

      // Buffer needed if next booking is at different location
      if (dayBookings[0].locationId !== clientLocationId) {
        bufferAfter = travelBuffer;
      }
    } else if (i === dayBookings.length) {
      // Gap after last booking
      gapStart = timeToMinutes(dayBookings[i - 1].endTime);
      gapEnd = workEnd;

      // Buffer needed if previous booking is at different location
      if (dayBookings[i - 1].locationId !== clientLocationId) {
        bufferBefore = travelBuffer;
      }
    } else {
      // Gap between two bookings
      gapStart = timeToMinutes(dayBookings[i - 1].endTime);
      gapEnd = timeToMinutes(dayBookings[i].startTime);

      // Buffer needed for adjacent different-location bookings
      if (dayBookings[i - 1].locationId !== clientLocationId) {
        bufferBefore = travelBuffer;
      }
      if (dayBookings[i].locationId !== clientLocationId) {
        bufferAfter = travelBuffer;
      }
    }

    // Apply buffers to shrink usable window
    const usableStart = gapStart + bufferBefore;
    const usableEnd = gapEnd - bufferAfter;

    // Generate slots if window is large enough
    if (usableEnd - usableStart >= lessonDuration) {
      const slots = generateSlots(usableStart, usableEnd, lessonDuration);
      allSlots.push(...slots);
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

    const slots = calculateDayAvailability(
      dayHours,
      dayBookings,
      lessonDurationMinutes,
      travelBufferMinutes,
      clientLocationId
    );

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

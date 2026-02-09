// Core types for the coach-app

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Coach {
  id: string;
  displayName: string;
  slug: string;
  email: string;
  serviceType: string;
  lessonDurationMinutes: number;
  travelBufferMinutes: number;
  whatsappNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CoachSlug {
  coachId: string;
}

export interface WorkingHours {
  day: DayOfWeek;
  enabled: boolean;
  startTime: string; // "15:00" (24h format)
  endTime: string;   // "18:30"
}

export interface Location {
  id: string;
  name: string;
  address?: string;
  notes?: string;
  createdAt: Date;
}

export type BookingStatus = 'confirmed' | 'cancelled';
export type LessonType = 'private' | 'group';

export interface Booking {
  id: string;
  locationId: string;
  locationName: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "14:00"
  endTime: string;   // "15:00"
  status: BookingStatus;
  clientName: string;
  clientPhone: string;
  lessonType: LessonType;
  groupSize: number;
  notes: string;
  createdAt: Date;
  cancelledAt?: Date;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
}

export interface AvailableSlot extends TimeSlot {
  dayOfWeek: DayOfWeek;
}

// Form types
export interface SignupFormData {
  email: string;
  password: string;
  displayName: string;
  slug: string;
  serviceType: string;
  whatsappNumber: string;
}

// Waitlist types
export type WaitlistStatus = 'waiting' | 'contacted' | 'booked';
export type PreferredTime = 'morning' | 'afternoon' | 'evening' | 'any';

export interface WaitlistEntry {
  id: string;
  locationId: string;
  locationName: string;
  dayOfWeek: DayOfWeek;
  preferredTime: PreferredTime;
  clientName: string;
  clientPhone: string;
  notes: string;
  status: WaitlistStatus;
  createdAt: Date;
  contactedAt?: Date;
  bookedAt?: Date;
}

export interface BookingFormData {
  locationId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  clientName: string;
  clientPhone: string;
  lessonType: LessonType;
  groupSize: number;
  notes: string;
}

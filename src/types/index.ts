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

export interface TimeRange {
  startTime: string; // "09:00" (24h format)
  endTime: string;   // "17:00"
}

export interface WorkingHours {
  day: DayOfWeek;
  enabled: boolean;
  timeRanges: TimeRange[];
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
  price?: number;
  linkedStudentIds?: string[]; // secondary students sharing this group lesson
  studentPrices?: Record<string, number>; // per-student prices for split payment groups
  walletId?: string; // which wallet pays for this booking
  studentWallets?: Record<string, string>; // per-student wallet override for group lessons
  startDate?: string; // YYYY-MM-DD — booking only appears from this date onwards
  endDate?: string;   // YYYY-MM-DD — booking only appears up to and including this date
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


export interface Student {
  id: string;
  clientName: string;
  clientPhone: string;
  linkToken: string;
  prepaidTotal: number;
  prepaidUsed: number;
  credit: number;
  pendingPayment: number;
  lessonRate?: number; // per-lesson rate (RM) for this student
  payPerLesson?: boolean;
  linkedToStudentId?: string; // if set, this is a secondary student linked to a primary
  nextPrepaidTotal?: number; // queued next package (set when student renews early)
  nextPrepaidPaidAt?: Date;  // when the next package payment was recorded
  useMonetaryBalance?: boolean; // opt-in: track RM balance instead of lesson counts
  monetaryBalance?: number;     // current RM balance (positive = credit, negative = owes)
  packageSize?: number;         // lessons per package, for renewal pricing (lessonRate × packageSize)
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LessonLog {
  id: string;
  date: string;             // "YYYY-MM-DD"
  bookingId?: string;
  studentId: string;
  studentName: string;
  locationName: string;
  startTime: string;
  endTime: string;
  price: number;
  note?: string;
  paySeparately?: boolean;
  createdAt: Date;
}

export interface ClassException {
  id: string;
  bookingId: string;
  originalDate: string;       // "YYYY-MM-DD"
  type: 'cancelled' | 'rescheduled';
  newDate?: string;           // only for rescheduled
  newStartTime?: string;      // optional time override for rescheduled
  newEndTime?: string;
  newLocationId?: string;     // optional location override for rescheduled
  newLocationName?: string;
  newPrice?: number;
  newNote?: string;
  createdAt: Date;
}

export interface Wallet {
  id: string;
  name: string;
  balance: number;
  studentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type WalletTransactionType = 'top-up' | 'charge' | 'refund' | 'adjustment';

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
  studentId?: string;
  lessonLogId?: string;
  date: string; // YYYY-MM-DD
  createdAt: Date;
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

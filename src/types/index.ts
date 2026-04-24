export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Coach {
  id: string;
  displayName: string;
}

export interface Location {
  id: string;
  name: string;
  address?: string;
  notes?: string;
  createdAt: Date;
}

export type BookingStatus = 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  locationId: string;
  locationName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  className: string;
  notes: string;
  studentIds: string[];
  studentPrices: Record<string, number>;
  studentWallets: Record<string, string>;
  startDate?: string;
  endDate?: string;
  createdAt: Date;
  cancelledAt?: Date;
}

export interface SignupFormData {
  email: string;
  password: string;
  displayName: string;
}

export interface Student {
  id: string;
  clientName: string;
  clientPhone: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LessonLog {
  id: string;
  date: string;
  bookingId?: string;
  studentId: string;
  studentName: string;
  locationName: string;
  startTime: string;
  endTime: string;
  price: number;
  note?: string;
  createdAt: Date;
}

export interface ClassException {
  id: string;
  bookingId: string;
  originalDate: string;
  type: 'cancelled' | 'rescheduled';
  newDate?: string;
  newStartTime?: string;
  newEndTime?: string;
  newLocationId?: string;
  newLocationName?: string;
  newNote?: string;
  newClassName?: string;
  newStudentIds?: string[];
  newStudentPrices?: Record<string, number>;
  newStudentWallets?: Record<string, string>;
  createdAt: Date;
}

export interface Wallet {
  id: string;
  name: string;
  balance: number;
  studentIds: string[];
  archived?: boolean;           // default false. hides from default list, disables alerts.
  tabMode?: boolean;            // default false. student pays after each lesson; wallet sits near zero, skip Low alerts.
  portalToken?: string;         // 10-char nanoid, set once when coach shares portal link
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
  date: string;
  createdAt: Date;
}

import type { AwayPeriod, Booking, ClassException, LessonLog, Student, Wallet } from '@/types';
import type { TopUp } from '@/lib/analytics/fetch';

/** Everything both views compute from. Loaded once by the page. */
export interface AnalyticsInputs {
  today: string;
  /** Confirmed bookings only — what's on the schedule. */
  confirmed: Booking[];
  /** Every booking of any status — for attributing cancellations. */
  allBookings: Booking[];
  wallets: Wallet[];
  students: Student[];
  awayPeriods: AwayPeriod[];
  logs: LessonLog[];
  exceptions: ClassException[];
  topUps: TopUp[];
  firstLogDate: string | null;
}

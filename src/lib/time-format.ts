import { DayOfWeek } from '@/types';

export function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function getDayDisplayName(day: DayOfWeek): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

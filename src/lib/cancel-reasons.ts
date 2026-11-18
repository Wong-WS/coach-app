/**
 * Why a class was cancelled. Saved on a cancelled classException (`reason`)
 * and on a soft-cancelled one-off booking (`cancelReason`), so the yearly
 * summary can break cancellations down. Tracked from 2026-11-18; anything
 * cancelled earlier has no reason.
 *
 * 'away' is set automatically when time off skips a class — never picked.
 */
export type CancelReason = 'weather' | 'student' | 'coach' | 'other' | 'away';

export const PICKABLE_CANCEL_REASONS: readonly { value: CancelReason; label: string }[] = [
  { value: 'weather', label: 'Weather' },
  { value: 'student', label: 'Student' },
  { value: 'coach', label: 'Me' },
  { value: 'other', label: 'Other' },
];

/**
 * A single-date cancel needs a reason. Ending a series ("cancel this +
 * future") means a student stopped, not a cancelled class, so it doesn't.
 */
export function canConfirmCancel(
  scope: 'this' | 'future',
  reason: CancelReason | null,
): boolean {
  return scope === 'future' || reason !== null;
}

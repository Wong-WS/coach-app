import { describe, it, expect } from 'vitest';
import { PICKABLE_CANCEL_REASONS, canConfirmCancel } from '@/lib/cancel-reasons';

describe('PICKABLE_CANCEL_REASONS', () => {
  it('offers Weather, Student, Me and Other in that order', () => {
    expect(PICKABLE_CANCEL_REASONS.map((r) => r.label)).toEqual([
      'Weather',
      'Student',
      'Me',
      'Other',
    ]);
  });

  it('never offers the automatic time-off reason', () => {
    expect(PICKABLE_CANCEL_REASONS.map((r) => r.value)).not.toContain('away');
  });
});

describe('canConfirmCancel', () => {
  it('blocks cancelling a single date until a reason is picked', () => {
    expect(canConfirmCancel('this', null)).toBe(false);
  });

  it('allows cancelling a single date once a reason is picked', () => {
    expect(canConfirmCancel('this', 'weather')).toBe(true);
  });

  it('allows ending a series without a reason', () => {
    expect(canConfirmCancel('future', null)).toBe(true);
  });
});

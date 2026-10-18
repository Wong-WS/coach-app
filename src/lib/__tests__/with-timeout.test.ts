import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout } from '@/lib/with-timeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('resolves with the value when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('coach'), 10_000, 'coach profile')).resolves.toBe(
      'coach',
    );
  });

  it('rejects once the deadline passes, naming what stalled', async () => {
    // The case this exists for: a Firestore read that neither resolves nor
    // rejects because the SDK is retrying a transient error forever.
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});

    const raced = withTimeout(never, 10_000, 'coach profile');
    const assertion = expect(raced).rejects.toThrow(/coach profile.*10000/);
    await vi.advanceTimersByTimeAsync(10_000);

    await assertion;
  });

  it('does not fire the timeout a moment early', async () => {
    vi.useFakeTimers();
    let settled = false;
    const raced = withTimeout(new Promise<string>(() => {}), 10_000, 'coach profile').catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await raced;
    expect(settled).toBe(true);
  });

  it('passes the original rejection through untouched', async () => {
    const boom = new Error('permission-denied');

    await expect(withTimeout(Promise.reject(boom), 10_000, 'coach profile')).rejects.toBe(boom);
  });

  it('clears its timer once the work settles', async () => {
    // Otherwise every call leaves a 10s timer pending behind it.
    vi.useFakeTimers();

    await withTimeout(Promise.resolve('coach'), 10_000, 'coach profile');

    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when the work rejects too', async () => {
    vi.useFakeTimers();

    await expect(withTimeout(Promise.reject(new Error('nope')), 10_000, 'x')).rejects.toThrow();

    expect(vi.getTimerCount()).toBe(0);
  });
});

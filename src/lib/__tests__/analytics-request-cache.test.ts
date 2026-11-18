import { describe, it, expect } from 'vitest';
import { createRequestCache } from '@/lib/analytics/request-cache';

describe('createRequestCache', () => {
  it('loads a key once even when asked again before the first load finishes', async () => {
    const cache = createRequestCache<number>();
    let calls = 0;
    let release!: (n: number) => void;
    const load = () => {
      calls += 1;
      return new Promise<number>((r) => (release = r));
    };
    const a = cache.get('oct', load);
    const b = cache.get('oct', load);
    release(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(calls).toBe(1);
  });

  it('remembers a finished load and exposes it synchronously', async () => {
    const cache = createRequestCache<number>();
    expect(cache.peek('nov')).toBeUndefined();
    await cache.get('nov', async () => 3);
    expect(cache.peek('nov')).toBe(3);
  });

  it('forgets a failed load so it can be retried', async () => {
    const cache = createRequestCache<number>();
    await expect(cache.get('dec', async () => { throw new Error('quota'); })).rejects.toThrow('quota');
    expect(await cache.get('dec', async () => 5)).toBe(5);
  });
});

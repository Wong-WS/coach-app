/**
 * Loads each key at most once at a time: a second request for a key that's
 * still loading shares the first one's promise, and finished results are
 * kept. Failed loads are forgotten so they can be retried.
 */
export function createRequestCache<T>() {
  const done = new Map<string, T>();
  const pending = new Map<string, Promise<T>>();

  return {
    peek(key: string): T | undefined {
      return done.get(key);
    },
    get(key: string, load: () => Promise<T>): Promise<T> {
      if (done.has(key)) return Promise.resolve(done.get(key) as T);
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;
      const p = load().then(
        (value) => {
          done.set(key, value);
          pending.delete(key);
          return value;
        },
        (err) => {
          pending.delete(key);
          throw err;
        },
      );
      pending.set(key, p);
      return p;
    },
  };
}

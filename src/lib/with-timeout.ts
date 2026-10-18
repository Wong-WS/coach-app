/**
 * Reject a promise that takes too long, instead of waiting on it forever.
 *
 * A failed Firestore read rejects and can be caught. A read the SDK considers
 * *retryable* — an unreachable backend, a throttled project — neither resolves
 * nor rejects: it backs off and tries again, indefinitely. Awaiting one of
 * those means the line after the `await` may never run, so a `finally` is no
 * protection and the UI sits on whatever it was showing. A deadline turns that
 * silence into an error the caller can actually handle.
 *
 * The losing promise is not cancelled — nothing can cancel a Firestore read —
 * so a late result is simply ignored.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

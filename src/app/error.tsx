'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Btn } from '@/components/paper/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app error]', error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-md rounded-[14px] border p-6 text-center"
        style={{
          background: 'var(--panel)',
          borderColor: 'var(--line-2)',
        }}
      >
        <div
          className="text-[15px] font-medium mb-2"
          style={{ color: 'var(--ink)' }}
        >
          Something went wrong
        </div>
        <div
          className="text-[13.5px] mb-5"
          style={{ color: 'var(--ink-3)' }}
        >
          An unexpected error occurred. Try again, or go back home.
        </div>
        <div className="flex justify-center gap-2">
          <Btn variant="primary" onClick={reset}>
            Try again
          </Btn>
          <Link href="/">
            <Btn variant="outline">Go home</Btn>
          </Link>
        </div>
        {error.digest && (
          <div
            className="mt-4 text-[11.5px] mono"
            style={{ color: 'var(--ink-4)' }}
          >
            ref: {error.digest}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Btn } from '@/components/paper/Button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard error]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
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
          We hit an unexpected error. Your data is safe — try again, or head
          back to the overview.
        </div>
        <div className="flex justify-center gap-2">
          <Btn variant="primary" onClick={reset}>
            Try again
          </Btn>
          <Link href="/dashboard">
            <Btn variant="outline">Go to overview</Btn>
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

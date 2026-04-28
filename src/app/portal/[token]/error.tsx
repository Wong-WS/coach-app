'use client';

import { useEffect } from 'react';
import { Btn } from '@/components/paper/Button';

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[portal error]', error);
  }, [error]);

  return (
    <div className="py-16 px-6 text-center">
      <div
        className="text-[15px] font-medium mb-2"
        style={{ color: 'var(--ink)' }}
      >
        Couldn&apos;t load this page
      </div>
      <div
        className="text-[13.5px] mb-5"
        style={{ color: 'var(--ink-3)' }}
      >
        Please check your connection and try again. If the issue continues,
        contact your coach.
      </div>
      <Btn variant="primary" onClick={reset}>
        Try again
      </Btn>
    </div>
  );
}

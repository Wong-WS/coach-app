'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from './auth-context';

function RedirectInner({ to }: { to: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) {
      router.replace(to);
    }
  }, [loading, user, router, to]);
  return null;
}

export function RedirectIfSignedIn({ to = '/dashboard' }: { to?: string }) {
  return (
    <AuthProvider>
      <RedirectInner to={to} />
    </AuthProvider>
  );
}

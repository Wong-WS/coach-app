'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Btn } from '@/components/paper';

function useSignedIn() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate loading=false when Firebase auth isn't configured (dev-only path)
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { signedIn: !loading && !!user, loading };
}

export function NavCta() {
  const { signedIn } = useSignedIn();

  if (signedIn) {
    return (
      <Link href="/dashboard">
        <Btn variant="primary" size="md">
          Open dashboard
        </Btn>
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="hidden md:inline-flex rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--line)]"
        style={{ color: 'var(--ink-2)' }}
      >
        Log in
      </Link>
      <Link href="/signup">
        <Btn variant="primary" size="md">
          Start free
        </Btn>
      </Link>
    </>
  );
}

export function HeroCta() {
  const { signedIn } = useSignedIn();

  if (signedIn) {
    return (
      <Link href="/dashboard">
        <Btn variant="primary" size="lg">
          Open dashboard
        </Btn>
      </Link>
    );
  }

  return (
    <Link href="/signup">
      <Btn variant="primary" size="lg">
        Start free
      </Btn>
    </Link>
  );
}

export function FinalCta() {
  const { signedIn } = useSignedIn();

  if (signedIn) {
    return (
      <Link href="/dashboard">
        <Btn variant="primary" size="lg">
          Open dashboard →
        </Btn>
      </Link>
    );
  }

  return (
    <Link href="/signup">
      <Btn variant="primary" size="lg">
        Start free →
      </Btn>
    </Link>
  );
}

export function FooterLogIn() {
  const { signedIn } = useSignedIn();
  if (signedIn) return null;
  return (
    <Link
      href="/login"
      className="transition-colors"
      style={{ color: 'var(--ink-3)' }}
    >
      Log in
    </Link>
  );
}

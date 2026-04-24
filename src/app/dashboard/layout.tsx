'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  IconHome,
  IconWallet,
  IconCalendar,
  IconUsers,
  IconSettings,
  IconSun,
  IconMoon,
  IconBell,
  IconLogOut,
} from '@/components/paper/Icons';
import { Avatar } from '@/components/paper/Avatar';
import { Btn } from '@/components/paper/Button';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: IconHome },
  { href: '/dashboard/payments', label: 'Payments', icon: IconWallet },
  { href: '/dashboard/bookings', label: 'Schedule', icon: IconCalendar },
  { href: '/dashboard/students', label: 'Students', icon: IconUsers },
] as const;

function useCoachSlug(coachId: string | undefined) {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!coachId || !db) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'coaches', coachId));
        if (snap.exists()) setSlug(snap.data().slug || null);
      } catch {
        /* noop */
      }
    })();
  }, [coachId]);
  return slug;
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, coach, loading, signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const slug = useCoachSlug(coach?.id);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }} />
      </div>
    );
  }

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const displayName = coach?.displayName || user.email || 'Coach';
  const firstName = displayName.split(' ')[0] || 'Coach';

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Topbar (desktop) */}
      <header
        className="hidden lg:flex fixed top-0 inset-x-0 h-14 z-30 items-center gap-4 px-5 border-b"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div
            className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center font-bold text-[13px]"
            style={{ background: 'var(--ink)', color: 'var(--bg)', letterSpacing: '-0.5px' }}
          >
            C
          </div>
          <div className="text-[15px] font-semibold" style={{ letterSpacing: '-0.2px' }}>Coach</div>
          {slug && (
            <span className="mono text-[12px]" style={{ color: 'var(--ink-3)' }}>/{slug}</span>
          )}
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg border"
            style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <button
            aria-label="Notifications"
            className="p-1.5 rounded-lg border"
            style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}
          >
            <IconBell size={16} />
          </button>
          <div className="w-px h-[22px] mx-1" style={{ background: 'var(--line)' }} />
          <Avatar name={displayName} size={28} />
          <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{displayName}</span>
        </div>
      </header>

      {/* Topbar (mobile) */}
      <header
        className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-5 py-3 border-b"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center font-bold text-[13px]"
            style={{ background: 'var(--ink)', color: 'var(--bg)', letterSpacing: '-0.5px' }}
          >
            C
          </div>
          <div className="text-[15px] font-semibold" style={{ letterSpacing: '-0.2px' }}>Hi, {firstName}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg border"
            style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}
          >
            {isDark ? <IconSun size={15} /> : <IconMoon size={15} />}
          </button>
          <Avatar name={displayName} size={30} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0 lg:pt-14">
        {/* Sidebar (desktop) */}
        <aside
          className="hidden lg:flex flex-col w-[212px] flex-shrink-0 border-r p-3 gap-0.5"
          style={{
            background: 'var(--panel)',
            borderColor: 'var(--line)',
            height: 'calc(100dvh - 56px)',
            position: 'sticky',
            top: 56,
          }}
        >
          <div
            className="px-2.5 pt-1.5 pb-2 text-[10.5px] font-semibold uppercase"
            style={{ color: 'var(--ink-4)', letterSpacing: '0.08em' }}
          >
            Coach
          </div>
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-colors"
                style={{
                  background: isActive ? 'var(--line)' : 'transparent',
                  color: isActive ? 'var(--ink)' : 'var(--ink-2)',
                }}
              >
                <span style={{ color: isActive ? 'var(--ink)' : 'var(--ink-3)' }}>
                  <Icon size={17} />
                </span>
                {item.label}
              </Link>
            );
          })}
          <div className="flex-1" />

          {slug && (
            <div
              className="m-1 p-3 rounded-[10px] border border-dashed"
              style={{ borderColor: 'var(--line-2)', background: 'var(--bg)' }}
            >
              <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--ink-3)' }}>Public page</div>
              <div
                className="mono text-[12px] mb-2 break-all leading-tight"
                style={{ color: 'var(--ink-2)' }}
              >
                coach-simplify.com/{slug}
              </div>
              <Btn size="sm" variant="outline" full onClick={() => navigator.clipboard?.writeText(`https://coach-simplify.com/${slug}`)}>
                Copy link
              </Btn>
            </div>
          )}
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-colors"
            style={{
              background: pathname?.startsWith('/dashboard/settings') ? 'var(--line)' : 'transparent',
              color: pathname?.startsWith('/dashboard/settings') ? 'var(--ink)' : 'var(--ink-2)',
            }}
          >
            <span style={{ color: pathname?.startsWith('/dashboard/settings') ? 'var(--ink)' : 'var(--ink-3)' }}>
              <IconSettings size={17} />
            </span>
            Settings
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium text-left"
            style={{ color: 'var(--ink-3)', background: 'transparent' }}
          >
            <IconLogOut size={17} /> Sign out
          </button>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex px-1.5 pt-2 pb-safe border-t"
        style={{
          background: 'var(--panel)',
          borderColor: 'var(--line)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 10px)',
        }}
      >
        {navItems.map((item) => {
          const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center gap-1 py-1.5"
              style={{ color: isActive ? 'var(--ink)' : 'var(--ink-3)' }}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
        <Link
          href="/dashboard/settings"
          className="flex-1 flex flex-col items-center gap-1 py-1.5"
          style={{ color: pathname?.startsWith('/dashboard/settings') ? 'var(--ink)' : 'var(--ink-3)' }}
        >
          <IconSettings size={20} />
          <span className="text-[10px] font-medium">Settings</span>
        </Link>
      </nav>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  );
}

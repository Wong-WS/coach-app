import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Wallet',
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div className="max-w-[560px] mx-auto px-4 py-5">{children}</div>
    </div>
  );
}

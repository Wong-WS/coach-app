import Link from 'next/link';
import { RedirectIfSignedIn } from '@/lib/auth-redirect';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      <RedirectIfSignedIn />
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <div className="text-2xl font-bold text-blue-600">CoachApp</div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-lg text-sm font-medium px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Log in
        </Link>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">CoachApp</h1>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-lg text-sm font-medium px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </main>
    </div>
  );
}

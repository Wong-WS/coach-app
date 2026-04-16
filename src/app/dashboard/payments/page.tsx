'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const TABS = ['Overview', 'Wallets', 'History'] as const;
type Tab = typeof TABS[number];

export default function PaymentsPage() {
  const { coach } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Wallets');

  if (!coach) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-6">Payments</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-[#333333]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && (
        <p className="text-gray-500 dark:text-zinc-400">Overview coming soon — will replace current Income page.</p>
      )}
      {activeTab === 'Wallets' && (
        <p className="text-gray-500 dark:text-zinc-400">Wallets tab — next task.</p>
      )}
      {activeTab === 'History' && (
        <p className="text-gray-500 dark:text-zinc-400">Transaction history — coming later.</p>
      )}
    </div>
  );
}

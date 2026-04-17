'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export default function SettingsPage() {
  const { coach } = useAuth();
  const { showToast } = useToast();
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Settings</h1>
      </div>

      {/* Danger zone */}
      <div className="border-t border-gray-200 dark:border-[#333333] pt-8">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">
          Reset your account to start fresh. This deletes all students, bookings, lessons, wallets, and locations. Your profile is kept.
        </p>
        <Button
          variant="ghost"
          onClick={() => setShowResetModal(true)}
          className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Reset Account
        </Button>
      </div>

      {/* Reset confirmation modal */}
      <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title="Reset Account">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            This will permanently delete all your data:
          </p>
          <ul className="text-sm text-gray-600 dark:text-zinc-400 list-disc pl-5 space-y-1">
            <li>All students</li>
            <li>All bookings</li>
            <li>All lesson logs</li>
            <li>All wallets and transactions</li>
            <li>All locations</li>
          </ul>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            This cannot be undone.
          </p>
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setShowResetModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!coach) return;
                setResetting(true);
                try {
                  const res = await fetch('/api/reset-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ coachId: coach.id }),
                  });
                  const data = await res.json();
                  const total = Object.values(data.deleted as Record<string, number>).reduce((a, b) => a + b, 0);
                  showToast(`Account reset — ${total} records deleted`, 'success');
                  setShowResetModal(false);
                } catch {
                  showToast('Failed to reset account', 'error');
                } finally {
                  setResetting(false);
                }
              }}
              loading={resetting}
              disabled={resetting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {resetting ? 'Resetting...' : 'Yes, Reset Everything'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

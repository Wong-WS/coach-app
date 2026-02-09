'use client';

import { useState } from 'react';
import { updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useWaitlist } from '@/hooks/useCoachData';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { WaitlistStatus, WaitlistEntry } from '@/types';
import { getDayDisplayName } from '@/lib/availability-engine';

const STATUS_TABS: { label: string; value: WaitlistStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Booked', value: 'booked' },
];

const PREFERRED_TIME_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  any: 'Any time',
};

const STATUS_BADGE_STYLES: Record<WaitlistStatus, string> = {
  waiting: 'bg-yellow-100 text-yellow-800',
  contacted: 'bg-purple-100 text-purple-800',
  booked: 'bg-green-100 text-green-800',
};

export default function WaitlistPage() {
  const { coach } = useAuth();
  const { waitlist, loading } = useWaitlist(coach?.id);
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<WaitlistStatus | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredEntries = activeTab === 'all'
    ? waitlist
    : waitlist.filter((e) => e.status === activeTab);

  const counts: Record<string, number> = {
    all: waitlist.length,
    waiting: waitlist.filter((e) => e.status === 'waiting').length,
    contacted: waitlist.filter((e) => e.status === 'contacted').length,
    booked: waitlist.filter((e) => e.status === 'booked').length,
  };

  const handleStatusUpdate = async (entry: WaitlistEntry, newStatus: WaitlistStatus) => {
    if (!coach || !db) return;
    setUpdatingId(entry.id);

    try {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'contacted') updates.contactedAt = serverTimestamp();
      if (newStatus === 'booked') updates.bookedAt = serverTimestamp();

      await updateDoc(doc(db, 'coaches', coach.id, 'waitlist', entry.id), updates);
      showToast(`Status updated to ${newStatus}`, 'success');
    } catch (error) {
      console.error('Error updating waitlist entry:', error);
      showToast('Failed to update status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!coach || !db) return;
    setConfirmDeleteId(null);
    setDeletingId(entryId);

    try {
      await deleteDoc(doc(db, 'coaches', coach.id, 'waitlist', entryId));
      showToast('Waitlist entry removed', 'success');
    } catch (error) {
      console.error('Error deleting waitlist entry:', error);
      showToast('Failed to remove entry', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleWhatsApp = (entry: WaitlistEntry) => {
    const phone = entry.clientPhone.replace(/[^0-9]/g, '');
    const timeLabel = PREFERRED_TIME_LABELS[entry.preferredTime] || entry.preferredTime;
    const message = encodeURIComponent(
      `Hi ${entry.clientName}, I have availability on ${getDayDisplayName(entry.dayOfWeek)} (${timeLabel}) at ${entry.locationName}. Would you like to book a slot?`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Waitlist</h1>
        <p className="text-gray-600 mt-1">Manage clients waiting for available slots</p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
              activeTab === tab.value
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {counts[tab.value]}
            </span>
          </button>
        ))}
      </div>

      {/* Entries */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No waitlist entries</h3>
          <p className="text-gray-500">
            {activeTab === 'all'
              ? 'When clients join your waitlist from your public page, they\'ll appear here.'
              : `No entries with status "${activeTab}".`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{entry.clientName}</h3>
                  <p className="text-sm text-gray-500">{entry.clientPhone}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE_STYLES[entry.status]}`}>
                  {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                </span>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-sm text-gray-600 mb-4 flex-1">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {getDayDisplayName(entry.dayOfWeek)} &middot; {PREFERRED_TIME_LABELS[entry.preferredTime]}
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  {entry.locationName}
                </div>
                {entry.notes && (
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <span className="text-gray-500">{entry.notes}</span>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Joined {entry.createdAt.toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                {/* WhatsApp button */}
                <button
                  onClick={() => handleWhatsApp(entry)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp {entry.clientName.split(' ')[0]}
                </button>

                {/* Status buttons */}
                <div className="flex gap-2">
                  {(['waiting', 'contacted', 'booked'] as WaitlistStatus[])
                    .filter((s) => s !== entry.status)
                    .map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusUpdate(entry, status)}
                        disabled={updatingId === entry.id}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          status === 'waiting'
                            ? 'border-yellow-200 text-yellow-700 hover:bg-yellow-50'
                            : status === 'contacted'
                            ? 'border-purple-200 text-purple-700 hover:bg-purple-50'
                            : 'border-green-200 text-green-700 hover:bg-green-50'
                        } disabled:opacity-50`}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </button>
                    ))}
                </div>

                {/* Delete */}
                <button
                  onClick={() => setConfirmDeleteId(entry.id)}
                  disabled={deletingId === entry.id}
                  className="w-full px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deletingId === entry.id ? 'Removing...' : 'Remove from waitlist'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Remove from Waitlist"
      >
        <p className="text-gray-600 mb-6">
          Are you sure you want to remove this entry from the waitlist? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}>
            Yes, Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}

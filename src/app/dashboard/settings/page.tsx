'use client';

import { useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useLocations } from '@/hooks/useCoachData';
import type { Location } from '@/types';

export default function SettingsPage() {
  const { coach } = useAuth();
  const { showToast } = useToast();
  const { locations } = useLocations(coach?.id);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [creatingLocation, setCreatingLocation] = useState(false);

  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const handleAddLocation = async () => {
    if (!coach || !db) return;
    const name = newLocationName.trim();
    if (!name) return;
    setCreatingLocation(true);
    try {
      const firestore = db as Firestore;
      await addDoc(collection(firestore, 'coaches', coach.id, 'locations'), {
        name,
        address: '',
        notes: '',
        createdAt: serverTimestamp(),
      });
      showToast('Location added', 'success');
      setShowAddLocation(false);
      setNewLocationName('');
    } catch {
      showToast('Failed to add location', 'error');
    } finally {
      setCreatingLocation(false);
    }
  };

  const openEditLocation = (loc: Location) => {
    setEditingLocation(loc);
    setEditLocationName(loc.name);
  };

  const handleSaveLocation = async () => {
    if (!coach || !db || !editingLocation) return;
    const name = editLocationName.trim();
    if (!name || name === editingLocation.name) {
      setEditingLocation(null);
      return;
    }
    setSavingLocation(true);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      batch.update(doc(firestore, 'coaches', coach.id, 'locations', editingLocation.id), {
        name,
      });

      // Propagate the new name to all bookings + classExceptions that reference this location.
      const bookingsSnap = await getDocs(
        query(
          collection(firestore, 'coaches', coach.id, 'bookings'),
          where('locationId', '==', editingLocation.id),
        ),
      );
      for (const d of bookingsSnap.docs) {
        batch.update(d.ref, { locationName: name });
      }
      const exceptionsSnap = await getDocs(
        query(
          collection(firestore, 'coaches', coach.id, 'classExceptions'),
          where('newLocationId', '==', editingLocation.id),
        ),
      );
      for (const d of exceptionsSnap.docs) {
        batch.update(d.ref, { newLocationName: name });
      }

      await batch.commit();
      showToast('Location renamed', 'success');
      setEditingLocation(null);
    } catch {
      showToast('Failed to rename location', 'error');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeleteLocation = async () => {
    if (!coach || !db || !deletingLocation) return;
    setDeletingBusy(true);
    try {
      const firestore = db as Firestore;
      await deleteDoc(doc(firestore, 'coaches', coach.id, 'locations', deletingLocation.id));
      showToast('Location deleted', 'success');
      setDeletingLocation(null);
    } catch {
      showToast('Failed to delete location', 'error');
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Settings</h1>
      </div>

      {/* Locations */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Locations</h2>
          <Button variant="ghost" onClick={() => setShowAddLocation(true)}>
            + Add location
          </Button>
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">
          Renames propagate to all existing bookings. Deleting a location removes it from the picker
          for new lessons — past lessons keep their location name.
        </p>
        {locations.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">No locations yet.</p>
        ) : (
          <div className="border border-gray-200 dark:border-[#333333] rounded-lg divide-y divide-gray-100 dark:divide-[#333333]">
            {locations.map((loc) => (
              <div key={loc.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-900 dark:text-zinc-100">{loc.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditLocation(loc)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingLocation(loc)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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

      {/* Add Location modal */}
      <Modal
        isOpen={showAddLocation}
        onClose={() => { setShowAddLocation(false); setNewLocationName(''); }}
        title="Add Location"
      >
        <div className="space-y-4">
          <Input
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            placeholder="e.g. Permai Garden"
            autoFocus
          />
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleAddLocation}
              loading={creatingLocation}
              disabled={!newLocationName.trim() || creatingLocation}
              className="flex-1"
            >
              Add
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setShowAddLocation(false); setNewLocationName(''); }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Location modal */}
      <Modal
        isOpen={!!editingLocation}
        onClose={() => setEditingLocation(null)}
        title="Rename Location"
      >
        {editingLocation && (
          <div className="space-y-4">
            <Input
              value={editLocationName}
              onChange={(e) => setEditLocationName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              The new name will be applied to all existing bookings at this location.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleSaveLocation}
                loading={savingLocation}
                disabled={!editLocationName.trim() || savingLocation}
                className="flex-1"
              >
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditingLocation(null)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Location modal */}
      <Modal
        isOpen={!!deletingLocation}
        onClose={() => setDeletingLocation(null)}
        title="Delete Location?"
      >
        {deletingLocation && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-zinc-300">
              Remove <span className="font-medium">{deletingLocation.name}</span> from the location
              picker.
            </p>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Past and existing lessons keep the location name displayed. You just won&apos;t be able to
              pick it for new lessons.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                variant="danger"
                onClick={handleDeleteLocation}
                loading={deletingBusy}
                disabled={deletingBusy}
                className="flex-1"
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDeletingLocation(null)}
                disabled={deletingBusy}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

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

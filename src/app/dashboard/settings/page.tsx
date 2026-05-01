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
import { useToast } from '@/components/ui/Toast';
import { useLocations } from '@/hooks/useCoachData';
import {
  Btn,
  PaperModal,
  IconPin,
  IconEdit,
  IconTrash,
  IconPlus,
} from '@/components/paper';
import type { Location } from '@/types';

// ─── Shared input styling (matches Payments & Students) ──────────────────────

const paperInputClass =
  'w-full px-3 py-2.5 rounded-[10px] border text-[13.5px] outline-none focus:border-[color:var(--accent)]';
const paperInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  borderColor: 'var(--line-2)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
  appearance: 'none',
  minWidth: 0,
};

// ─── Eyebrow label ───────────────────────────────────────────────────────────

function Eyebrow({ children, tone }: { children: React.ReactNode; tone?: 'bad' }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase"
      style={{
        color: tone === 'bad' ? 'var(--bad)' : 'var(--ink-3)',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { coach, user, refreshCoach } = useAuth();
  const { showToast } = useToast();
  const { locations } = useLocations(coach?.id);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [showEditName, setShowEditName] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [creatingLocation, setCreatingLocation] = useState(false);

  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────────

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

  const openEditName = () => {
    setEditName(coach?.displayName ?? '');
    setShowEditName(true);
  };

  const handleSaveName = async () => {
    if (!coach || !db) return;
    const name = editName.trim();
    if (!name || name === coach.displayName) {
      setShowEditName(false);
      return;
    }
    setSavingName(true);
    try {
      const firestore = db as Firestore;
      await updateDoc(doc(firestore, 'coaches', coach.id), {
        displayName: name,
        updatedAt: serverTimestamp(),
      });
      await refreshCoach();
      showToast('Name updated', 'success');
      setShowEditName(false);
    } catch {
      showToast('Failed to update name', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleReset = async () => {
    if (!coach) return;
    setResetting(true);
    try {
      const res = await fetch('/api/reset-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: coach.id }),
      });
      const data = await res.json();
      const total = Object.values(data.deleted as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      );
      showToast(`Account reset — ${total} records deleted`, 'success');
      setShowResetModal(false);
    } catch {
      showToast('Failed to reset account', 'error');
    } finally {
      setResetting(false);
    }
  };

  const locationCount = locations.length;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="px-4 sm:px-6 py-5 sm:py-7 mx-auto"
      style={{ color: 'var(--ink)', maxWidth: 680 }}
    >
      {/* Header */}
      <div className="mb-7">
        <Eyebrow>Settings</Eyebrow>
        <div
          className="text-[22px] sm:text-[28px] font-semibold leading-tight"
          style={{ letterSpacing: '-0.6px' }}
        >
          Account &amp; preferences
        </div>
        <div className="text-[13px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
          <span className="tnum" style={{ color: 'var(--ink)', fontWeight: 500 }}>
            {locationCount}
          </span>{' '}
          {locationCount === 1 ? 'location' : 'locations'}
        </div>
      </div>

      {/* ── Account ── */}
      <section className="mb-8">
        <Eyebrow>Account</Eyebrow>
        <div
          className="mt-2.5 rounded-[12px] border overflow-hidden"
          style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
        >
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div
              className="text-[12px] font-medium"
              style={{ color: 'var(--ink-3)' }}
            >
              Name
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <div
                className="text-[13.5px] font-medium truncate"
                style={{ color: 'var(--ink)' }}
              >
                {coach?.displayName ?? '—'}
              </div>
              <button
                onClick={openEditName}
                className="p-1.5 rounded-[8px] transition-colors hover:bg-[var(--line)] shrink-0"
                style={{ color: 'var(--ink-3)' }}
                aria-label="Edit name"
              >
                <IconEdit size={14} />
              </button>
            </div>
          </div>
          <div
            className="px-4 py-3 flex items-center justify-between gap-3"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            <div
              className="text-[12px] font-medium"
              style={{ color: 'var(--ink-3)' }}
            >
              Email
            </div>
            <div
              className="mono text-[13px] truncate"
              style={{ color: 'var(--ink-2)' }}
            >
              {user?.email ?? '—'}
            </div>
          </div>
        </div>
      </section>

      {/* ── Locations ── */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-2">
          <Eyebrow>Locations</Eyebrow>
          <Btn
            size="sm"
            variant="outline"
            onClick={() => setShowAddLocation(true)}
          >
            <IconPlus size={14} />
            Add
          </Btn>
        </div>
        <p className="text-[12.5px] mb-3" style={{ color: 'var(--ink-3)' }}>
          Renames propagate to all existing bookings. Deleting a location removes it
          from the picker — past lessons keep their location name.
        </p>

        {locations.length === 0 ? (
          <div
            className="rounded-[12px] border py-10 text-center"
            style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
          >
            <p
              className="text-[14px] font-semibold mb-1"
              style={{ color: 'var(--ink)' }}
            >
              No locations yet
            </p>
            <p
              className="text-[12.5px] mb-4"
              style={{ color: 'var(--ink-3)' }}
            >
              Add the places where you teach so you can assign them to bookings.
            </p>
            <Btn size="sm" variant="primary" onClick={() => setShowAddLocation(true)}>
              <IconPlus size={14} />
              Add location
            </Btn>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center gap-3 px-3.5 py-3 rounded-[12px] border"
                style={{
                  background: 'var(--panel)',
                  borderColor: 'var(--line)',
                }}
              >
                <div
                  className="shrink-0 flex items-center justify-center rounded-full"
                  style={{
                    width: 30,
                    height: 30,
                    background: 'var(--line)',
                    color: 'var(--ink-2)',
                  }}
                  aria-hidden
                >
                  <IconPin size={15} />
                </div>
                <div
                  className="flex-1 min-w-0 text-[13.5px] font-medium truncate"
                  style={{ color: 'var(--ink)' }}
                >
                  {loc.name}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditLocation(loc)}
                    className="p-2 rounded-[8px] transition-colors hover:bg-[var(--line)]"
                    style={{ color: 'var(--ink-3)' }}
                    aria-label={`Rename ${loc.name}`}
                  >
                    <IconEdit size={15} />
                  </button>
                  <button
                    onClick={() => setDeletingLocation(loc)}
                    className="p-2 rounded-[8px] transition-colors hover:bg-[var(--bad-soft)]"
                    style={{ color: 'var(--ink-3)' }}
                    aria-label={`Delete ${loc.name}`}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Danger zone ── */}
      <section
        className="mt-10 pt-7"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <Eyebrow tone="bad">Danger zone</Eyebrow>
        <div
          className="mt-2.5 rounded-[12px] border p-4 flex items-start gap-4"
          style={{
            background: 'var(--bad-soft)',
            borderColor: 'var(--bad-soft)',
          }}
        >
          <div className="flex-1 min-w-0">
            <div
              className="text-[13.5px] font-semibold"
              style={{ color: 'var(--bad)' }}
            >
              Reset account
            </div>
            <p
              className="text-[12.5px] mt-1"
              style={{ color: 'var(--ink-2)' }}
            >
              Permanently deletes all students, bookings, lessons, wallets, and
              locations. Your profile is kept. This can&apos;t be undone.
            </p>
          </div>
          <button
            onClick={() => setShowResetModal(true)}
            className="shrink-0 inline-flex items-center justify-center rounded-[8px] text-[13px] font-medium px-3 py-2 border transition-colors hover:brightness-105"
            style={{
              background: 'var(--panel)',
              color: 'var(--bad)',
              borderColor: 'var(--line-2)',
            }}
          >
            Reset…
          </button>
        </div>
      </section>

      {/* ── Edit name modal ── */}
      <PaperModal
        open={showEditName}
        onClose={() => !savingName && setShowEditName(false)}
        title="Edit name"
      >
        <div className="space-y-4">
          <div>
            <label
              className="block text-[11.5px] font-semibold uppercase mb-1.5"
              style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
            >
              Name
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. Coach Wei"
              autoFocus
              className={paperInputClass}
              style={paperInputStyle}
            />
            <p className="text-[11.5px] mt-2" style={{ color: 'var(--ink-3)' }}>
              How your name appears in the dashboard. Doesn&apos;t change your
              login email or Google account.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <Btn
              variant="ghost"
              full
              onClick={() => setShowEditName(false)}
              disabled={savingName}
            >
              Cancel
            </Btn>
            <Btn
              variant="primary"
              full
              onClick={handleSaveName}
              disabled={!editName.trim() || savingName}
            >
              {savingName ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        </div>
      </PaperModal>

      {/* ── Add location modal ── */}
      <PaperModal
        open={showAddLocation}
        onClose={() => {
          setShowAddLocation(false);
          setNewLocationName('');
        }}
        title="Add location"
      >
        <div className="space-y-4">
          <div>
            <label
              className="block text-[11.5px] font-semibold uppercase mb-1.5"
              style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
            >
              Name
            </label>
            <input
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="e.g. Permai Garden"
              autoFocus
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Btn
              variant="ghost"
              full
              onClick={() => {
                setShowAddLocation(false);
                setNewLocationName('');
              }}
            >
              Cancel
            </Btn>
            <Btn
              variant="primary"
              full
              onClick={handleAddLocation}
              disabled={!newLocationName.trim() || creatingLocation}
            >
              {creatingLocation ? 'Adding…' : 'Add'}
            </Btn>
          </div>
        </div>
      </PaperModal>

      {/* ── Rename location modal ── */}
      <PaperModal
        open={!!editingLocation}
        onClose={() => setEditingLocation(null)}
        title="Rename location"
      >
        {editingLocation && (
          <div className="space-y-4">
            <div>
              <label
                className="block text-[11.5px] font-semibold uppercase mb-1.5"
                style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
              >
                Name
              </label>
              <input
                value={editLocationName}
                onChange={(e) => setEditLocationName(e.target.value)}
                autoFocus
                className={paperInputClass}
                style={paperInputStyle}
              />
              <p className="text-[11.5px] mt-2" style={{ color: 'var(--ink-3)' }}>
                The new name will be applied to all existing bookings at this
                location.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Btn variant="ghost" full onClick={() => setEditingLocation(null)}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                full
                onClick={handleSaveLocation}
                disabled={!editLocationName.trim() || savingLocation}
              >
                {savingLocation ? 'Saving…' : 'Save'}
              </Btn>
            </div>
          </div>
        )}
      </PaperModal>

      {/* ── Delete location modal ── */}
      <PaperModal
        open={!!deletingLocation}
        onClose={() => !deletingBusy && setDeletingLocation(null)}
        title="Delete location?"
      >
        {deletingLocation && (
          <div className="space-y-4">
            <p className="text-[13.5px]" style={{ color: 'var(--ink)' }}>
              Remove{' '}
              <span className="font-semibold">{deletingLocation.name}</span> from
              the location picker.
            </p>
            <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
              Past and existing lessons keep their location name displayed. You
              just won&apos;t be able to pick it for new lessons.
            </p>
            <div className="flex gap-2 pt-1">
              <Btn
                variant="ghost"
                full
                onClick={() => setDeletingLocation(null)}
                disabled={deletingBusy}
              >
                Cancel
              </Btn>
              <button
                onClick={handleDeleteLocation}
                disabled={deletingBusy}
                className="w-full inline-flex items-center justify-center rounded-[8px] text-[13.5px] font-medium px-3.5 py-2 border transition-colors disabled:opacity-55 disabled:cursor-not-allowed hover:brightness-110"
                style={{
                  background: 'var(--bad)',
                  color: '#fff',
                  borderColor: 'transparent',
                }}
              >
                {deletingBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </PaperModal>

      {/* ── Reset confirmation modal ── */}
      <PaperModal
        open={showResetModal}
        onClose={() => !resetting && setShowResetModal(false)}
        title="Reset account?"
      >
        <div className="space-y-4">
          <p className="text-[13.5px]" style={{ color: 'var(--ink)' }}>
            This will permanently delete:
          </p>
          <ul
            className="text-[13px] space-y-1.5 pl-4 list-disc"
            style={{ color: 'var(--ink-2)' }}
          >
            <li>All students</li>
            <li>All bookings</li>
            <li>All lesson logs</li>
            <li>All wallets and transactions</li>
            <li>All locations</li>
          </ul>
          <div
            className="rounded-[10px] px-3 py-2 text-[12.5px] font-medium"
            style={{
              background: 'var(--bad-soft)',
              color: 'var(--bad)',
            }}
          >
            Your profile is kept, but everything else is gone forever.
          </div>
          <div className="flex gap-2 pt-1">
            <Btn
              variant="ghost"
              full
              onClick={() => setShowResetModal(false)}
              disabled={resetting}
            >
              Cancel
            </Btn>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="w-full inline-flex items-center justify-center rounded-[8px] text-[13.5px] font-medium px-3.5 py-2 border transition-colors disabled:opacity-55 disabled:cursor-not-allowed hover:brightness-110"
              style={{
                background: 'var(--bad)',
                color: '#fff',
                borderColor: 'transparent',
              }}
            >
              {resetting ? 'Resetting…' : 'Yes, reset everything'}
            </button>
          </div>
        </div>
      </PaperModal>
    </div>
  );
}

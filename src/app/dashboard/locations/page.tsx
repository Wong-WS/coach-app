'use client';

import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations } from '@/hooks/useCoachData';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

export default function LocationsPage() {
  const { coach } = useAuth();
  const { locations, loading } = useLocations(coach?.id);
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach || !db || !formData.name.trim()) return;
    setSaving(true);

    try {
      await addDoc(collection(db, 'coaches', coach.id, 'locations'), {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        notes: formData.notes.trim() || null,
        createdAt: serverTimestamp(),
      });

      setFormData({ name: '', address: '', notes: '' });
      setIsModalOpen(false);
      showToast('Location added!', 'success');
    } catch (error) {
      console.error('Error adding location:', error);
      showToast('Failed to add location', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (locationId: string) => {
    if (!coach || !db) return;
    setConfirmDeleteId(null);
    setDeletingId(locationId);

    try {
      await deleteDoc(doc(db, 'coaches', coach.id, 'locations', locationId));
      showToast('Location deleted', 'success');
    } catch (error) {
      console.error('Error deleting location:', error);
      showToast('Failed to delete location', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
          <p className="text-gray-600 mt-1">Manage your lesson locations</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>Add Location</Button>
      </div>

      {/* Locations list */}
      {locations.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No locations yet</h3>
          <p className="text-gray-600 mb-6">Add your first location to get started.</p>
          <Button onClick={() => setIsModalOpen(true)}>Add Location</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {locations.map((location) => (
            <div
              key={location.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{location.name}</h3>
                    {location.address && (
                      <p className="text-sm text-gray-600 mt-1">{location.address}</p>
                    )}
                    {location.notes && (
                      <p className="text-sm text-gray-500 mt-2">{location.notes}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDeleteId(location.id)}
                  loading={deletingId === location.id}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Location Confirmation Modal */}
      <Modal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete Location"
      >
        <p className="text-gray-600 mb-6">Are you sure you want to delete this location?</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            No, Keep It
          </Button>
          <Button variant="danger" onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}>
            Yes, Delete
          </Button>
        </div>
      </Modal>

      {/* Add Location Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Location"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <Input
            id="name"
            label="Location Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Sri Tiara Residences"
            required
          />
          <Input
            id="address"
            label="Address (optional)"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="Full address"
          />
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g., Pool on 7th floor, parking available"
              rows={3}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add Location
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

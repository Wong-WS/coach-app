'use client';

import { useState } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings } from '@/hooks/useCoachData';
import { Button, Input, Select, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { DayOfWeek, LessonType, Booking } from '@/types';
import { getDayDisplayName, formatTimeDisplay } from '@/lib/availability-engine';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DAY_OPTIONS = DAYS.map((day) => ({
  value: day,
  label: getDayDisplayName(day),
}));

const LESSON_TYPE_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'group', label: 'Group' },
];

const TIME_OPTIONS = Array.from({ length: 24 * 12 }, (_, i) => {
  const hours = Math.floor(i / 12);
  const minutes = (i % 12) * 5;
  const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const label = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  return { value: time, label };
});

const EMPTY_FORM = {
  locationId: '',
  dayOfWeek: 'monday' as DayOfWeek,
  startTime: '09:00',
  endTime: '10:00',
  clientName: '',
  clientPhone: '',
  lessonType: 'private' as LessonType,
  groupSize: 1,
  notes: '',
};

export default function BookingsPage() {
  const { coach } = useAuth();
  const { locations } = useLocations(coach?.id);
  const { bookings, loading } = useBookings(coach?.id);
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed');

  const calcEndTime = (start: string, durationMinutes: number) => {
    const [h, m] = start.split(':').map(Number);
    const totalMins = h * 60 + m + durationMinutes;
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  };

  const handleStartTimeChange = (start: string) => {
    const duration = coach?.lessonDurationMinutes ?? 60;
    setFormData((prev) => ({ ...prev, startTime: start, endTime: calcEndTime(start, duration) }));
  };

  const openAddModal = () => {
    const duration = coach?.lessonDurationMinutes ?? 60;
    setFormData({
      ...EMPTY_FORM,
      locationId: locations[0]?.id || '',
      endTime: calcEndTime(EMPTY_FORM.startTime, duration),
    });
    setEditingBookingId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (booking: Booking) => {
    setFormData({
      locationId: booking.locationId,
      dayOfWeek: booking.dayOfWeek,
      startTime: booking.startTime,
      endTime: booking.endTime,
      clientName: booking.clientName,
      clientPhone: booking.clientPhone || '',
      lessonType: booking.lessonType,
      groupSize: booking.groupSize || 1,
      notes: booking.notes || '',
    });
    setEditingBookingId(booking.id);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach || !db || !formData.locationId || !formData.clientName.trim()) return;
    setSaving(true);

    const location = locations.find((l) => l.id === formData.locationId);
    if (!location) {
      showToast('Please select a location', 'error');
      setSaving(false);
      return;
    }

    const payload = {
      locationId: formData.locationId,
      locationName: location.name,
      dayOfWeek: formData.dayOfWeek,
      startTime: formData.startTime,
      endTime: formData.endTime,
      clientName: formData.clientName.trim(),
      clientPhone: formData.clientPhone.trim(),
      lessonType: formData.lessonType,
      groupSize: formData.lessonType === 'group' ? formData.groupSize : 1,
      notes: formData.notes.trim(),
    };

    try {
      if (editingBookingId) {
        await updateDoc(doc(db, 'coaches', coach.id, 'bookings', editingBookingId), payload);
        showToast('Booking updated!', 'success');
      } else {
        await addDoc(collection(db, 'coaches', coach.id, 'bookings'), {
          ...payload,
          status: 'confirmed',
          createdAt: serverTimestamp(),
        });
        showToast('Booking created!', 'success');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving booking:', error);
      showToast('Failed to save booking', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (bookingId: string) => {
    if (!coach || !db) return;
    setConfirmCancelId(null);
    setCancellingId(bookingId);

    try {
      await updateDoc(doc(db, 'coaches', coach.id, 'bookings', bookingId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
      });
      showToast('Booking cancelled', 'success');
    } catch (error) {
      console.error('Error cancelling booking:', error);
      showToast('Failed to cancel booking', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  // Group bookings by day
  const bookingsByDay = DAYS.reduce((acc, day) => {
    acc[day] = confirmedBookings
      .filter((b) => b.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    return acc;
  }, {} as Record<DayOfWeek, Booking[]>);

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Bookings</h1>
          <p className="text-gray-600 dark:text-zinc-400 mt-1">Manage your recurring weekly bookings</p>
        </div>
        <Button onClick={openAddModal} disabled={locations.length === 0}>
          Add Booking
        </Button>
      </div>

      {locations.length === 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-xl p-6">
          <p className="text-yellow-800 dark:text-yellow-300">
            Add a location first before creating bookings.
          </p>
        </div>
      )}

      {/* Weekly schedule view */}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
        <div className="p-6 border-b border-gray-100 dark:border-[#333333]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Weekly Schedule</h2>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            {DAYS.map((day) => (
              <div key={day} className="border-b border-gray-100 dark:border-[#333333] pb-4 last:border-0 last:pb-0">
                <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
                  {getDayDisplayName(day)}
                </h3>
                {bookingsByDay[day].length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-zinc-500">No bookings</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {bookingsByDay[day].map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-start justify-between p-4 bg-gray-50 dark:bg-[#1a1a1a]/50 rounded-lg"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-zinc-100">
                              {formatTimeDisplay(booking.startTime)} - {formatTimeDisplay(booking.endTime)}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              booking.lessonType === 'group'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}>
                              {booking.lessonType === 'group' ? `Group (${booking.groupSize})` : 'Private'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">{booking.clientName}</p>
                          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{booking.locationName}</p>
                        </div>
                        <div className="flex flex-col gap-1 ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(booking)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmCancelId(booking.id)}
                            loading={cancellingId === booking.id}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cancel Booking Confirmation Modal */}
      <Modal
        isOpen={confirmCancelId !== null}
        onClose={() => setConfirmCancelId(null)}
        title="Cancel Booking"
      >
        <p className="text-gray-600 dark:text-zinc-400 mb-6">Are you sure you want to cancel this booking?</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmCancelId(null)}>
            No, Keep It
          </Button>
          <Button variant="danger" onClick={() => confirmCancelId && handleCancel(confirmCancelId)}>
            Yes, Cancel Booking
          </Button>
        </div>
      </Modal>

      {/* Add / Edit Booking Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBookingId ? 'Edit Booking' : 'Add Booking'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            id="locationId"
            label="Location"
            value={formData.locationId}
            onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
            options={[
              { value: '', label: 'Select a location' },
              ...locations.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />

          <Select
            id="dayOfWeek"
            label="Day"
            value={formData.dayOfWeek}
            onChange={(e) => setFormData({ ...formData, dayOfWeek: e.target.value as DayOfWeek })}
            options={DAY_OPTIONS}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="startTime"
              label="Start Time"
              value={formData.startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              options={TIME_OPTIONS}
            />
            <Select
              id="endTime"
              label="End Time"
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              options={TIME_OPTIONS}
            />
          </div>

          <Input
            id="clientName"
            label="Client Name"
            value={formData.clientName}
            onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
            placeholder="Client's name"
            required
          />

          <Input
            id="clientPhone"
            label="Client Phone"
            value={formData.clientPhone}
            onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
            placeholder="+60123456789"
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="lessonType"
              label="Lesson Type"
              value={formData.lessonType}
              onChange={(e) => setFormData({ ...formData, lessonType: e.target.value as LessonType })}
              options={LESSON_TYPE_OPTIONS}
            />
            {formData.lessonType === 'group' && (
              <Input
                id="groupSize"
                type="number"
                label="Group Size"
                value={formData.groupSize.toString()}
                onChange={(e) => setFormData({ ...formData, groupSize: parseInt(e.target.value) || 1 })}
                min={2}
              />
            )}
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingBookingId ? 'Save Changes' : 'Create Booking'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

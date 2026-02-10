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

export default function BookingsPage() {
  const { coach } = useAuth();
  const { locations } = useLocations(coach?.id);
  const { bookings, loading } = useBookings(coach?.id);
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    locationId: '',
    dayOfWeek: 'monday' as DayOfWeek,
    startTime: '09:00',
    clientName: '',
    clientPhone: '',
    lessonType: 'private' as LessonType,
    groupSize: 1,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed');
  const cancelledBookings = bookings.filter((b) => b.status === 'cancelled');

  // Calculate end time based on coach's lesson duration
  const calculateEndTime = (startTime: string): string => {
    const duration = coach?.lessonDurationMinutes || 60;
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMins = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach || !db || !formData.locationId || !formData.clientName.trim()) return;
    setSaving(true);

    const location = locations.find((l) => l.id === formData.locationId);
    if (!location) {
      showToast('Please select a location', 'error');
      setSaving(false);
      return;
    }

    try {
      await addDoc(collection(db, 'coaches', coach.id, 'bookings'), {
        locationId: formData.locationId,
        locationName: location.name,
        dayOfWeek: formData.dayOfWeek,
        startTime: formData.startTime,
        endTime: calculateEndTime(formData.startTime),
        status: 'confirmed',
        clientName: formData.clientName.trim(),
        clientPhone: formData.clientPhone.trim(),
        lessonType: formData.lessonType,
        groupSize: formData.lessonType === 'group' ? formData.groupSize : 1,
        notes: formData.notes.trim(),
        createdAt: serverTimestamp(),
      });

      setFormData({
        locationId: locations[0]?.id || '',
        dayOfWeek: 'monday',
        startTime: '09:00',
        clientName: '',
        clientPhone: '',
        lessonType: 'private',
        groupSize: 1,
        notes: '',
      });
      setIsModalOpen(false);
      showToast('Booking created!', 'success');
    } catch (error) {
      console.error('Error creating booking:', error);
      showToast('Failed to create booking', 'error');
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

  const openAddModal = () => {
    setFormData((prev) => ({
      ...prev,
      locationId: locations[0]?.id || '',
    }));
    setIsModalOpen(true);
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
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-gray-600 mt-1">Manage your recurring weekly bookings</p>
        </div>
        <Button onClick={openAddModal} disabled={locations.length === 0}>
          Add Booking
        </Button>
      </div>

      {locations.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <p className="text-yellow-800">
            Add a location first before creating bookings.
          </p>
        </div>
      )}

      {/* Weekly schedule view */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Weekly Schedule</h2>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            {DAYS.map((day) => (
              <div key={day} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  {getDayDisplayName(day)}
                </h3>
                {bookingsByDay[day].length === 0 ? (
                  <p className="text-sm text-gray-400">No bookings</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {bookingsByDay[day].map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-start justify-between p-4 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {formatTimeDisplay(booking.startTime)} - {formatTimeDisplay(booking.endTime)}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              booking.lessonType === 'group'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {booking.lessonType === 'group' ? `Group (${booking.groupSize})` : 'Private'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{booking.clientName}</p>
                          <p className="text-xs text-gray-400 mt-1">{booking.locationName}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmCancelId(booking.id)}
                          loading={cancellingId === booking.id}
                        >
                          Cancel
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cancelled bookings */}
      {cancelledBookings.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Cancelled Bookings</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {cancelledBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg opacity-60">
                  <div>
                    <span className="text-sm text-gray-600">
                      {getDayDisplayName(booking.dayOfWeek)} {formatTimeDisplay(booking.startTime)}
                    </span>
                    <span className="mx-2 text-gray-400">·</span>
                    <span className="text-sm text-gray-900">{booking.clientName}</span>
                    <span className="mx-2 text-gray-400">·</span>
                    <span className="text-sm text-gray-500">{booking.locationName}</span>
                  </div>
                  <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">Cancelled</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Booking Confirmation Modal */}
      <Modal
        isOpen={confirmCancelId !== null}
        onClose={() => setConfirmCancelId(null)}
        title="Cancel Booking"
      >
        <p className="text-gray-600 mb-6">Are you sure you want to cancel this booking?</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmCancelId(null)}>
            No, Keep It
          </Button>
          <Button variant="danger" onClick={() => confirmCancelId && handleCancel(confirmCancelId)}>
            Yes, Cancel Booking
          </Button>
        </div>
      </Modal>

      {/* Add Booking Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Booking"
      >
        <form onSubmit={handleAdd} className="space-y-4">
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

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="dayOfWeek"
              label="Day"
              value={formData.dayOfWeek}
              onChange={(e) => setFormData({ ...formData, dayOfWeek: e.target.value as DayOfWeek })}
              options={DAY_OPTIONS}
            />
            <Select
              id="startTime"
              label="Start Time"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
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
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create Booking
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocations, useBookings, useStudents } from '@/hooks/useCoachData';
import { Button, Input, Select, Modal, PhoneInput } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { DayOfWeek, LessonType, Booking } from '@/types';
import { getDayDisplayName, formatTimeDisplay } from '@/lib/availability-engine';
import { findOrCreateStudent } from '@/lib/students';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function getNextOccurrence(dayOfWeek: DayOfWeek): string {
  const today = new Date();
  const todayIndex = today.getDay();
  const targetIndex = DAY_INDEX[dayOfWeek];
  let daysAhead = targetIndex - todayIndex;
  if (daysAhead < 0) daysAhead += 7;
  if (daysAhead === 0) daysAhead = 0; // today counts if it's the same day
  const next = new Date(today);
  next.setDate(today.getDate() + daysAhead);
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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

interface PaymentGroup {
  names: string;
  phone: string;
  price: number;
}

const PACKAGE_OPTIONS = [
  { value: '0', label: 'No package (pay per lesson)' },
  { value: '5', label: '5 lessons' },
  { value: '10', label: '10 lessons' },
];

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
  price: 0,
  packageSize: 0,
  splitPayment: false,
  paymentGroups: [] as PaymentGroup[],
};

export default function BookingsPage() {
  const { coach } = useAuth();
  const { locations } = useLocations(coach?.id);
  const { bookings, loading } = useBookings(coach?.id);
  const { students } = useStudents(coach?.id);
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [zeroOutStudentIds, setZeroOutStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);

  const confirmedBookings = bookings.filter((b) =>
    b.status === 'confirmed' &&
    !b.endDate // Exclude one-time classes and ended/split bookings
  );

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

  const buildPaymentGroups = (price: number): PaymentGroup[] => {
    return [
      { names: '', phone: '', price: 0 },
      { names: '', phone: '', price: 0 },
    ];
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
    // Rebuild payment groups from linked data if already split
    const hasSplit = !!(booking.linkedStudentIds?.length && booking.studentPrices);
    const paymentGroups: PaymentGroup[] = [];

    if (hasSplit && booking.studentPrices) {
      // Primary student = first payment group
      const primaryStudent = students.find(
        (s) => s.clientName === booking.clientName && s.clientPhone === (booking.clientPhone || '')
      );
      const primaryId = primaryStudent?.id || '';
      paymentGroups.push({
        names: booking.clientName,
        phone: booking.clientPhone || '',
        price: booking.studentPrices[primaryId] ?? 0,
      });
      // Each linked student = additional payment group
      for (const linkedId of booking.linkedStudentIds!) {
        const ls = students.find((s) => s.id === linkedId);
        if (ls) {
          paymentGroups.push({
            names: ls.clientName,
            phone: ls.clientPhone,
            price: booking.studentPrices[linkedId] ?? 0,
          });
        }
      }
    }

    // Look up existing student to get their package size
    const existingStudent = students.find(
      (s) => s.clientName === booking.clientName && s.clientPhone === (booking.clientPhone || '')
    );
    const editPackageSize = existingStudent?.prepaidTotal ?? 0;

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
      price: booking.price ?? 0,
      packageSize: editPackageSize,
      splitPayment: hasSplit,
      paymentGroups,
    });
    setEditingBookingId(booking.id);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach || !db || !formData.locationId) return;

    const isSplit = formData.lessonType === 'group' && formData.splitPayment && formData.paymentGroups.length > 0;

    // Validate: for split payment, all groups need names
    if (isSplit) {
      const emptyNames = formData.paymentGroups.some((g) => !g.names.trim());
      if (emptyNames) {
        showToast('Please enter names for all payment groups', 'error');
        return;
      }
    } else if (!formData.clientName.trim()) {
      return;
    }

    setSaving(true);

    const location = locations.find((l) => l.id === formData.locationId);
    if (!location) {
      showToast('Please select a location', 'error');
      setSaving(false);
      return;
    }

    const firestore = db as Firestore;

    // For split payment, primary student is the first payment group
    const primaryName = isSplit ? formData.paymentGroups[0].names.trim() : formData.clientName.trim();
    const primaryPhone = isSplit ? formData.paymentGroups[0].phone.trim() : formData.clientPhone.trim();

    const payload: Record<string, unknown> = {
      locationId: formData.locationId,
      locationName: location.name,
      dayOfWeek: formData.dayOfWeek,
      startTime: formData.startTime,
      endTime: formData.endTime,
      clientName: primaryName,
      clientPhone: primaryPhone,
      lessonType: formData.lessonType,
      groupSize: formData.lessonType === 'group' ? formData.groupSize : 1,
      notes: formData.notes.trim(),
      price: formData.price,
    };

    try {
      if (editingBookingId) {
        // Update startDate when day changes so the booking shows from the next occurrence (including today)
        const originalBooking = bookings.find((b) => b.id === editingBookingId);
        if (originalBooking && originalBooking.dayOfWeek !== formData.dayOfWeek) {
          payload.startDate = getNextOccurrence(formData.dayOfWeek);
        }
        if (isSplit) {
          // Create/find all students and build linked data
          const primaryStudentId = await findOrCreateStudent(firestore, coach.id, primaryName, primaryPhone);
          const linkedStudentIds: string[] = [];
          const studentPrices: Record<string, number> = {};

          const othersTotal = formData.paymentGroups.slice(1).reduce((sum, g) => sum + g.price, 0);
          studentPrices[primaryStudentId] = formData.price - othersTotal;

          for (let i = 1; i < formData.paymentGroups.length; i++) {
            const pg = formData.paymentGroups[i];
            const studentId = await findOrCreateStudent(firestore, coach.id, pg.names.trim(), pg.phone.trim());
            await updateDoc(doc(firestore, 'coaches', coach.id, 'students', studentId), {
              linkedToStudentId: primaryStudentId,
              updatedAt: serverTimestamp(),
            });
            linkedStudentIds.push(studentId);
            studentPrices[studentId] = pg.price;
          }

          payload.linkedStudentIds = linkedStudentIds;
          payload.studentPrices = studentPrices;
        }
        await updateDoc(doc(db, 'coaches', coach.id, 'bookings', editingBookingId), payload);

        // Sync lessonRate on affected students and recalculate pendingPayment if package exhausted
        const studentPriceMap: Record<string, number> = isSplit
          ? (payload.studentPrices as Record<string, number>)
          : {};
        if (!isSplit) {
          const primaryStudentId = await findOrCreateStudent(firestore, coach.id, primaryName, primaryPhone);
          studentPriceMap[primaryStudentId] = formData.price;
        }
        for (const [studentId, newRate] of Object.entries(studentPriceMap)) {
          if (newRate > 0) {
            const student = students.find((s) => s.id === studentId);
            const updatePayload: Record<string, unknown> = { lessonRate: newRate, updatedAt: serverTimestamp() };
            if (student && student.prepaidTotal > 0 && student.prepaidUsed >= student.prepaidTotal) {
              updatePayload.pendingPayment = newRate * student.prepaidTotal;
            }
            await updateDoc(doc(firestore, 'coaches', coach.id, 'students', studentId), updatePayload);
          }
        }

        showToast('Booking updated!', 'success');
      } else {
        // Create primary student
        const primaryStudentId = await findOrCreateStudent(firestore, coach.id, primaryName, primaryPhone);

        if (isSplit) {
          // Create linked students and build price map
          const linkedStudentIds: string[] = [];
          const studentPrices: Record<string, number> = {};

          // Calculate primary group's price (total - sum of others)
          const othersTotal = formData.paymentGroups.slice(1).reduce((sum, g) => sum + g.price, 0);
          const primaryPrice = formData.price - othersTotal;
          studentPrices[primaryStudentId] = primaryPrice;

          for (let i = 1; i < formData.paymentGroups.length; i++) {
            const pg = formData.paymentGroups[i];
            const studentId = await findOrCreateStudent(firestore, coach.id, pg.names.trim(), pg.phone.trim());

            // Set linkedToStudentId on the secondary student
            await updateDoc(doc(firestore, 'coaches', coach.id, 'students', studentId), {
              linkedToStudentId: primaryStudentId,
              updatedAt: serverTimestamp(),
            });

            linkedStudentIds.push(studentId);
            studentPrices[studentId] = pg.price;
          }

          payload.linkedStudentIds = linkedStudentIds;
          payload.studentPrices = studentPrices;
        }

        await addDoc(collection(firestore, 'coaches', coach.id, 'bookings'), {
          ...payload,
          startDate: getNextOccurrence(formData.dayOfWeek),
          status: 'confirmed',
          createdAt: serverTimestamp(),
        });

        // Set prepaid package and payment info on the primary student
        if (!isSplit && formData.price > 0) {
          const studentUpdate: Record<string, unknown> = {
            lessonRate: formData.price,
            updatedAt: serverTimestamp(),
          };
          if (formData.packageSize > 0) {
            studentUpdate.prepaidTotal = formData.packageSize;
            studentUpdate.prepaidUsed = 0;
            studentUpdate.payPerLesson = false;
            studentUpdate.pendingPayment = formData.price * formData.packageSize;
          } else {
            studentUpdate.payPerLesson = true;
            studentUpdate.pendingPayment = 0;
          }
          await updateDoc(doc(firestore, 'coaches', coach.id, 'students', primaryStudentId), studentUpdate);
        }

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
      // Cancel the booking
      await updateDoc(doc(db, 'coaches', coach.id, 'bookings', bookingId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
      });

      // Zero out remaining prepaid lessons for selected students
      for (const studentId of zeroOutStudentIds) {
        const student = students.find((s) => s.id === studentId);
        if (student && student.prepaidTotal > student.prepaidUsed) {
          await updateDoc(doc(db, 'coaches', coach.id, 'students', studentId), {
            prepaidTotal: student.prepaidUsed,
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Clear pendingPayment for students with exhausted packages (it was for a renewal that won't happen)
      const booking = bookings.find((b) => b.id === bookingId);
      const primaryStudent = booking
        ? students.find((s) => s.clientName === booking.clientName && s.clientPhone === booking.clientPhone)
        : null;
      const allStudentIds = [
        ...(primaryStudent ? [primaryStudent.id] : []),
        ...(booking?.linkedStudentIds || []),
      ];
      for (const studentId of allStudentIds) {
        const student = students.find((s) => s.id === studentId);
        if (student && student.prepaidTotal > 0 && student.prepaidUsed >= student.prepaidTotal && (student.pendingPayment ?? 0) > 0) {
          await updateDoc(doc(db, 'coaches', coach.id, 'students', studentId), {
            pendingPayment: 0,
            updatedAt: serverTimestamp(),
          });
        }
      }

      showToast('Booking cancelled', 'success');
    } catch (error) {
      console.error('Error cancelling booking:', error);
      showToast('Failed to cancel booking', 'error');
    } finally {
      setCancellingId(null);
      setZeroOutStudentIds(new Set());
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
                        className="flex items-start justify-between p-4 bg-gray-50 dark:bg-[#1a1a1a]/50 rounded-lg h-full"
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
                          <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">
                            {booking.linkedStudentIds?.length
                              ? (() => {
                                  const names = [booking.clientName, ...booking.linkedStudentIds.map((id) => students.find((s) => s.id === id)?.clientName).filter(Boolean) as string[]];
                                  return names.length <= 2
                                    ? names.join(' and ')
                                    : names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
                                })()
                              : booking.clientName}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{booking.locationName}</p>
                          {booking.price != null && (
                            <p className={`text-xs font-medium mt-1 ${booking.price > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                              {booking.price > 0 ? `RM ${booking.price}` : 'Free'}
                            </p>
                          )}
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
        onClose={() => { setConfirmCancelId(null); setZeroOutStudentIds(new Set()); }}
        title="Cancel Booking"
      >
        <p className="text-gray-600 dark:text-zinc-400 mb-4">Are you sure you want to cancel this booking?</p>
        {(() => {
          const booking = bookings.find((b) => b.id === confirmCancelId);
          if (!booking) return null;
          // Find primary student by name+phone match
          const primaryStudent = students.find(
            (s) => s.clientName === booking.clientName && s.clientPhone === booking.clientPhone
          );
          // Gather all linked student IDs
          const allStudentIds = [
            ...(primaryStudent ? [primaryStudent.id] : []),
            ...(booking.linkedStudentIds || []),
          ];
          // Filter to students with remaining prepaid lessons
          const studentsWithRemaining = allStudentIds
            .map((id) => students.find((s) => s.id === id))
            .filter((s): s is typeof s & { prepaidTotal: number; prepaidUsed: number } =>
              s != null && s.prepaidTotal > s.prepaidUsed
            );
          if (studentsWithRemaining.length === 0) return null;
          return (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                Zero out remaining prepaid lessons?
              </p>
              {studentsWithRemaining.map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={zeroOutStudentIds.has(s.id)}
                    onChange={(e) => {
                      const next = new Set(zeroOutStudentIds);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      setZeroOutStudentIds(next);
                    }}
                    className="rounded border-gray-300 dark:border-zinc-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-zinc-300">
                    {s.clientName} — {s.prepaidTotal - s.prepaidUsed} lesson{s.prepaidTotal - s.prepaidUsed !== 1 ? 's' : ''} remaining
                  </span>
                </label>
              ))}
            </div>
          );
        })()}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => { setConfirmCancelId(null); setZeroOutStudentIds(new Set()); }}>
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

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="lessonType"
              label="Lesson Type"
              value={formData.lessonType}
              onChange={(e) => {
                const lt = e.target.value as LessonType;
                setFormData({
                  ...formData,
                  lessonType: lt,
                  groupSize: lt === 'private' ? 1 : Math.max(2, formData.groupSize),
                  splitPayment: false,
                  paymentGroups: [],
                });
              }}
              options={LESSON_TYPE_OPTIONS}
            />
            {formData.lessonType === 'group' && (
              <Input
                id="groupSize"
                type="number"
                label="Group Size"
                value={formData.groupSize.toString()}
                onChange={(e) => {
                  const size = parseInt(e.target.value) || 2;
                  setFormData({ ...formData, groupSize: size });
                }}
                min={2}
              />
            )}
          </div>

          {!formData.splitPayment && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                  Student
                </label>
                <div className="relative">
                  <input
                    value={showStudentDropdown ? studentSearch : formData.clientName}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      setShowStudentDropdown(true);
                      setFormData({ ...formData, clientName: e.target.value, clientPhone: '' });
                    }}
                    onFocus={() => {
                      setStudentSearch(formData.clientName);
                      setShowStudentDropdown(true);
                    }}
                    placeholder="Search or type student name..."
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-sm"
                  />
                  {showStudentDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowStudentDropdown(false)} />
                      <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-gray-200 dark:border-[#444] max-h-48 overflow-y-auto">
                        {students
                          .filter((s) => {
                            if (!studentSearch.trim()) return true;
                            const q = studentSearch.toLowerCase();
                            return s.clientName.toLowerCase().includes(q) || s.clientPhone.toLowerCase().includes(q);
                          })
                          .map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                // Find existing booking for this student to auto-fill everything
                                const studentBooking = bookings.find((b) =>
                                  b.status === 'confirmed' && !b.endDate && (
                                    b.studentPrices?.[s.id] != null ||
                                    (b.clientName === s.clientName && b.clientPhone === s.clientPhone)
                                  )
                                );
                                let autoPrice = s.lessonRate ?? 0;
                                if (!autoPrice && studentBooking) {
                                  autoPrice = studentBooking.studentPrices?.[s.id] ?? studentBooking.price ?? 0;
                                }
                                // Auto-fill package: use student's current prepaidTotal if they have one
                                const autoPackage = s.prepaidTotal > 0 ? s.prepaidTotal : (s.payPerLesson ? 0 : 0);
                                setFormData({
                                  ...formData,
                                  clientName: s.clientName,
                                  clientPhone: s.clientPhone,
                                  price: autoPrice || formData.price,
                                  packageSize: autoPackage,
                                  dayOfWeek: studentBooking?.dayOfWeek ?? formData.dayOfWeek,
                                  startTime: studentBooking?.startTime ?? formData.startTime,
                                  endTime: studentBooking?.endTime ?? formData.endTime,
                                  locationId: studentBooking?.locationId ?? formData.locationId,
                                });
                                setShowStudentDropdown(false);
                                setStudentSearch('');
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[#333] text-gray-900 dark:text-zinc-100"
                            >
                              <span>{s.clientName}</span>
                              {s.clientPhone && (
                                <span className="ml-2 text-xs text-gray-400 dark:text-zinc-500">{s.clientPhone}</span>
                              )}
                            </button>
                          ))}
                        {studentSearch.trim() && !students.some((s) => s.clientName.toLowerCase() === studentSearch.toLowerCase()) && (
                          <div className="px-3 py-2 text-xs text-gray-400 dark:text-zinc-500 border-t border-gray-100 dark:border-[#444]">
                            New student: &quot;{studentSearch.trim()}&quot;
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <PhoneInput
                id="clientPhone"
                label="Client Phone"
                value={formData.clientPhone}
                onChange={(val) => setFormData({ ...formData, clientPhone: val })}
              />
            </>
          )}

          <Input
            id="price"
            type="number"
            label="Price per session (RM)"
            value={formData.price.toString()}
            onChange={(e) => {
              const newPrice = parseFloat(e.target.value) || 0;
              setFormData({ ...formData, price: newPrice });
            }}
            min={0}
            step={0.01}
            placeholder="0"
          />

          {!formData.splitPayment && (
            <div>
              <Select
                id="packageSize"
                label="Prepaid Package"
                value={formData.packageSize.toString()}
                onChange={(e) => setFormData({ ...formData, packageSize: parseInt(e.target.value) || 0 })}
                options={PACKAGE_OPTIONS}
              />
              {formData.packageSize > 0 && formData.price > 0 && (
                <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">
                  {formData.packageSize} lessons × RM {formData.price} = <span className="font-medium text-green-600 dark:text-green-400">RM {formData.packageSize * formData.price} due</span>
                </p>
              )}
            </div>
          )}

          {formData.lessonType === 'group' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.splitPayment}
                  onChange={(e) => {
                    const split = e.target.checked;
                    setFormData({
                      ...formData,
                      splitPayment: split,
                      paymentGroups: split
                        ? buildPaymentGroups(formData.price)
                        : [],
                    });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Split payment between students
                </span>
              </label>
            </div>
          )}

          {formData.splitPayment && formData.paymentGroups.length > 0 ? (
            <div className="space-y-3">
              {formData.paymentGroups.map((pg, idx) => {
                const othersTotal = formData.paymentGroups.slice(1).reduce((sum, g) => sum + g.price, 0);
                const autoPrice = idx === 0 ? formData.price - othersTotal : pg.price;

                return (
                  <div key={idx} className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                        Payment Group {idx + 1}
                      </p>
                      <div className="flex items-center gap-2">
                        {idx === 0 && (
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                            RM {autoPrice}
                          </span>
                        )}
                        {idx >= 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = formData.paymentGroups.filter((_, i) => i !== idx);
                              setFormData({ ...formData, paymentGroups: updated });
                            }}
                            className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={pg.names}
                      onChange={(e) => {
                        const updated = [...formData.paymentGroups];
                        updated[idx] = { ...updated[idx], names: e.target.value };
                        setFormData({ ...formData, paymentGroups: updated });
                      }}
                      placeholder="Names (e.g. Natsuki and Shogo)"
                      className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-sm"
                    />
                    <PhoneInput
                      value={pg.phone}
                      onChange={(val) => {
                        const updated = [...formData.paymentGroups];
                        updated[idx] = { ...updated[idx], phone: val };
                        setFormData({ ...formData, paymentGroups: updated });
                      }}
                    />
                    {idx > 0 && (
                      <input
                        type="number"
                        value={pg.price}
                        onChange={(e) => {
                          const updated = [...formData.paymentGroups];
                          updated[idx] = { ...updated[idx], price: parseFloat(e.target.value) || 0 };
                          setFormData({ ...formData, paymentGroups: updated });
                        }}
                        placeholder="Price (RM)"
                        min={0}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100 text-sm"
                      />
                    )}
                  </div>
                );
              })}
              {formData.paymentGroups.length < formData.groupSize && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      paymentGroups: [...formData.paymentGroups, { names: '', phone: '', price: 0 }],
                    });
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + Add Payment Group
                </button>
              )}
              {(() => {
                const othersTotal = formData.paymentGroups.slice(1).reduce((sum, g) => sum + g.price, 0);
                const primaryPrice = formData.price - othersTotal;
                if (primaryPrice < 0) {
                  return (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Group prices exceed the total (RM {formData.price}). Reduce by RM {Math.abs(primaryPrice)}.
                    </p>
                  );
                }
                return null;
              })()}
            </div>
          ) : null}

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

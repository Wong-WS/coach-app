'use client';

import { useState, useEffect, use } from 'react';
import { Coach, Location, DayOfWeek, PreferredTime } from '@/types';
import { getDayDisplayName, formatTimeDisplay, DayAvailability } from '@/lib/availability-engine';
import { Button } from '@/components/ui/Button';
import { Modal, Input, Select, PhoneInput } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function PublicCoachPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [afterSchool, setAfterSchool] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [waitlistSaving, setWaitlistSaving] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({
    locationId: '',
    dayOfWeek: 'monday' as DayOfWeek,
    preferredTime: 'any' as PreferredTime,
    clientName: '',
    clientPhone: '',
    notes: '',
  });
  const { showToast } = useToast();

  // Effect 1: Fetch coach profile + locations from API
  useEffect(() => {
    const fetchCoachAndLocations = async () => {
      try {
        const res = await fetch(`/api/coach/${slug}`);
        if (!res.ok) {
          setError('Coach not found');
          setLoading(false);
          return;
        }

        const data = await res.json();
        setCoach({
          id: data.coachId,
          displayName: data.coach.displayName,
          slug: data.coach.slug,
          email: '',
          serviceType: data.coach.serviceType,
          lessonDurationMinutes: data.coach.lessonDurationMinutes,
          travelBufferMinutes: data.coach.travelBufferMinutes,
          whatsappNumber: data.coach.whatsappNumber,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const locs: Location[] = data.locations.map((loc: { id: string; name: string; address: string; notes: string }) => ({
          id: loc.id,
          name: loc.name,
          address: loc.address,
          notes: loc.notes,
          createdAt: new Date(),
        }));
        setLocations(locs);
        if (locs.length > 0) {
          setSelectedLocation(locs[0].id);
        }

        setCoachId(data.coachId);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching coach data:', err);
        setError('Failed to load coach information');
        setLoading(false);
      }
    };

    fetchCoachAndLocations();
  }, [slug]);

  // Effect 2: Fetch availability from API
  useEffect(() => {
    if (!coachId || !selectedLocation) return;

    const fetchAvailability = async () => {
      try {
        const res = await fetch(`/api/availability/${coachId}?locationId=${selectedLocation}`);
        if (res.ok) {
          const data = await res.json();
          setAvailability(data.availability);
        }
      } catch (err) {
        console.error('Error fetching availability:', err);
      }
    };

    fetchAvailability();
  }, [coachId, selectedLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#262626]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !coach) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#262626] px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Coach Not Found</h1>
          <p className="text-gray-600 dark:text-zinc-400 mb-6">The coach you&apos;re looking for doesn&apos;t exist.</p>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const openWaitlistModal = () => {
    setWaitlistForm((prev) => ({
      ...prev,
      locationId: selectedLocation || locations[0]?.id || '',
    }));
    setIsWaitlistModalOpen(true);
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach || !waitlistForm.clientName.trim() || !waitlistForm.clientPhone.trim()) return;
    setWaitlistSaving(true);

    const location = locations.find((l) => l.id === waitlistForm.locationId);
    if (!location) {
      showToast('Please select a location', 'error');
      setWaitlistSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: coach.id,
          locationId: waitlistForm.locationId,
          locationName: location.name,
          dayOfWeek: waitlistForm.dayOfWeek,
          preferredTime: waitlistForm.preferredTime,
          clientName: waitlistForm.clientName.trim(),
          clientPhone: waitlistForm.clientPhone.trim(),
          notes: waitlistForm.notes.trim(),
        }),
      });

      if (!res.ok) throw new Error('Failed to join waitlist');

      setWaitlistForm({
        locationId: '',
        dayOfWeek: 'monday',
        preferredTime: 'any',
        clientName: '',
        clientPhone: '',
        notes: '',
      });
      setIsWaitlistModalOpen(false);
      showToast('You\'ve been added to the waitlist!', 'success');
    } catch (err) {
      console.error('Error joining waitlist:', err);
      showToast('Failed to join waitlist. Please try again.', 'error');
    } finally {
      setWaitlistSaving(false);
    }
  };

  const handleWhatsAppClick = () => {
    const phone = coach.whatsappNumber.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      `Hi ${coach.displayName}, I'm interested in booking a lesson with you!`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#262626]">
      {/* Header */}
      <header className="bg-white dark:bg-[#1f1f1f] border-b border-gray-200 dark:border-[#333333]">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{coach.displayName}</h1>
              <p className="text-gray-600 dark:text-zinc-400 mt-1">{coach.serviceType}</p>
            </div>
            <Button onClick={handleWhatsAppClick} className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Contact via WhatsApp
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {locations.length === 0 ? (
          <div className="bg-white dark:bg-[#1f1f1f] rounded-xl p-8 text-center">
            <p className="text-gray-600 dark:text-zinc-400">No locations available yet.</p>
          </div>
        ) : (
          <>
            {/* Location picker */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-4">Select Location</h2>
              <div className="flex flex-wrap gap-2">
                {locations.map((location) => (
                  <button
                    key={location.id}
                    onClick={() => setSelectedLocation(location.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedLocation === location.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-[#1f1f1f] text-gray-700 dark:text-zinc-300 border border-gray-200 dark:border-[#333333] hover:bg-gray-50 dark:hover:bg-[#303030]'
                    }`}
                  >
                    {location.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Availability grid */}
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl shadow-sm border border-gray-100 dark:border-[#333333]">
              <div className="p-6 border-b border-gray-100 dark:border-[#333333]">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Available Slots</h2>
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">
                      {coach.lessonDurationMinutes} minute lessons
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAfterSchool(false)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        !afterSchool ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1a1a1a] text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-500'
                      }`}
                    >
                      All times
                    </button>
                    <button
                      onClick={() => setAfterSchool(true)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        afterSchool ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1a1a1a] text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-500'
                      }`}
                    >
                      After 3 PM
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {DAYS.map((day) => {
                    const dayAvailability = availability.find((a) => a.dayOfWeek === day);
                    const allSlots = dayAvailability?.slots || [];
                    const slots = afterSchool ? allSlots.filter((s) => s.startTime >= '15:00') : allSlots;

                    return (
                      <div key={day} className="border-b border-gray-100 dark:border-[#333333] pb-4 last:border-0 last:pb-0">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">
                          {getDayDisplayName(day)}
                        </h3>
                        {slots.length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-zinc-500">No available slots</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {slots.map((slot, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm"
                              >
                                {formatTimeDisplay(slot.startTime)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Waitlist CTA */}
            <div className="mt-8 bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 text-center">
              <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-300 mb-2">
                Don&apos;t see a slot that fits you?
              </h3>
              <p className="text-purple-700 dark:text-purple-400 mb-4">
                Join the waitlist and get notified when a slot opens up!
              </p>
              <Button
                onClick={openWaitlistModal}
                className="mx-auto !bg-purple-600 hover:!bg-purple-700 !focus:ring-purple-500"
              >
                Join Waitlist
              </Button>
            </div>

            {/* Contact CTA */}
            <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 text-center">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Ready to book?
              </h3>
              <p className="text-blue-700 dark:text-blue-400 mb-4">
                Contact me via WhatsApp to confirm your lesson time.
              </p>
              <Button onClick={handleWhatsAppClick} className="flex items-center gap-2 mx-auto">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Contact {coach.displayName}
              </Button>
            </div>
          </>
        )}
      </main>

      {/* Waitlist Modal */}
      <Modal
        isOpen={isWaitlistModalOpen}
        onClose={() => setIsWaitlistModalOpen(false)}
        title="Join the Waitlist"
      >
        <form onSubmit={handleWaitlistSubmit} className="space-y-4">
          <Select
            id="wl-location"
            label="Location"
            value={waitlistForm.locationId}
            onChange={(e) => setWaitlistForm({ ...waitlistForm, locationId: e.target.value })}
            options={[
              { value: '', label: 'Select a location' },
              ...locations.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="wl-day"
              label="Day"
              value={waitlistForm.dayOfWeek}
              onChange={(e) => setWaitlistForm({ ...waitlistForm, dayOfWeek: e.target.value as DayOfWeek })}
              options={DAYS.map((day) => ({
                value: day,
                label: getDayDisplayName(day),
              }))}
            />
            <Select
              id="wl-time"
              label="Preferred Time"
              value={waitlistForm.preferredTime}
              onChange={(e) => setWaitlistForm({ ...waitlistForm, preferredTime: e.target.value as PreferredTime })}
              options={[
                { value: 'any', label: 'Any time' },
                { value: 'morning', label: 'Morning' },
                { value: 'afternoon', label: 'Afternoon' },
                { value: 'evening', label: 'Evening' },
              ]}
            />
          </div>

          <Input
            id="wl-name"
            label="Your Name"
            value={waitlistForm.clientName}
            onChange={(e) => setWaitlistForm({ ...waitlistForm, clientName: e.target.value })}
            placeholder="Your name"
            required
          />

          <PhoneInput
            id="wl-phone"
            label="WhatsApp Number"
            value={waitlistForm.clientPhone}
            onChange={(val) => setWaitlistForm({ ...waitlistForm, clientPhone: val })}
            required
          />

          <div>
            <label htmlFor="wl-notes" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              id="wl-notes"
              value={waitlistForm.notes}
              onChange={(e) => setWaitlistForm({ ...waitlistForm, notes: e.target.value })}
              placeholder="Any preferences or details..."
              rows={2}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsWaitlistModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={waitlistSaving}
              className="!bg-purple-600 hover:!bg-purple-700"
            >
              Join Waitlist
            </Button>
          </div>
        </form>
      </Modal>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 dark:border-[#333333] bg-white dark:bg-[#1f1f1f]">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-sm text-gray-500 dark:text-zinc-500">
          Powered by <Link href="/" className="text-blue-600 hover:underline">CoachApp</Link>
        </div>
      </footer>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Location, DayOfWeek, PreferredTime } from '@/types';
import { getDayDisplayName, formatTimeDisplay, DayAvailability } from '@/lib/availability-engine';
import { Modal, Input, Select, PhoneInput } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const SHORT_DAY: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

interface CoachData {
  id: string;
  displayName: string;
  serviceType: string;
  whatsappNumber: string;
  lessonDurationMinutes: number;
}

interface PublicCoachClientProps {
  coach: CoachData;
  locations: Location[];
  initialAvailability: DayAvailability[];
  initialLocationId: string;
}

export default function PublicCoachClient({ coach, locations, initialAvailability, initialLocationId }: PublicCoachClientProps) {
  const [availability, setAvailability] = useState<DayAvailability[]>(initialAvailability);
  const [selectedLocation, setSelectedLocation] = useState<string>(initialLocationId);
  const [afterSchool, setAfterSchool] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [waitlistSaving, setWaitlistSaving] = useState(false);
  const [slotsKey, setSlotsKey] = useState(0);
  const [waitlistForm, setWaitlistForm] = useState({
    locationId: '',
    dayOfWeek: 'monday' as DayOfWeek,
    preferredTime: 'any' as PreferredTime,
    clientName: '',
    clientPhone: '',
    notes: '',
  });
  const { showToast } = useToast();

  useEffect(() => {
    setSlotsKey((k) => k + 1);
  }, [availability, afterSchool]);

  const handleLocationChange = async (locationId: string) => {
    setSelectedLocation(locationId);
    try {
      const res = await fetch(`/api/availability/${coach.id}?locationId=${locationId}`);
      if (res.ok) {
        const data = await res.json();
        setAvailability(data.availability);
      }
    } catch (err) {
      console.error('Error fetching availability:', err);
    }
  };

  const openWaitlistModal = () => {
    setWaitlistForm((prev) => ({
      ...prev,
      locationId: selectedLocation || locations[0]?.id || '',
    }));
    setIsWaitlistModalOpen(true);
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistForm.clientName.trim() || !waitlistForm.clientPhone.trim()) return;
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
    <div className="public-coach-page min-h-screen" style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif' }}>
      <style jsx global>{`
        .public-coach-page {
          --pc-bg: #ffffff;
          --pc-bg-alt: #f7f7f7;
          --pc-surface: #ffffff;
          --pc-text: #111111;
          --pc-text-secondary: #555555;
          --pc-text-muted: #999999;
          --pc-accent: #9b7af5;
          --pc-accent-pale: #f0ebfe;
          --pc-border: #eeeeee;
          --pc-cta-bg: #111111;
          --pc-cta-text: #ffffff;
        }

        :where(.dark) .public-coach-page {
          --pc-bg: #0f0f0f;
          --pc-bg-alt: #1a1a1a;
          --pc-surface: #161616;
          --pc-text: #f0f0f0;
          --pc-text-secondary: #aaaaaa;
          --pc-text-muted: #666666;
          --pc-accent: #b49af7;
          --pc-accent-pale: #1e1833;
          --pc-border: #252525;
          --pc-cta-bg: #f0f0f0;
          --pc-cta-text: #111111;
        }

        @keyframes slot-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes hero-fade-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .slot-pill {
          animation: slot-fade-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }

        .hero-animate > * {
          animation: hero-fade-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }
        .hero-animate > *:nth-child(1) { animation-delay: 0.05s; }
        .hero-animate > *:nth-child(2) { animation-delay: 0.12s; }
        .hero-animate > *:nth-child(3) { animation-delay: 0.2s; }
        .hero-animate > *:nth-child(4) { animation-delay: 0.28s; }
      `}</style>

      <div className="fixed inset-0 -z-10" style={{ backgroundColor: 'var(--pc-bg)' }} />

      {/* Hero — clean white, Fresha-style */}
      <header className="hero-animate" style={{ borderBottom: '1px solid var(--pc-border)' }}>
        <div className="max-w-2xl mx-auto px-6 pt-16 pb-12 text-center">
          {/* Coach name */}
          <h1
            className="text-4xl sm:text-[3.25rem] sm:leading-tight font-bold tracking-tight mb-4"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              color: 'var(--pc-text)',
            }}
          >
            {coach.displayName}
          </h1>

          {/* Service type — the color pop */}
          <p
            className="text-lg sm:text-xl font-medium mb-2"
            style={{ color: 'var(--pc-accent)' }}
          >
            {coach.serviceType}
          </p>

          {/* Lesson info */}
          <p
            className="text-sm mb-8"
            style={{ color: 'var(--pc-text-muted)' }}
          >
            {coach.lessonDurationMinutes} min lessons
          </p>

          {/* CTAs — Fresha style: solid black + outlined */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={handleWhatsAppClick}
              className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200"
              style={{
                backgroundColor: 'var(--pc-cta-bg)',
                color: 'var(--pc-cta-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Contact via WhatsApp
            </button>

            <button
              onClick={openWaitlistModal}
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--pc-text)',
                border: '1.5px solid var(--pc-border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--pc-text-muted)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--pc-border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Join Waitlist
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {locations.length === 0 ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ backgroundColor: 'var(--pc-bg-alt)' }}
          >
            <p style={{ color: 'var(--pc-text-muted)' }}>No locations available yet.</p>
          </div>
        ) : (
          <>
            {/* Controls row — location + time filter inline */}
            <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
              {/* Location picker */}
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider mb-2.5"
                  style={{ color: 'var(--pc-text-muted)', letterSpacing: '0.1em' }}
                >
                  Location
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {locations.map((location) => {
                    const isActive = selectedLocation === location.id;
                    return (
                      <button
                        key={location.id}
                        onClick={() => handleLocationChange(location.id)}
                        className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200"
                        style={{
                          backgroundColor: isActive ? 'var(--pc-text)' : 'transparent',
                          color: isActive ? 'var(--pc-bg)' : 'var(--pc-text-secondary)',
                          border: `1.5px solid ${isActive ? 'var(--pc-text)' : 'var(--pc-border)'}`,
                        }}
                      >
                        {location.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time filter */}
              <div
                className="flex rounded-full p-0.5"
                style={{ border: '1.5px solid var(--pc-border)' }}
              >
                {[
                  { label: 'All', value: false },
                  { label: 'After 3 PM', value: true },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    onClick={() => setAfterSchool(option.value)}
                    className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-200"
                    style={{
                      backgroundColor: afterSchool === option.value ? 'var(--pc-text)' : 'transparent',
                      color: afterSchool === option.value ? 'var(--pc-bg)' : 'var(--pc-text-muted)',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Availability — clean table-like layout */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: '1px solid var(--pc-border)',
              }}
            >
              {DAYS.map((day, dayIndex) => {
                const dayAvailability = availability.find((a) => a.dayOfWeek === day);
                const allSlots = dayAvailability?.slots || [];
                const slots = afterSchool ? allSlots.filter((s) => s.startTime >= '15:00') : allSlots;

                return (
                  <div
                    key={day}
                    className="px-5 py-3.5 flex items-start gap-4"
                    style={{
                      borderBottom: dayIndex < DAYS.length - 1 ? '1px solid var(--pc-border)' : 'none',
                      backgroundColor: dayIndex % 2 === 0 ? 'var(--pc-surface)' : 'var(--pc-bg-alt)',
                    }}
                  >
                    {/* Day label */}
                    <div className="w-10 shrink-0 pt-0.5">
                      <span
                        className="text-xs font-bold uppercase"
                        style={{ color: 'var(--pc-text-muted)', letterSpacing: '0.04em' }}
                      >
                        {SHORT_DAY[day]}
                      </span>
                    </div>

                    {/* Slots */}
                    <div className="flex-1 min-w-0">
                      {slots.length === 0 ? (
                        <span className="text-sm" style={{ color: 'var(--pc-text-muted)' }}>
                          &mdash;
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5" key={slotsKey}>
                          {slots.map((slot, idx) => (
                            <span
                              key={idx}
                              className="slot-pill px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150 cursor-default"
                              style={{
                                backgroundColor: 'var(--pc-accent-pale)',
                                color: 'var(--pc-accent)',
                                animationDelay: `${dayIndex * 25 + idx * 20}ms`,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--pc-accent)';
                                e.currentTarget.style.color = '#ffffff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--pc-accent-pale)';
                                e.currentTarget.style.color = 'var(--pc-accent)';
                              }}
                            >
                              {formatTimeDisplay(slot.startTime)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom CTA — waitlist nudge */}
            <div className="mt-10 text-center">
              <p className="text-sm mb-3" style={{ color: 'var(--pc-text-muted)' }}>
                Don&apos;t see a time that works?
              </p>
              <button
                onClick={openWaitlistModal}
                className="text-sm font-semibold transition-colors duration-150"
                style={{ color: 'var(--pc-accent)' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                Join the waitlist &rarr;
              </button>
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
            <button
              type="button"
              onClick={() => setIsWaitlistModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-[#1a1a1a] dark:text-zinc-100 dark:hover:bg-zinc-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={waitlistSaving}
              className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--pc-accent)' }}
            >
              {waitlistSaving ? 'Joining...' : 'Join Waitlist'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--pc-border)' }}>
        <div className="max-w-2xl mx-auto px-6 py-8 text-center">
          <p className="text-xs" style={{ color: 'var(--pc-text-muted)' }}>
            Powered by{' '}
            <Link
              href="/"
              className="font-medium hover:underline transition-colors duration-150"
              style={{ color: 'var(--pc-text-secondary)' }}
            >
              CoachApp
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

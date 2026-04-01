'use client';

import { useState, useEffect, useRef } from 'react';
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
  const heroRef = useRef<HTMLDivElement>(null);

  // Trigger slot animation on availability or filter change
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

  const totalSlots = availability.reduce((sum, day) => sum + (day.slots?.length || 0), 0);

  return (
    <div className="public-coach-page min-h-screen" style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif' }}>
      {/* Inline styles for this page's unique aesthetic */}
      <style jsx global>{`
        .public-coach-page {
          --pc-cream: #faf8f5;
          --pc-cream-dark: #f4f1ec;
          --pc-surface: #ffffff;
          --pc-green: #2d4a3e;
          --pc-green-light: #3d6b57;
          --pc-green-pale: #e8f0ec;
          --pc-amber: #c4873b;
          --pc-amber-light: #f5ead8;
          --pc-text: #1a1a1a;
          --pc-text-muted: #6b6560;
          --pc-border: #e8e4df;
          --pc-grain: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
        }

        :where(.dark) .public-coach-page {
          --pc-cream: #1a1916;
          --pc-cream-dark: #15140f;
          --pc-surface: #242220;
          --pc-green: #7fb89a;
          --pc-green-light: #9dd4b4;
          --pc-green-pale: #2d3a33;
          --pc-amber: #d4a054;
          --pc-amber-light: #3a3020;
          --pc-text: #f0ede8;
          --pc-text-muted: #9a9590;
          --pc-border: #333029;
        }

        @keyframes slot-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes hero-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .slot-pill {
          animation: slot-fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }

        .hero-animate > * {
          animation: hero-fade-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }
        .hero-animate > *:nth-child(1) { animation-delay: 0.05s; }
        .hero-animate > *:nth-child(2) { animation-delay: 0.15s; }
        .hero-animate > *:nth-child(3) { animation-delay: 0.25s; }
        .hero-animate > *:nth-child(4) { animation-delay: 0.35s; }
      `}</style>

      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundColor: 'var(--pc-cream)',
          backgroundImage: 'var(--pc-grain)',
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* Hero */}
      <header ref={heroRef} className="relative overflow-hidden">
        {/* Decorative arc */}
        <div
          className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
          style={{
            background: 'var(--pc-cream)',
            borderTopLeftRadius: '50% 100%',
            borderTopRightRadius: '50% 100%',
          }}
        />

        <div
          className="relative"
          style={{
            background: `linear-gradient(165deg, var(--pc-green) 0%, color-mix(in srgb, var(--pc-green) 80%, black) 100%)`,
          }}
        >
          {/* Grain overlay on hero */}
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage: 'var(--pc-grain)',
              backgroundRepeat: 'repeat',
              backgroundSize: '256px 256px',
            }}
          />

          <div className="max-w-2xl mx-auto px-6 pt-12 pb-20 hero-animate relative">
            {/* Service badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs tracking-wider uppercase mb-6"
              style={{
                backgroundColor: 'rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(8px)',
                letterSpacing: '0.1em',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: 'var(--pc-amber)' }}
              />
              {coach.serviceType}
            </div>

            {/* Coach name */}
            <h1
              className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-3"
              style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
            >
              {coach.displayName}
            </h1>

            {/* Meta */}
            <p
              className="text-base mb-8"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              {coach.lessonDurationMinutes} min lessons
              {totalSlots > 0 && (
                <>
                  {' '}&middot;{' '}
                  {totalSlots} slot{totalSlots !== 1 ? 's' : ''} available
                </>
              )}
            </p>

            {/* WhatsApp CTA */}
            <button
              onClick={handleWhatsAppClick}
              className="group inline-flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
              style={{
                backgroundColor: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Contact via WhatsApp
              <svg
                className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 -mt-4 pb-16 relative z-10">
        {locations.length === 0 ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{
              backgroundColor: 'var(--pc-surface)',
              border: '1px solid var(--pc-border)',
            }}
          >
            <p style={{ color: 'var(--pc-text-muted)' }}>No locations available yet.</p>
          </div>
        ) : (
          <>
            {/* Location + Filter Controls */}
            <div className="mb-8 space-y-4">
              {/* Location picker */}
              <div>
                <label
                  className="block text-xs font-medium uppercase tracking-wider mb-3"
                  style={{ color: 'var(--pc-text-muted)', letterSpacing: '0.08em' }}
                >
                  Location
                </label>
                <div className="flex flex-wrap gap-2">
                  {locations.map((location) => {
                    const isActive = selectedLocation === location.id;
                    return (
                      <button
                        key={location.id}
                        onClick={() => handleLocationChange(location.id)}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                        style={{
                          backgroundColor: isActive ? 'var(--pc-green)' : 'var(--pc-surface)',
                          color: isActive ? '#ffffff' : 'var(--pc-text)',
                          border: `1px solid ${isActive ? 'var(--pc-green)' : 'var(--pc-border)'}`,
                          boxShadow: isActive ? '0 2px 8px rgba(45,74,62,0.25)' : 'none',
                        }}
                      >
                        {location.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Availability Card */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: 'var(--pc-surface)',
                border: '1px solid var(--pc-border)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              {/* Card header */}
              <div
                className="px-6 py-5 flex items-center justify-between flex-wrap gap-3"
                style={{ borderBottom: '1px solid var(--pc-border)' }}
              >
                <div>
                  <h2
                    className="text-xl font-semibold"
                    style={{
                      fontFamily: 'var(--font-fraunces), Georgia, serif',
                      color: 'var(--pc-text)',
                    }}
                  >
                    Weekly Availability
                  </h2>
                </div>

                {/* Time filter toggle */}
                <div
                  className="flex rounded-lg p-0.5"
                  style={{
                    backgroundColor: 'var(--pc-cream-dark)',
                    border: '1px solid var(--pc-border)',
                  }}
                >
                  {[
                    { label: 'All times', value: false },
                    { label: 'After 3 PM', value: true },
                  ].map((option) => (
                    <button
                      key={String(option.value)}
                      onClick={() => setAfterSchool(option.value)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                      style={{
                        backgroundColor: afterSchool === option.value ? 'var(--pc-surface)' : 'transparent',
                        color: afterSchool === option.value ? 'var(--pc-text)' : 'var(--pc-text-muted)',
                        boxShadow: afterSchool === option.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day rows */}
              <div className="divide-y" style={{ borderColor: 'var(--pc-border)' }}>
                {DAYS.map((day, dayIndex) => {
                  const dayAvailability = availability.find((a) => a.dayOfWeek === day);
                  const allSlots = dayAvailability?.slots || [];
                  const slots = afterSchool ? allSlots.filter((s) => s.startTime >= '15:00') : allSlots;

                  return (
                    <div
                      key={day}
                      className="px-6 py-4 flex items-start gap-4"
                      style={{ borderColor: 'var(--pc-border)' }}
                    >
                      {/* Day label */}
                      <div className="w-10 shrink-0 pt-1.5">
                        <span
                          className="text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--pc-text-muted)', letterSpacing: '0.05em' }}
                        >
                          {SHORT_DAY[day]}
                        </span>
                      </div>

                      {/* Slots */}
                      <div className="flex-1 min-w-0">
                        {slots.length === 0 ? (
                          <span
                            className="text-sm italic"
                            style={{ color: 'color-mix(in srgb, var(--pc-text-muted) 60%, transparent)' }}
                          >
                            No slots
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5" key={slotsKey}>
                            {slots.map((slot, idx) => (
                              <span
                                key={idx}
                                className="slot-pill px-2.5 py-1 rounded-lg text-xs font-medium transition-colors duration-150"
                                style={{
                                  backgroundColor: 'var(--pc-green-pale)',
                                  color: 'var(--pc-green)',
                                  animationDelay: `${dayIndex * 30 + idx * 25}ms`,
                                  cursor: 'default',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--pc-green)';
                                  e.currentTarget.style.color = '#ffffff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--pc-green-pale)';
                                  e.currentTarget.style.color = 'var(--pc-green)';
                                }}
                              >
                                {formatTimeDisplay(slot.startTime)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Slot count */}
                      {slots.length > 0 && (
                        <span
                          className="text-xs tabular-nums shrink-0 pt-1.5"
                          style={{ color: 'var(--pc-text-muted)' }}
                        >
                          {slots.length}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Waitlist + Contact CTAs */}
            <div className="mt-8 grid sm:grid-cols-2 gap-4">
              {/* Waitlist */}
              <button
                onClick={openWaitlistModal}
                className="group text-left rounded-2xl p-6 transition-all duration-200"
                style={{
                  backgroundColor: 'var(--pc-amber-light)',
                  border: '1px solid color-mix(in srgb, var(--pc-amber) 20%, transparent)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(196,135,59,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--pc-amber) 15%, transparent)' }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="var(--pc-amber)" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <svg
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    fill="none"
                    stroke="var(--pc-amber)"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h3
                  className="text-base font-semibold mb-1"
                  style={{ color: 'var(--pc-text)', fontFamily: 'var(--font-fraunces), Georgia, serif' }}
                >
                  Join Waitlist
                </h3>
                <p className="text-sm" style={{ color: 'var(--pc-text-muted)' }}>
                  No slot fits? Get notified when one opens.
                </p>
              </button>

              {/* WhatsApp */}
              <button
                onClick={handleWhatsAppClick}
                className="group text-left rounded-2xl p-6 transition-all duration-200"
                style={{
                  backgroundColor: 'var(--pc-green-pale)',
                  border: '1px solid color-mix(in srgb, var(--pc-green) 15%, transparent)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(45,74,62,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--pc-green) 12%, transparent)' }}
                  >
                    <svg className="w-5 h-5" fill="var(--pc-green)" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <svg
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    fill="none"
                    stroke="var(--pc-green)"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h3
                  className="text-base font-semibold mb-1"
                  style={{ color: 'var(--pc-text)', fontFamily: 'var(--font-fraunces), Georgia, serif' }}
                >
                  Book a Lesson
                </h3>
                <p className="text-sm" style={{ color: 'var(--pc-text-muted)' }}>
                  Message {coach.displayName} on WhatsApp.
                </p>
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
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--pc-green)', }}
              onMouseEnter={(e) => { if (!waitlistSaving) e.currentTarget.style.backgroundColor = 'var(--pc-green-light)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--pc-green)'; }}
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
              className="font-medium transition-colors duration-150 hover:underline"
              style={{ color: 'var(--pc-green)' }}
            >
              CoachApp
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

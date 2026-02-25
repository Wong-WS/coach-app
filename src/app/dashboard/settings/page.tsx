'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useWorkingHours } from '@/hooks/useCoachData';
import { Button, Input, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { DayOfWeek } from '@/types';
import { getDayDisplayName } from '@/lib/availability-engine';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DURATION_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
  { value: '90', label: '90 minutes' },
];

const BUFFER_OPTIONS = [
  { value: '0', label: 'No buffer' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
];

const TIME_OPTIONS = Array.from({ length: 24 * 2 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = (i % 2) * 30;
  const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const label = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  return { value: time, label };
});

type DaySchedule = {
  enabled: boolean;
  timeRanges: { startTime: string; endTime: string }[];
};

const defaultDaySchedule = (enabled: boolean): DaySchedule => ({
  enabled,
  timeRanges: [{ startTime: '09:00', endTime: '17:00' }],
});

function t(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Returns an error message if the schedule has invalid or overlapping ranges, null if valid
function validateSchedule(schedule: Record<DayOfWeek, DaySchedule>): string | null {
  for (const day of DAYS) {
    const { enabled, timeRanges } = schedule[day];
    if (!enabled || timeRanges.length === 0) continue;

    for (let i = 0; i < timeRanges.length; i++) {
      const { startTime, endTime } = timeRanges[i];
      if (t(startTime) >= t(endTime)) {
        return `${getDayDisplayName(day)}: range ${i + 1} — start time must be before end time`;
      }
    }

    // Sort by start and check for overlaps between adjacent ranges
    const sorted = [...timeRanges].sort((a, b) => t(a.startTime) - t(b.startTime));
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t(sorted[i].endTime) > t(sorted[i + 1].startTime)) {
        return `${getDayDisplayName(day)}: time ranges overlap — ${sorted[i].startTime}–${sorted[i].endTime} conflicts with ${sorted[i + 1].startTime}–${sorted[i + 1].endTime}`;
      }
    }
  }
  return null;
}

export default function SettingsPage() {
  const { coach, refreshCoach } = useAuth();
  const { workingHours, loading: hoursLoading } = useWorkingHours(coach?.id);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [formData, setFormData] = useState({
    lessonDurationMinutes: '60',
    travelBufferMinutes: '30',
    whatsappNumber: '',
  });

  const [schedule, setSchedule] = useState<Record<DayOfWeek, DaySchedule>>({
    monday: defaultDaySchedule(true),
    tuesday: defaultDaySchedule(true),
    wednesday: defaultDaySchedule(true),
    thursday: defaultDaySchedule(true),
    friday: defaultDaySchedule(true),
    saturday: defaultDaySchedule(false),
    sunday: defaultDaySchedule(false),
  });

  // Load coach data
  useEffect(() => {
    if (coach) {
      setFormData({
        lessonDurationMinutes: coach.lessonDurationMinutes.toString(),
        travelBufferMinutes: coach.travelBufferMinutes.toString(),
        whatsappNumber: coach.whatsappNumber,
      });
    }
  }, [coach]);

  // Load working hours (skip while saving to prevent race condition)
  useEffect(() => {
    if (savingRef.current) return;
    if (workingHours.length > 0) {
      const newSchedule: Record<DayOfWeek, DaySchedule> = {
        monday: defaultDaySchedule(false),
        tuesday: defaultDaySchedule(false),
        wednesday: defaultDaySchedule(false),
        thursday: defaultDaySchedule(false),
        friday: defaultDaySchedule(false),
        saturday: defaultDaySchedule(false),
        sunday: defaultDaySchedule(false),
      };
      workingHours.forEach((wh) => {
        newSchedule[wh.day] = {
          enabled: wh.enabled,
          timeRanges: wh.timeRanges.length > 0 ? wh.timeRanges : [{ startTime: '09:00', endTime: '17:00' }],
        };
      });
      setSchedule(newSchedule);
    }
  }, [workingHours]);

  const addTimeRange = (day: DayOfWeek) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeRanges: [...prev[day].timeRanges, { startTime: '09:00', endTime: '17:00' }],
      },
    }));
  };

  const removeTimeRange = (day: DayOfWeek, index: number) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeRanges: prev[day].timeRanges.filter((_, i) => i !== index),
      },
    }));
  };

  const updateTimeRange = (day: DayOfWeek, index: number, field: 'startTime' | 'endTime', value: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeRanges: prev[day].timeRanges.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
      },
    }));
  };

  const handleSave = async () => {
    if (!coach || !db) return;

    const validationError = validateSchedule(schedule);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    const firestore = db;
    setSaving(true);
    savingRef.current = true;

    const scheduleSnapshot = { ...schedule };

    try {
      await updateDoc(doc(firestore, 'coaches', coach.id), {
        lessonDurationMinutes: parseInt(formData.lessonDurationMinutes),
        travelBufferMinutes: parseInt(formData.travelBufferMinutes),
        whatsappNumber: formData.whatsappNumber,
        updatedAt: serverTimestamp(),
      });

      await Promise.all(
        DAYS.map((day) =>
          updateDoc(doc(firestore, 'coaches', coach.id, 'workingHours', day), {
            enabled: scheduleSnapshot[day].enabled,
            timeRanges: scheduleSnapshot[day].timeRanges,
          })
        )
      );

      await refreshCoach();
      showToast('Settings saved!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Failed to save settings', 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (hoursLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Configure your lesson settings and schedule</p>
      </div>

      {/* Lesson Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Lesson Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Select
            id="lessonDuration"
            label="Lesson Duration"
            value={formData.lessonDurationMinutes}
            onChange={(e) => setFormData({ ...formData, lessonDurationMinutes: e.target.value })}
            options={DURATION_OPTIONS}
          />
          <Select
            id="travelBuffer"
            label="Travel Buffer"
            value={formData.travelBufferMinutes}
            onChange={(e) => setFormData({ ...formData, travelBufferMinutes: e.target.value })}
            options={BUFFER_OPTIONS}
          />
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Travel buffer is the time added between lessons at different locations.
        </p>
      </div>

      {/* Contact Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Contact Settings</h2>
        <Input
          id="whatsappNumber"
          label="WhatsApp Number"
          value={formData.whatsappNumber}
          onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
          placeholder="+60123456789"
        />
        <p className="text-sm text-gray-500 mt-2">
          Clients will use this number to contact you via WhatsApp.
        </p>
      </div>

      {/* Weekly Schedule */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Weekly Schedule</h2>
        <div className="space-y-4">
          {DAYS.map((day) => (
            <div key={day} className="py-3 border-b border-gray-100 last:border-0">
              <div className="flex items-start gap-4">
                {/* Checkbox + day label */}
                <label className="flex items-center gap-3 w-32 pt-2 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={schedule[day].enabled}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        [day]: { ...schedule[day], enabled: e.target.checked },
                      })
                    }
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{getDayDisplayName(day)}</span>
                </label>

                {schedule[day].enabled ? (
                  <div className="flex-1 space-y-2">
                    {(() => {
                      // Compute which range indices are invalid (start >= end or overlapping)
                      const ranges = schedule[day].timeRanges;
                      const errorIndices = new Set<number>();
                      ranges.forEach((r, i) => {
                        if (t(r.startTime) >= t(r.endTime)) errorIndices.add(i);
                      });
                      // Check overlaps: for each pair, mark both as errors
                      for (let i = 0; i < ranges.length; i++) {
                        for (let j = i + 1; j < ranges.length; j++) {
                          const a = ranges[i], b = ranges[j];
                          if (t(a.startTime) < t(b.endTime) && t(b.startTime) < t(a.endTime)) {
                            errorIndices.add(i);
                            errorIndices.add(j);
                          }
                        }
                      }
                      return ranges.map((range, idx) => {
                        const hasError = errorIndices.has(idx);
                        const borderClass = hasError
                          ? 'border-red-400 ring-1 ring-red-400'
                          : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500';
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={range.startTime}
                              onChange={(e) => updateTimeRange(day, idx, 'startTime', e.target.value)}
                              className={`text-sm border rounded-lg px-3 py-2 focus:ring-2 ${borderClass}`}
                            >
                              {TIME_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <span className="text-gray-400 text-sm">to</span>
                            <select
                              value={range.endTime}
                              onChange={(e) => updateTimeRange(day, idx, 'endTime', e.target.value)}
                              className={`text-sm border rounded-lg px-3 py-2 focus:ring-2 ${borderClass}`}
                            >
                              {TIME_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {hasError && (
                              <span className="text-red-500" title={t(range.startTime) >= t(range.endTime) ? 'Start must be before end' : 'Overlaps with another range'}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
                                </svg>
                              </span>
                            )}
                            {ranges.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTimeRange(day, idx)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Remove this time range"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        );
                      });
                    })()}
                    <button
                      type="button"
                      onClick={() => addTimeRange(day)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mt-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add time range
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 pt-2">Day off</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}

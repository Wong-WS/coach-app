'use client';

import { useState, useEffect } from 'react';
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

export default function SettingsPage() {
  const { coach, refreshCoach } = useAuth();
  const { workingHours, loading: hoursLoading } = useWorkingHours(coach?.id);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    lessonDurationMinutes: '60',
    travelBufferMinutes: '30',
    whatsappNumber: '',
  });

  const [schedule, setSchedule] = useState<Record<DayOfWeek, { enabled: boolean; startTime: string; endTime: string }>>({
    monday: { enabled: true, startTime: '09:00', endTime: '17:00' },
    tuesday: { enabled: true, startTime: '09:00', endTime: '17:00' },
    wednesday: { enabled: true, startTime: '09:00', endTime: '17:00' },
    thursday: { enabled: true, startTime: '09:00', endTime: '17:00' },
    friday: { enabled: true, startTime: '09:00', endTime: '17:00' },
    saturday: { enabled: false, startTime: '09:00', endTime: '17:00' },
    sunday: { enabled: false, startTime: '09:00', endTime: '17:00' },
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

  // Load working hours
  useEffect(() => {
    if (workingHours.length > 0) {
      const newSchedule = { ...schedule };
      workingHours.forEach((wh) => {
        newSchedule[wh.day] = {
          enabled: wh.enabled,
          startTime: wh.startTime,
          endTime: wh.endTime,
        };
      });
      setSchedule(newSchedule);
    }
  }, [workingHours]);

  const handleSave = async () => {
    if (!coach || !db) return;
    setSaving(true);

    try {
      // Update coach profile
      await updateDoc(doc(db, 'coaches', coach.id), {
        lessonDurationMinutes: parseInt(formData.lessonDurationMinutes),
        travelBufferMinutes: parseInt(formData.travelBufferMinutes),
        whatsappNumber: formData.whatsappNumber,
        updatedAt: serverTimestamp(),
      });

      // Update working hours
      for (const day of DAYS) {
        await updateDoc(doc(db, 'coaches', coach.id, 'workingHours', day), {
          enabled: schedule[day].enabled,
          startTime: schedule[day].startTime,
          endTime: schedule[day].endTime,
        });
      }

      await refreshCoach();
      showToast('Settings saved!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Failed to save settings', 'error');
    } finally {
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
            <div key={day} className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
              <label className="flex items-center gap-3 w-32">
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

              {schedule[day].enabled && (
                <div className="flex items-center gap-2 flex-1">
                  <select
                    value={schedule[day].startTime}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        [day]: { ...schedule[day], startTime: e.target.value },
                      })
                    }
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-400">to</span>
                  <select
                    value={schedule[day].endTime}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        [day]: { ...schedule[day], endTime: e.target.value },
                      })
                    }
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!schedule[day].enabled && (
                <span className="text-sm text-gray-400">Day off</span>
              )}
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

'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/ui/Toast';
import { Btn, PaperModal } from '@/components/paper';
import { DatePicker } from '@/components/ui/DatePicker';
import { awayPeriodsOverlapping } from '@/lib/away-periods';
import type { AwayPeriod, Booking, ClassException } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  coachId: string;
  editing: AwayPeriod | null;       // null = create mode
  allAwayPeriods: AwayPeriod[];     // for overlap check
  bookings: Booking[];              // for conflict resolver
  exceptions: ClassException[];     // for conflict resolver
}

type ConflictRow =
  | { kind: 'adhoc-booking'; id: string; date: string; label: string }
  | { kind: 'rescheduled-exception'; id: string; date: string; label: string };

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

function formatDateLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-MY', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeLabel(t: string): string {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const ampm = hh < 12 ? 'AM' : 'PM';
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function buildConflictRows(
  startDate: string,
  endDate: string,
  bookings: Booking[],
  exceptions: ClassException[],
): ConflictRow[] {
  const rows: ConflictRow[] = [];

  // Ad-hoc bookings whose startDate === endDate falls in [startDate, endDate]
  for (const b of bookings) {
    if (b.startDate && b.endDate && b.startDate === b.endDate) {
      const d = b.startDate;
      if (d >= startDate && d <= endDate) {
        rows.push({
          kind: 'adhoc-booking',
          id: b.id,
          date: d,
          label: `${formatDateLabel(d)} · ${formatTimeLabel(b.startTime)} · ${b.className || 'Class'} at ${b.locationName}`,
        });
      }
    }
  }

  // Rescheduled exceptions whose newDate falls in [startDate, endDate]
  for (const ex of exceptions) {
    if (ex.type !== 'rescheduled' || !ex.newDate) continue;
    const d = ex.newDate;
    if (d >= startDate && d <= endDate) {
      const booking = bookings.find((b) => b.id === ex.bookingId);
      const className = ex.newClassName ?? booking?.className ?? 'Class';
      const locationName = ex.newLocationName ?? booking?.locationName ?? '';
      const startTime = ex.newStartTime ?? booking?.startTime ?? '';
      rows.push({
        kind: 'rescheduled-exception',
        id: ex.id,
        date: d,
        label: `${formatDateLabel(d)} · ${formatTimeLabel(startTime)} · ${className} at ${locationName} (rescheduled)`,
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

export default function AwayPeriodModal({
  open,
  onClose,
  coachId,
  editing,
  allAwayPeriods,
  bookings,
  exceptions,
}: Props) {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState<string>(editing?.startDate ?? '');
  const [endDate, setEndDate] = useState<string>(editing?.endDate ?? '');
  const [label, setLabel] = useState<string>(editing?.label ?? '');
  const [skipBookingIds, setSkipBookingIds] = useState<Set<string>>(new Set());
  const [skipExceptionIds, setSkipExceptionIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLongRangeConfirm, setShowLongRangeConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-init local state whenever the modal is reopened or editing target changes.
  useEffect(() => {
    setStartDate(editing?.startDate ?? '');
    setEndDate(editing?.endDate ?? '');
    setLabel(editing?.label ?? '');
    setSkipBookingIds(new Set());
    setSkipExceptionIds(new Set());
    setError(null);
    setShowLongRangeConfirm(false);
  }, [editing, open]);

  const datesValid = !!startDate && !!endDate && startDate <= endDate;

  const conflictRows = useMemo<ConflictRow[]>(() => {
    if (!datesValid) return [];
    return buildConflictRows(startDate, endDate, bookings, exceptions);
  }, [datesValid, startDate, endDate, bookings, exceptions]);

  // Default: every conflict row ticked (= "cancel"). Reset whenever the row set changes.
  useEffect(() => {
    const initBookings = new Set<string>();
    const initExceptions = new Set<string>();
    for (const r of conflictRows) {
      if (r.kind === 'adhoc-booking') initBookings.add(r.id);
      else initExceptions.add(r.id);
    }
    setSkipBookingIds(initBookings);
    setSkipExceptionIds(initExceptions);
  }, [conflictRows]);

  const dayCount = useMemo(() => {
    if (!datesValid) return 0;
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const ms = new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
  }, [datesValid, startDate, endDate]);

  function toggleRow(row: ConflictRow) {
    if (row.kind === 'adhoc-booking') {
      const next = new Set(skipBookingIds);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      setSkipBookingIds(next);
    } else {
      const next = new Set(skipExceptionIds);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      setSkipExceptionIds(next);
    }
  }

  async function handleSave() {
    if (!datesValid || !db) return;
    setError(null);

    // Overlap check (excluding the period being edited)
    const overlaps = awayPeriodsOverlapping(
      startDate,
      endDate,
      allAwayPeriods,
      editing?.id,
    );
    if (overlaps.length > 0) {
      const o = overlaps[0];
      setError(
        `Overlaps with "${o.label || `${o.startDate} – ${o.endDate}`}". Edit that one instead.`,
      );
      return;
    }

    // Length sanity check — gate behind a confirm modal instead of saving immediately
    if (dayCount > 365 && !showLongRangeConfirm) {
      setShowLongRangeConfirm(true);
      return;
    }
    setShowLongRangeConfirm(false);

    setSaving(true);
    try {
      const firestore = db as Firestore;
      const batch = writeBatch(firestore);

      // 1. Create or update the away period doc
      if (editing) {
        batch.update(
          doc(firestore, 'coaches', coachId, 'awayPeriods', editing.id),
          {
            startDate,
            endDate,
            label: label.trim() || null,
            updatedAt: serverTimestamp(),
          },
        );
      } else {
        const newDocRef = doc(collection(firestore, 'coaches', coachId, 'awayPeriods'));
        batch.set(newDocRef, {
          startDate,
          endDate,
          label: label.trim() || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // 2. Delete ticked ad-hoc bookings (and their referencing exceptions)
      for (const bookingId of skipBookingIds) {
        batch.delete(doc(firestore, 'coaches', coachId, 'bookings', bookingId));
      }
      if (skipBookingIds.size > 0) {
        for (const bookingId of skipBookingIds) {
          const exQuery = query(
            collection(firestore, 'coaches', coachId, 'classExceptions'),
            where('bookingId', '==', bookingId),
          );
          const snap = await getDocs(exQuery);
          for (const d of snap.docs) {
            batch.delete(doc(firestore, 'coaches', coachId, 'classExceptions', d.id));
          }
        }
      }

      // 3. Convert ticked rescheduled exceptions to cancelled
      for (const exId of skipExceptionIds) {
        batch.update(doc(firestore, 'coaches', coachId, 'classExceptions', exId), {
          type: 'cancelled',
          newDate: null,
          newStartTime: null,
          newEndTime: null,
          newLocationId: null,
          newLocationName: null,
          newNote: null,
          newClassName: null,
          newStudentIds: null,
          newStudentPrices: null,
          newStudentWallets: null,
        });
      }

      await batch.commit();
      showToast(editing ? 'Time off updated' : 'Time off added', 'success');
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Failed to save time off', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing || !db) return;
    setSaving(true);
    try {
      const firestore = db as Firestore;
      await deleteDoc(doc(firestore, 'coaches', coachId, 'awayPeriods', editing.id));
      showToast('Time off deleted', 'success');
      setShowDeleteConfirm(false);
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Failed to delete time off', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PaperModal
        open={open}
        onClose={() => !saving && onClose()}
        title={editing ? 'Edit time off' : 'Add time off'}
      >
        <div className="space-y-4">
          {/* Start date */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
              Start date
            </label>
            <DatePicker value={startDate} onChange={setStartDate} />
          </div>

          {/* End date */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
              End date
            </label>
            <DatePicker value={endDate} onChange={setEndDate} />
            {startDate && endDate && endDate < startDate && (
              <div className="text-[11.5px] mt-1" style={{ color: 'var(--bad)' }}>
                End date must be on or after the start date.
              </div>
            )}
          </div>

          {/* Label */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Bali holiday"
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          {/* Conflict resolver */}
          {datesValid && conflictRows.length > 0 && (
            <div className="pt-2">
              <div className="text-[12.5px] font-medium mb-2" style={{ color: 'var(--ink)' }}>
                While you&apos;re away, these lessons are scheduled:
              </div>
              <div className="space-y-1.5">
                {conflictRows.map((row) => {
                  const checked =
                    row.kind === 'adhoc-booking'
                      ? skipBookingIds.has(row.id)
                      : skipExceptionIds.has(row.id);
                  return (
                    <label
                      key={`${row.kind}:${row.id}`}
                      className="flex items-start gap-2 cursor-pointer text-[12.5px]"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(row)}
                        className="mt-0.5"
                      />
                      <span>
                        {row.label}{' '}
                        <span style={{ color: 'var(--ink-3)' }}>
                          {checked ? '— will cancel' : '— keep'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="text-[11.5px] mt-2" style={{ color: 'var(--ink-3)' }}>
                Recurring weekly classes in this range will be skipped automatically — no need to cancel each one.
              </div>
            </div>
          )}

          {/* Shrink note (edit mode only) */}
          {editing && (
            <div className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              Shortening the range won&apos;t restore lessons you already cancelled.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-[12px]" style={{ color: 'var(--bad)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {editing ? (
            <Btn
              variant="ghost"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving}
              style={{ color: 'var(--bad)' }}
            >
              Delete
            </Btn>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Btn variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Btn>
            <Btn variant="primary" onClick={handleSave} disabled={saving || !datesValid}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Add time off'}
            </Btn>
          </div>
        </div>
      </PaperModal>

      {/* Delete confirmation */}
      <PaperModal
        open={showDeleteConfirm}
        onClose={() => !saving && setShowDeleteConfirm(false)}
        title="Delete time off?"
      >
        <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
          Delete &ldquo;{editing?.label || `${editing?.startDate} – ${editing?.endDate}`}&rdquo;? Lessons cancelled because of this away period won&apos;t be restored.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Btn variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={saving}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            onClick={handleDelete}
            disabled={saving}
            style={{ background: 'var(--bad)', color: 'white' }}
          >
            {saving ? 'Deleting…' : 'Delete'}
          </Btn>
        </div>
      </PaperModal>

      {/* Long-range sanity check */}
      <PaperModal
        open={showLongRangeConfirm}
        onClose={() => !saving && setShowLongRangeConfirm(false)}
        title="That's a long time off"
      >
        <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
          {dayCount} days is over a year. Are you sure you picked the right dates?
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Btn variant="outline" onClick={() => setShowLongRangeConfirm(false)} disabled={saving}>
            Go back
          </Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            Yes, save
          </Btn>
        </div>
      </PaperModal>
    </>
  );
}

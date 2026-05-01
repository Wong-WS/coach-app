'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/ui/Toast';
import type { Student, Wallet, Location, Booking } from '@/types';
import {
  getDayOfWeekForDate,
} from '@/lib/class-schedule';
import { findOrCreateStudent } from '@/lib/students';
import {
  Btn,
  PaperModal,
  IconCheck,
  IconClose,
} from '@/components/paper';
import { FieldLabel } from './FieldLabel';

// Private style constants (private copy — same as in page.tsx)
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

// Types — exported so page.tsx can still reference them
export type StudentRowState = {
  mode: 'existing' | 'new';
  studentId: string;
  newName: string;
  newPhone: string;
  walletOption: 'none' | 'existing' | 'create';
  existingWalletId: string; // can be wallet id or `pending:<row-index>`
  newWalletName: string;
  price: number;
};

function makeEmptyRow(): StudentRowState {
  return {
    mode: 'new',
    studentId: '',
    newName: '',
    newPhone: '',
    walletOption: 'create',
    existingWalletId: '',
    newWalletName: '',
    price: 0,
  };
}

export type AddLessonPrefill = {
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  locationId: string;
  rows: StudentRowState[];
};

// Main component
export function AddLessonModal({
  open,
  onClose,
  coachId,
  students,
  wallets,
  locations,
  bookings,
  defaultDate,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  coachId: string | undefined;
  students: Student[];
  wallets: Wallet[];
  locations: Location[];
  bookings: Booking[];
  defaultDate: string;
  prefill?: AddLessonPrefill | null;
}) {
  const { showToast } = useToast();
  const [className, setClassName] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('17:00');
  const [repeat, setRepeat] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [rows, setRows] = useState<StudentRowState[]>([makeEmptyRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (prefill) {
      setClassName(prefill.className);
      setDate(prefill.date);
      setStartTime(prefill.startTime);
      setEndTime(prefill.endTime);
      setRepeat(false);
      setLocationId(prefill.locationId);
      setNewLocationName('');
      setRows(prefill.rows.length > 0 ? prefill.rows : [makeEmptyRow()]);
      return;
    }
    setClassName('');
    setDate(defaultDate);
    setStartTime('16:00');
    setEndTime('17:00');
    setRepeat(false);
    setLocationId(locations[0]?.id ?? '__new');
    setNewLocationName('');
    setRows([makeEmptyRow()]);
  }, [open, defaultDate, prefill, locations]);

  const updateRow = (i: number, patch: Partial<StudentRowState>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [...rs, makeEmptyRow()]);
  const removeRow = (i: number) =>
    setRows((rs) => rs.filter((_, idx) => idx !== i));

  // studentId -> defaults derived from existing wallets & past bookings.
  // Wallet: first non-archived wallet that has the student in studentIds.
  // Price: most recent studentPrices[sid] from bookings (sorted by createdAt desc).
  const studentDefaults = useMemo(() => {
    const map = new Map<string, { walletId: string | null; price: number }>();

    const walletByStudent = new Map<string, string>();
    for (const w of wallets) {
      if (w.archived) continue;
      for (const sid of w.studentIds || []) {
        if (!walletByStudent.has(sid)) walletByStudent.set(sid, w.id);
      }
    }

    const sortedBookings = [...bookings].sort(
      (a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0),
    );
    const priceByStudent = new Map<string, number>();
    for (const b of sortedBookings) {
      if (!b.studentPrices) continue;
      for (const [sid, price] of Object.entries(b.studentPrices)) {
        if (!priceByStudent.has(sid) && typeof price === 'number') {
          priceByStudent.set(sid, price);
        }
      }
    }

    for (const s of students) {
      map.set(s.id, {
        walletId: walletByStudent.get(s.id) ?? null,
        price: priceByStudent.get(s.id) ?? 0,
      });
    }
    return map;
  }, [students, wallets, bookings]);

  const handlePickStudent = (i: number, studentId: string) => {
    if (!studentId) {
      updateRow(i, { studentId: '' });
      return;
    }
    const d = studentDefaults.get(studentId);
    const patch: Partial<StudentRowState> = { studentId, price: d?.price ?? 0 };
    if (d?.walletId) {
      patch.walletOption = 'existing';
      patch.existingWalletId = d.walletId;
    } else {
      patch.walletOption = 'none';
      patch.existingWalletId = '';
    }
    updateRow(i, patch);
  };

  const total = rows.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const creatingLocation = locationId === '__new';

  const handleSave = async () => {
    if (!coachId || !db) {
      showToast('Account still loading — refresh the page and try again', 'error');
      return;
    }
    if (rows.length === 0) return;

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.mode === 'existing' && !r.studentId) {
        showToast(`Student ${i + 1}: pick a student`, 'error');
        return;
      }
      if (r.mode === 'new' && !r.newName.trim()) {
        showToast(`Student ${i + 1}: enter a name`, 'error');
        return;
      }
      if (r.walletOption === 'existing' && !r.existingWalletId) {
        showToast(`Student ${i + 1}: pick a wallet`, 'error');
        return;
      }
      if (r.walletOption === 'create' && !r.newWalletName.trim()) {
        showToast(`Student ${i + 1}: name the new wallet`, 'error');
        return;
      }
    }

    if (creatingLocation && !newLocationName.trim()) {
      showToast('Enter a name for the new location', 'error');
      return;
    }
    if (!creatingLocation && !locationId) {
      showToast('Pick a location', 'error');
      return;
    }

    const dayOfWeek = getDayOfWeekForDate(date);
    if (!dayOfWeek) return;

    setSaving(true);
    try {
      const firestore = db as Firestore;

      // 1. Resolve location.
      let finalLocationId = locationId;
      let finalLocationName = locations.find((l) => l.id === locationId)?.name || '';
      if (creatingLocation) {
        const newLoc = await addDoc(
          collection(firestore, 'coaches', coachId, 'locations'),
          {
            name: newLocationName.trim(),
            address: '',
            notes: '',
            createdAt: serverTimestamp(),
          },
        );
        finalLocationId = newLoc.id;
        finalLocationName = newLocationName.trim();
      }

      // 2. Resolve each row's studentId (create-new as needed).
      const resolvedStudentIds: string[] = [];
      for (const r of rows) {
        if (r.mode === 'existing') {
          resolvedStudentIds.push(r.studentId);
        } else {
          const sid = await findOrCreateStudent(
            firestore,
            coachId,
            r.newName.trim(),
            r.newPhone.trim(),
          );
          resolvedStudentIds.push(sid);
        }
      }

      // 3. Plan wallets: for each row that creates a wallet, aggregate the
      //    studentIds of every row pointing at it via `pending:<index>`.
      const pendingWalletIds: Record<number, string> = {};
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.walletOption !== 'create') continue;
        const sharedStudentIds = [resolvedStudentIds[i]];
        for (let j = i + 1; j < rows.length; j++) {
          const other = rows[j];
          if (
            other.walletOption === 'existing' &&
            other.existingWalletId === `pending:${i}`
          ) {
            sharedStudentIds.push(resolvedStudentIds[j]);
          }
        }
        const walletRef = await addDoc(
          collection(firestore, 'coaches', coachId, 'wallets'),
          {
            name: r.newWalletName.trim(),
            balance: 0,
            studentIds: sharedStudentIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        );
        pendingWalletIds[i] = walletRef.id;
      }

      // 4. Build studentPrices + studentWallets keyed by resolved student id.
      const studentPrices: Record<string, number> = {};
      const studentWallets: Record<string, string> = {};
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const sid = resolvedStudentIds[i];
        studentPrices[sid] = Number(r.price) || 0;
        if (r.walletOption === 'existing') {
          if (r.existingWalletId.startsWith('pending:')) {
            const refIdx = parseInt(r.existingWalletId.split(':')[1], 10);
            const resolved = pendingWalletIds[refIdx];
            if (resolved) studentWallets[sid] = resolved;
          } else {
            studentWallets[sid] = r.existingWalletId;
          }
        } else if (r.walletOption === 'create') {
          const resolved = pendingWalletIds[i];
          if (resolved) studentWallets[sid] = resolved;
        }
      }

      // 5. Write booking.
      const payload: Record<string, unknown> = {
        locationId: finalLocationId,
        locationName: finalLocationName,
        dayOfWeek,
        startTime,
        endTime,
        status: 'confirmed',
        className: className.trim(),
        notes: '',
        studentIds: resolvedStudentIds,
        studentPrices,
        studentWallets,
        startDate: date,
        createdAt: serverTimestamp(),
      };
      if (!repeat) payload.endDate = date;
      await addDoc(collection(firestore, 'coaches', coachId, 'bookings'), payload);

      showToast(repeat ? 'Recurring lesson added' : 'Lesson added', 'success');
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Failed to add lesson', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PaperModal open={open} onClose={onClose} title={prefill ? 'Duplicate lesson' : 'Add lesson'} width={560}>
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>Class name</FieldLabel>
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="e.g. Aarav private"
            className={paperInputClass}
            style={paperInputStyle}
          />
        </div>

        <div>
          <SectionLabel>When</SectionLabel>
          <div
            className="grid gap-2 grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr]"
          >
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${paperInputClass} mono tnum col-span-2 sm:col-span-1 min-w-0`}
              style={paperInputStyle}
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              step={300}
              className={`${paperInputClass} mono tnum min-w-0`}
              style={paperInputStyle}
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              step={300}
              className={`${paperInputClass} mono tnum min-w-0`}
              style={paperInputStyle}
            />
          </div>
          <label
            className="flex items-center gap-2 text-[12.5px] mt-2 cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
            />
            Repeat weekly on this day
          </label>
        </div>

        <div>
          <SectionLabel>Where</SectionLabel>
          <div className="relative">
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={`${paperInputClass} cursor-pointer`}
              style={{ ...paperInputStyle, paddingRight: '2.25rem' }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value="__new">+ Add new location…</option>
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--ink-3)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {creatingLocation && (
            <input
              autoFocus
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="New location name (e.g. Subang Tennis Centre)"
              className={`${paperInputClass} mt-2`}
              style={paperInputStyle}
            />
          )}
        </div>

        <div>
          <SectionLabel>Students</SectionLabel>
          <div className="flex flex-col gap-2.5">
            {rows.map((r, i) => (
              <StudentRow
                key={i}
                row={r}
                index={i}
                count={rows.length}
                students={students}
                wallets={wallets}
                rows={rows}
                onChange={(patch) => updateRow(i, patch)}
                onPickStudent={(sid) => handlePickStudent(i, sid)}
                onRemove={() => removeRow(i)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="w-full mt-2.5 text-[12.5px] font-medium"
            style={{
              padding: '8px 12px',
              border: '1px dashed var(--line-2)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--ink-2)',
            }}
          >
            + Add another student
          </button>
        </div>

        <div
          className="flex items-center justify-between rounded-[10px] border"
          style={{
            padding: '10px 12px',
            background: 'var(--bg)',
            borderColor: 'var(--line)',
          }}
        >
          <div
            className="text-[12px] font-medium"
            style={{ color: 'var(--ink-3)' }}
          >
            Total per lesson
          </div>
          <div
            className="mono tnum text-[18px] font-semibold"
            style={{ color: 'var(--ink)' }}
          >
            RM {total}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3.5">
        <Btn variant="ghost" full onClick={onClose} disabled={saving}>
          Cancel
        </Btn>
        <Btn variant="primary" full onClick={handleSave} disabled={saving}>
          <IconCheck size={14} /> {saving ? 'Saving…' : prefill ? 'Duplicate' : 'Add lesson'}
        </Btn>
      </div>
    </PaperModal>
  );
}

// Internal helpers
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase mb-2"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.05em' }}
    >
      {children}
    </div>
  );
}

function StudentRow({
  row,
  index,
  count,
  students,
  wallets,
  rows,
  onChange,
  onPickStudent,
  onRemove,
}: {
  row: StudentRowState;
  index: number;
  count: number;
  students: Student[];
  wallets: Wallet[];
  rows: StudentRowState[];
  onChange: (patch: Partial<StudentRowState>) => void;
  onPickStudent: (studentId: string) => void;
  onRemove: () => void;
}) {
  const pendingAbove = rows
    .slice(0, index)
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.walletOption === 'create' && r.newWalletName.trim());

  return (
    <div
      className="rounded-[10px] border relative"
      style={{
        padding: 12,
        background: 'var(--panel)',
        borderColor: 'var(--line)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="text-[11px] font-semibold uppercase"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
        >
          Student {index + 1}
        </div>
        {count > 1 && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove student"
            className="p-0.5"
            style={{ color: 'var(--ink-3)' }}
          >
            <IconClose size={13} />
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div
        className="flex gap-1 rounded-[8px] border mb-2.5"
        style={{
          padding: 3,
          background: 'var(--bg)',
          borderColor: 'var(--line)',
        }}
      >
        {(
          [
            { k: 'existing', label: 'Existing student' },
            { k: 'new', label: 'New student' },
          ] as const
        ).map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange({ mode: o.k })}
            className="flex-1 rounded-[6px] text-[12px] font-medium"
            style={{
              padding: '6px 10px',
              background: row.mode === o.k ? 'var(--panel)' : 'transparent',
              color: row.mode === o.k ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: row.mode === o.k ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {row.mode === 'existing' ? (
        <select
          value={row.studentId}
          onChange={(e) => onPickStudent(e.target.value)}
          className={paperInputClass}
          style={paperInputStyle}
        >
          <option value="">Select student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.clientName}
            </option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Name"
            value={row.newName}
            onChange={(e) => onChange({ newName: e.target.value })}
            className={paperInputClass}
            style={paperInputStyle}
          />
          <input
            placeholder="Phone"
            value={row.newPhone}
            onChange={(e) => onChange({ newPhone: e.target.value })}
            className={`${paperInputClass} mono`}
            style={paperInputStyle}
          />
        </div>
      )}

      {/* Wallet */}
      <div className="mt-2.5">
        <div
          className="text-[11px] font-medium mb-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          Wallet
        </div>
        <div className="flex gap-1 flex-wrap">
          {(
            [
              { k: 'none', label: 'No wallet' },
              { k: 'existing', label: 'Existing' },
              { k: 'create', label: 'Create new' },
            ] as const
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => onChange({ walletOption: o.k })}
              className="text-[11.5px] font-medium"
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                border: `1px solid ${row.walletOption === o.k ? 'var(--ink)' : 'var(--line-2)'}`,
                background: row.walletOption === o.k ? 'var(--ink)' : 'var(--panel)',
                color: row.walletOption === o.k ? 'var(--bg)' : 'var(--ink-2)',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        {row.walletOption === 'existing' && (
          <select
            value={row.existingWalletId}
            onChange={(e) => onChange({ existingWalletId: e.target.value })}
            className={`${paperInputClass} mt-2`}
            style={paperInputStyle}
          >
            <option value="">Select wallet…</option>
            {wallets
              .filter((w) => !w.archived)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — RM {w.balance.toFixed(0)}
                </option>
              ))}
            {pendingAbove.map(({ r, i }) => (
              <option key={`p-${i}`} value={`pending:${i}`}>
                (New) {r.newWalletName} — shared with student {i + 1}
              </option>
            ))}
          </select>
        )}
        {row.walletOption === 'create' && (
          <input
            placeholder="Wallet name (e.g. Suresh family)"
            value={row.newWalletName}
            onChange={(e) => onChange({ newWalletName: e.target.value })}
            className={`${paperInputClass} mt-2`}
            style={paperInputStyle}
          />
        )}
      </div>

      {/* Price */}
      <div
        className="mt-2.5 grid items-center gap-2"
        style={{ gridTemplateColumns: '1fr auto' }}
      >
        <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
          Price for this student
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
            RM
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={row.price === 0 ? '' : row.price}
            placeholder="0"
            onChange={(e) => onChange({ price: e.target.value === '' ? 0 : Number(e.target.value) })}
            className={`${paperInputClass} mono tnum text-right`}
            style={{ ...paperInputStyle, width: 90 }}
          />
        </div>
      </div>
    </div>
  );
}

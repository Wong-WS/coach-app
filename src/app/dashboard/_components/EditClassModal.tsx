'use client';

import { Btn, PaperModal, IconClose, IconSearch } from '@/components/paper';
import { parseDateString, formatDateFull, formatDateShort } from '@/lib/date-format';
import { getDayOfWeekForDate } from '@/lib/class-schedule';
import type { Booking, Student, Wallet, Location } from '@/types';
import { FieldLabel } from './FieldLabel';

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

export function EditClassModal({
  open,
  booking,
  backingExceptionId,
  selectedDate,
  selectedDateStr,
  className,
  onClassNameChange,
  locationId,
  onLocationIdChange,
  date,
  onDateChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  note,
  onNoteChange,
  studentIds,
  studentPrices,
  studentWallets,
  onRemoveStudent,
  onStudentPriceChange,
  onStudentWalletChange,
  addStudentOpen,
  onAddStudentOpenChange,
  addStudentSearch,
  onAddStudentSearchChange,
  onAddStudent,
  totalPrice,
  students,
  wallets,
  locations,
  showSaveOptions,
  onShowSaveOptions,
  saving,
  canSave,
  onSave,
  onClose,
}: {
  open: boolean;
  booking: Booking | null;
  backingExceptionId: string | null;
  selectedDate: Date;
  selectedDateStr: string;
  className: string;
  onClassNameChange: (v: string) => void;
  locationId: string;
  onLocationIdChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  startTime: string;
  onStartTimeChange: (v: string) => void;
  endTime: string;
  onEndTimeChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  studentIds: string[];
  studentPrices: Record<string, number>;
  studentWallets: Record<string, string>;
  onRemoveStudent: (sid: string) => void;
  onStudentPriceChange: (sid: string, v: number) => void;
  onStudentWalletChange: (sid: string, v: string) => void;
  addStudentOpen: boolean;
  onAddStudentOpenChange: (v: boolean) => void;
  addStudentSearch: string;
  onAddStudentSearchChange: (v: string) => void;
  onAddStudent: (s: Student) => void;
  totalPrice: number;
  students: Student[];
  wallets: Wallet[];
  locations: Location[];
  showSaveOptions: boolean;
  onShowSaveOptions: (v: boolean) => void;
  saving: boolean;
  canSave: boolean;
  onSave: (mode?: 'this' | 'future') => void;
  onClose: () => void;
}) {
  if (!booking) return null;
  const isOneTime = !!(
    booking.startDate &&
    booking.endDate &&
    booking.startDate === booking.endDate
  );

  return (
    <PaperModal open={open} onClose={onClose} title="Edit class" width={520}>
      {!showSaveOptions ? (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-[10px] border p-3"
            style={{ background: 'var(--bg)', borderColor: 'var(--line-2)' }}
          >
            <div className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
              {className || '(unnamed class)'}
            </div>
            <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {formatDateFull(selectedDate)}
            </div>
          </div>

          <div>
            <FieldLabel>Class name</FieldLabel>
            <input
              type="text"
              value={className}
              onChange={(e) => onClassNameChange(e.target.value)}
              placeholder="e.g. Tuesday swim squad"
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          <div>
            <FieldLabel>Location</FieldLabel>
            <select
              value={locationId}
              onChange={(e) => onLocationIdChange(e.target.value)}
              className={paperInputClass}
              style={paperInputStyle}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Date</FieldLabel>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className={`${paperInputClass} mono tnum`}
              style={paperInputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Start</FieldLabel>
              <input
                type="time"
                value={startTime}
                onChange={(e) => onStartTimeChange(e.target.value)}
                step={300}
                className={`${paperInputClass} mono tnum`}
                style={paperInputStyle}
              />
            </div>
            <div>
              <FieldLabel>End</FieldLabel>
              <input
                type="time"
                value={endTime}
                onChange={(e) => onEndTimeChange(e.target.value)}
                step={300}
                className={`${paperInputClass} mono tnum`}
                style={paperInputStyle}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className="text-[11.5px] font-semibold uppercase"
                style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
              >
                Students ({studentIds.length})
              </div>
              <div className="mono tnum text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                Total RM {totalPrice.toFixed(0)}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {studentIds.map((sid) => {
                const s = students.find((x) => x.id === sid);
                return (
                  <div
                    key={sid}
                    className="rounded-[10px] border p-3 flex flex-col gap-2"
                    style={{ background: 'var(--bg)', borderColor: 'var(--line-2)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          className="text-[13.5px] font-medium truncate"
                          style={{ color: 'var(--ink)' }}
                        >
                          {s?.clientName ?? '(unknown)'}
                        </div>
                        {s?.clientPhone && (
                          <div
                            className="mono text-[11.5px] truncate"
                            style={{ color: 'var(--ink-3)' }}
                          >
                            {s.clientPhone}
                          </div>
                        )}
                      </div>
                      {studentIds.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveStudent(sid)}
                          className="text-[11.5px] font-medium"
                          style={{ color: 'var(--bad)' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <FieldLabel>Price</FieldLabel>
                        <input
                          type="number"
                          min={0}
                          value={String(studentPrices[sid] ?? 0)}
                          onChange={(e) =>
                            onStudentPriceChange(sid, parseFloat(e.target.value) || 0)
                          }
                          className={`${paperInputClass} mono tnum`}
                          style={paperInputStyle}
                        />
                      </div>
                      <div>
                        <FieldLabel>Wallet</FieldLabel>
                        <select
                          value={studentWallets[sid] ?? ''}
                          onChange={(e) => onStudentWalletChange(sid, e.target.value)}
                          className={paperInputClass}
                          style={paperInputStyle}
                        >
                          <option value="">Auto (student&rsquo;s own)</option>
                          {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} (RM {w.balance.toFixed(0)})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}

              {addStudentOpen ? (
                <div
                  className="rounded-[10px] border p-3 flex flex-col gap-2"
                  style={{ background: 'var(--panel)', borderColor: 'var(--line-2)' }}
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={addStudentSearch}
                      onChange={(e) => onAddStudentSearchChange(e.target.value)}
                      placeholder="Search name or phone"
                      className={`${paperInputClass} pl-8`}
                      style={paperInputStyle}
                    />
                    <div
                      className="absolute left-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--ink-4)' }}
                    >
                      <IconSearch size={14} />
                    </div>
                  </div>
                  <div className="max-h-44 overflow-y-auto flex flex-col gap-1 no-scrollbar">
                    {students
                      .filter((s) => !studentIds.includes(s.id))
                      .filter((s) => {
                        if (!addStudentSearch.trim()) return true;
                        const q = addStudentSearch.toLowerCase();
                        return (
                          s.clientName.toLowerCase().includes(q) ||
                          s.clientPhone.toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 8)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onAddStudent(s)}
                          className="text-left p-2 rounded-md text-[13px]"
                          style={{ color: 'var(--ink)' }}
                        >
                          <div>{s.clientName}</div>
                          {s.clientPhone && (
                            <div
                              className="mono text-[11.5px]"
                              style={{ color: 'var(--ink-3)' }}
                            >
                              {s.clientPhone}
                            </div>
                          )}
                        </button>
                      ))}
                    {students.filter((s) => !studentIds.includes(s.id)).length === 0 && (
                      <div
                        className="text-[12px] p-2"
                        style={{ color: 'var(--ink-4)' }}
                      >
                        No other students to add.
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onAddStudentOpenChange(false);
                        onAddStudentSearchChange('');
                      }}
                    >
                      <IconClose size={12} /> Close
                    </Btn>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddStudentOpenChange(true)}
                  className="text-[13px] font-medium self-start py-1.5"
                  style={{ color: 'var(--accent)' }}
                >
                  + Add student
                </button>
              )}
            </div>
          </div>

          <div>
            <FieldLabel>Note (optional)</FieldLabel>
            <input
              type="text"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. Riwoo only"
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                if (isOneTime || backingExceptionId) {
                  onSave();
                } else {
                  onShowSaveOptions(true);
                }
              }}
              disabled={!canSave || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        </div>
      ) : (
        (() => {
          const editDateObj = date ? parseDateString(date) : selectedDate;
          const dateChanged = date !== selectedDateStr;
          const oldDow = booking.dayOfWeek;
          const newDow = dateChanged ? getDayOfWeekForDate(date) : oldDow;
          const dowChanged = dateChanged && newDow !== oldDow;
          const plural = (dow: string) => dow.charAt(0).toUpperCase() + dow.slice(1) + 's';
          const futureDesc = dowChanged
            ? `Move all future classes from ${plural(oldDow)} to ${plural(newDow)}, starting ${formatDateShort(editDateObj)}`
            : dateChanged
              ? `Apply from ${formatDateShort(editDateObj)} onwards`
              : `Apply from ${formatDateShort(selectedDate)} onwards`;
          const thisDesc = dateChanged
            ? `Move only the ${formatDateShort(selectedDate)} class to ${formatDateShort(editDateObj)}`
            : `Only change the class on ${formatDateShort(selectedDate)}`;
          return (
            <div className="flex flex-col gap-3">
              <div className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                How would you like to apply these changes?
              </div>
              <button
                type="button"
                onClick={() => onSave('this')}
                disabled={saving}
                className="text-left rounded-[10px] border p-3"
                style={{ background: 'var(--bg)', borderColor: 'var(--line-2)' }}
              >
                <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                  This event only
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {thisDesc}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onSave('future')}
                disabled={saving}
                className="text-left rounded-[10px] border p-3"
                style={{ background: 'var(--bg)', borderColor: 'var(--line-2)' }}
              >
                <div className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
                  This and future events
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {futureDesc}
                </div>
              </button>
              <div className="flex justify-end pt-1">
                <Btn size="sm" variant="ghost" onClick={() => onShowSaveOptions(false)}>
                  Back
                </Btn>
              </div>
            </div>
          );
        })()
      )}
    </PaperModal>
  );
}

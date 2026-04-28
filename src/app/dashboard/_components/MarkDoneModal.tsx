'use client';

import {
  Btn,
  PaperModal,
  Avatar,
  IconCheck,
  IconClose,
} from '@/components/paper';
import { resolveWallet } from '@/lib/wallets';
import { formatTimeDisplay } from '@/lib/time-format';
import type { Booking, Student, Wallet } from '@/types';

export function MarkDoneModal({
  open,
  booking,
  amounts,
  onAmountsChange,
  attending,
  onRemoveAttendee,
  onRestoreAttendee,
  students,
  wallets,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  booking: Booking | null;
  amounts: Record<string, number>;
  onAmountsChange: (a: Record<string, number>) => void;
  attending: string[];
  onRemoveAttendee: (sid: string) => void;
  onRestoreAttendee: (sid: string) => void;
  students: Student[];
  wallets: Wallet[];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!booking) return null;
  const attendingSet = new Set(attending);
  const total = booking.studentIds.reduce((s, sid) => {
    if (!attendingSet.has(sid)) return s;
    return s + (Number(amounts[sid]) || 0);
  }, 0);
  const canConfirm = attending.length > 0;

  return (
    <PaperModal open={open} onClose={onClose} title="Mark class as done" width={480}>
      <div
        className="rounded-[10px] border p-3 mb-3"
        style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
      >
        <div className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
          {booking.className || 'Class'}
        </div>
        <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {formatTimeDisplay(booking.startTime)}–{formatTimeDisplay(booking.endTime)} ·{' '}
          {booking.locationName}
        </div>
      </div>
      <div className="flex items-center justify-between mb-2">
        <div
          className="text-[11px] font-semibold uppercase"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Attendees & charges
        </div>
        {booking.studentIds.length > 1 && (
          <div className="text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
            {attending.length}/{booking.studentIds.length} attending
          </div>
        )}
      </div>
      {booking.studentIds.map((sid) => {
        const s = students.find((x) => x.id === sid);
        const w = resolveWallet(booking, sid, wallets);
        const isAttending = attendingSet.has(sid);
        const canRemove = booking.studentIds.length > 1;
        return (
          <div
            key={sid}
            className="flex items-center gap-2.5 py-2.5 border-t"
            style={{
              borderColor: 'var(--line)',
              opacity: isAttending ? 1 : 0.5,
            }}
          >
            <Avatar name={s?.clientName || ''} size={30} />
            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] font-medium truncate"
                style={{
                  color: 'var(--ink)',
                  textDecoration: isAttending ? 'none' : 'line-through',
                }}
              >
                {s?.clientName}
              </div>
              {isAttending ? (
                w && (
                  <div className="text-[11px] mono tnum" style={{ color: 'var(--ink-3)' }}>
                    Wallet: RM {Math.round(w.balance)}
                  </div>
                )
              ) : (
                <div className="text-[11px]" style={{ color: 'var(--ink-4)' }}>
                  Skipped — no charge
                </div>
              )}
            </div>
            {isAttending ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="mono text-[12px]" style={{ color: 'var(--ink-3)' }}>
                    RM
                  </span>
                  <input
                    type="number"
                    value={amounts[sid] ?? 0}
                    onChange={(e) =>
                      onAmountsChange({ ...amounts, [sid]: Number(e.target.value) })
                    }
                    className="mono text-right"
                    style={{
                      width: 72,
                      padding: '6px 8px',
                      border: '1px solid var(--line-2)',
                      borderRadius: 8,
                      background: 'var(--panel)',
                      color: 'var(--ink)',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </div>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttendee(sid)}
                    aria-label="Remove attendee"
                    className="p-1 rounded-md"
                    style={{ color: 'var(--ink-4)' }}
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => onRestoreAttendee(sid)}
                className="text-[12px] font-medium"
                style={{ color: 'var(--accent)' }}
              >
                Undo
              </button>
            )}
          </div>
        );
      })}
      <div
        className="flex justify-between items-center pt-3 mt-1 border-t"
        style={{ borderColor: 'var(--line)' }}
      >
        <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          Will charge wallets
        </span>
        <span
          className="mono tnum text-[16px] font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          RM {Math.round(total)}
        </span>
      </div>
      <div className="flex gap-2 mt-4">
        <Btn variant="ghost" full onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
        <Btn variant="primary" full onClick={onConfirm} disabled={busy || !canConfirm}>
          <IconCheck size={14} /> Confirm
        </Btn>
      </div>
    </PaperModal>
  );
}

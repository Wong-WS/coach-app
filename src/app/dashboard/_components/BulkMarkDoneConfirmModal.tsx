'use client';

import { Btn, PaperModal } from '@/components/paper';
import { getBookingTotal } from '@/lib/class-schedule';
import type { Booking } from '@/types';

function fmtTimeShort(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'p' : 'a';
  const h12 = hh % 12 || 12;
  if (mm === 0) return `${h12}${period}`;
  return `${h12}:${String(mm).padStart(2, '0')}${period}`;
}

export function BulkMarkDoneConfirmModal({
  open,
  running,
  classes,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  running: boolean;
  classes: Booking[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <PaperModal
      open={open}
      onClose={() => !running && onCancel()}
      title={`Mark ${classes.length} ${classes.length === 1 ? 'class' : 'classes'} done?`}
      width={480}
    >
      <div className="space-y-4">
        <div
          className="rounded-[10px] border p-3 text-[13px]"
          style={{
            background: 'var(--warn-soft)',
            borderColor: 'var(--warn)',
            color: 'var(--ink)',
          }}
        >
          Double-check this list — make sure none of these classes were actually
          cancelled today. Once marked done, wallets will be charged.
        </div>

        <div
          className="rounded-[10px] border divide-y"
          style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
        >
          {classes.map((c) => {
            const total = getBookingTotal(c);
            const studentCount = c.studentIds.length;
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 px-3 py-2.5"
                style={{ borderColor: 'var(--line)' }}
              >
                <div
                  className="mono tnum text-[12.5px] w-14 shrink-0"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {fmtTimeShort(c.startTime)}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13.5px] font-medium truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {c.className || 'Class'}
                  </div>
                  <div className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
                    {studentCount} {studentCount === 1 ? 'student' : 'students'}
                  </div>
                </div>
                <div
                  className="mono tnum text-[13px] shrink-0"
                  style={{ color: 'var(--ink-2)' }}
                >
                  RM {Math.round(total)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 justify-end">
          <Btn
            variant="outline"
            onClick={onCancel}
            disabled={running}
          >
            Cancel
          </Btn>
          <Btn
            variant="primary"
            onClick={onConfirm}
            disabled={running || classes.length === 0}
          >
            {running ? 'Marking…' : 'Mark all done'}
          </Btn>
        </div>
      </div>
    </PaperModal>
  );
}

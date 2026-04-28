'use client';

import { Btn, PaperModal } from '@/components/paper';

export type DepletedAlert = {
  wallets: Array<{
    name: string;
    newBalance: number;
    status: 'owing' | 'empty';
  }>;
};

export function DepletedWalletAlert({
  alert,
  onClose,
}: {
  alert: DepletedAlert | null;
  onClose: () => void;
}) {
  return (
    <PaperModal
      open={!!alert}
      onClose={onClose}
      title={
        alert && alert.wallets.length > 1
          ? 'Wallets need top-up'
          : 'Wallet needs top-up'
      }
    >
      {alert && (
        <div className="space-y-3">
          <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
            {alert.wallets.length > 1
              ? "These wallets can't cover the next lesson after this charge:"
              : "This wallet can't cover the next lesson after this charge:"}
          </p>
          <div className="space-y-2">
            {alert.wallets.map((w, i) => {
              const isOwing = w.status === 'owing';
              return (
                <div
                  key={i}
                  className="rounded-[10px] border p-3"
                  style={{
                    background: isOwing ? 'var(--bad-soft)' : 'var(--warn-soft)',
                    borderColor: isOwing ? 'var(--bad)' : 'var(--warn)',
                  }}
                >
                  <div
                    className="text-[13.5px] font-semibold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {w.name}
                  </div>
                  <div
                    className="mono tnum text-[12.5px] mt-0.5"
                    style={{ color: isOwing ? 'var(--bad)' : 'var(--warn)' }}
                  >
                    {isOwing
                      ? `Now owes RM ${Math.abs(w.newBalance).toFixed(0)}`
                      : `Balance RM ${w.newBalance.toFixed(0)} — below next lesson`}
                  </div>
                </div>
              );
            })}
          </div>
          <Btn
            variant="primary"
            onClick={onClose}
          >
            Got it
          </Btn>
        </div>
      )}
    </PaperModal>
  );
}

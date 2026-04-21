'use client';

import { ReactNode, useEffect } from 'react';
import { IconClose } from './Icons';

interface PaperModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

export function PaperModal({ open, onClose, title, width = 440, children }: PaperModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{ background: 'rgba(15,14,12,0.45)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-[14px] border"
        style={{
          background: 'var(--panel)',
          color: 'var(--ink)',
          borderColor: 'var(--line)',
          maxWidth: width,
          boxShadow: 'var(--shadow-lg)',
          maxHeight: 'calc(100dvh - 40px)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: 'var(--line)' }}
          >
            <div className="text-[15px] font-semibold">{title}</div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md"
              style={{ color: 'var(--ink-3)' }}
              aria-label="Close"
            >
              <IconClose size={16} />
            </button>
          </div>
        )}
        <div className="px-5 py-5 overflow-y-auto no-scrollbar">{children}</div>
      </div>
    </div>
  );
}

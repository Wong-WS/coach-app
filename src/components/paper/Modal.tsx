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
      className="paper-backdrop-in fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      style={{ background: 'rgba(15,14,12,0.45)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="paper-sheet paper-sheet-in flex flex-col overflow-hidden rounded-t-2xl sm:rounded-[14px] border"
        style={{
          background: 'var(--panel)',
          color: 'var(--ink)',
          borderColor: 'var(--line)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: 'calc(100dvh - 40px)',
          ['--paper-modal-max' as string]: `${width}px`,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle — visual affordance only (no swipe gesture wired) */}
        <div
          className="flex sm:hidden justify-center pt-2 pb-1"
          aria-hidden="true"
        >
          <div
            className="h-1 w-9 rounded-full"
            style={{ background: 'var(--line-2)' }}
          />
        </div>
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

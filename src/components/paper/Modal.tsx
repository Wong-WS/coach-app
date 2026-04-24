'use client';

import { ReactNode, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { IconClose } from './Icons';

interface PaperModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

const DRAG_CLOSE_THRESHOLD_PX = 100;

export function PaperModal({ open, onClose, title, width = 440, children }: PaperModalProps) {
  const dragRef = useRef<{ startY: number; delta: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // iOS-safe body scroll lock (position: fixed + restore scrollY on close)
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDragY(0);
      setIsDragging(false);
      dragRef.current = null;
    }
  }, [open]);

  const beginDrag = (e: RPointerEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.innerWidth >= 640) return;
    dragRef.current = { startY: e.clientY, delta: 0 };
    setIsDragging(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const s = dragRef.current;
    if (!s) return;
    const delta = Math.max(0, e.clientY - s.startY);
    s.delta = delta;
    setDragY(delta);
  };

  const endDrag = () => {
    const s = dragRef.current;
    if (!s) return;
    const shouldClose = s.delta > DRAG_CLOSE_THRESHOLD_PX;
    dragRef.current = null;
    setIsDragging(false);
    if (shouldClose) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  if (!open) return null;

  return (
    <div
      className="paper-backdrop-in fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      style={{
        background: 'rgba(15,14,12,0.45)',
        backdropFilter: 'blur(3px)',
        touchAction: 'none',
      }}
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
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex sm:hidden justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label="Drag to dismiss"
        >
          <div className="h-1 w-9 rounded-full" style={{ background: 'var(--line-2)' }} />
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
        <div
          className="px-5 py-5 overflow-y-auto no-scrollbar"
          style={{ overscrollBehavior: 'contain' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

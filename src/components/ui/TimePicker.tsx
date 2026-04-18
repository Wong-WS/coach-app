'use client';

import { useEffect, useMemo, useRef, useState, KeyboardEvent, ChangeEvent } from 'react';
import {
  parseTimeInput,
  nearbySteppedTimes,
  snapToStep,
  type HalfDay,
} from '@/lib/time-input';
import { formatTimeDisplay } from '@/lib/time-format';
import { usePointerType } from '@/hooks/usePointerType';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  ariaLabel?: string;
  step?: number;
  contextHalfDay?: HalfDay;
  disabled?: boolean;
}

export function TimePicker({
  value,
  onChange,
  id,
  label,
  ariaLabel,
  step = 5,
  contextHalfDay,
  disabled,
}: TimePickerProps) {
  const pointer = usePointerType();

  if (pointer === 'coarse') {
    return (
      <TimePickerMobile
        value={value}
        onChange={onChange}
        id={id}
        label={label}
        ariaLabel={ariaLabel}
        step={step}
        disabled={disabled}
      />
    );
  }

  return (
    <TimePickerDesktop
      value={value}
      onChange={onChange}
      id={id}
      label={label}
      ariaLabel={ariaLabel}
      step={step}
      contextHalfDay={contextHalfDay}
      disabled={disabled}
    />
  );
}

function TimePickerDesktop({
  value,
  onChange,
  id,
  label,
  ariaLabel,
  step = 5,
  contextHalfDay,
  disabled,
}: TimePickerProps) {
  const [raw, setRaw] = useState<string>(formatTimeDisplay(value));
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setRaw(formatTimeDisplay(value));
  }, [value, editing]);

  const slots = useMemo(() => nearbySteppedTimes(value, step, 7), [value, step]);
  const snappedValue = useMemo(() => snapToStep(value, step), [value, step]);
  const currentHighlight = highlight ?? snappedValue;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commitOrRevert();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, raw, editing]);

  function openDropdown() {
    setOpen(true);
    setHighlight(snappedValue);
  }

  function commitRaw(text: string) {
    const parsed = parseTimeInput(text, { contextHalfDay });
    if (parsed) {
      onChange(parsed);
      setRaw(formatTimeDisplay(parsed));
    } else {
      setRaw(formatTimeDisplay(value));
    }
    setEditing(false);
    setOpen(false);
  }

  function commitOrRevert() {
    if (editing) {
      commitRaw(raw);
    } else {
      setOpen(false);
    }
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    setRaw(e.target.value);
    setEditing(true);
    setOpen(true);
    const parsed = parseTimeInput(e.target.value, { contextHalfDay });
    if (parsed) setHighlight(snapToStep(parsed, step));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { openDropdown(); return; }
      const idx = slots.indexOf(currentHighlight);
      const next = slots[Math.min(slots.length - 1, idx + 1)] ?? slots[0];
      setHighlight(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openDropdown(); return; }
      const idx = slots.indexOf(currentHighlight);
      const prev = slots[Math.max(0, idx - 1)] ?? slots[slots.length - 1];
      setHighlight(prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (editing) {
        commitRaw(raw);
      } else if (open && highlight) {
        onChange(highlight);
        setRaw(formatTimeDisplay(highlight));
        setOpen(false);
      }
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRaw(formatTimeDisplay(value));
      setEditing(false);
      setOpen(false);
    }
  }

  function onBlur() {
    setTimeout(() => {
      if (document.activeElement && containerRef.current?.contains(document.activeElement)) return;
      commitOrRevert();
    }, 100);
  }

  const invalid = editing && raw.trim().length > 0 && parseTimeInput(raw, { contextHalfDay }) === null;

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        value={raw}
        onChange={onInputChange}
        onFocus={openDropdown}
        onClick={openDropdown}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        aria-label={ariaLabel ?? label}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        className={`w-full rounded-lg border bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          invalid ? 'border-red-500' : 'border-gray-300 dark:border-zinc-600'
        }`}
      />
      {invalid && (
        <p className="mt-1 text-xs text-red-500">Couldn&apos;t understand &quot;{raw}&quot;</p>
      )}
      {open && !disabled && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1"
        >
          {slots.map((slot) => {
            const isHighlighted = slot === currentHighlight;
            return (
              <button
                key={slot}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(slot);
                  setRaw(formatTimeDisplay(slot));
                  setEditing(false);
                  setOpen(false);
                  inputRef.current?.blur();
                }}
                onMouseEnter={() => setHighlight(slot)}
                className={`block w-full text-left px-3 py-1.5 text-sm font-mono ${
                  isHighlighted
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-900 dark:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800'
                }`}
              >
                {formatTimeDisplay(slot)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimePickerMobile({
  value,
  onChange,
  id,
  label,
  ariaLabel,
  step = 5,
  disabled,
}: Omit<TimePickerProps, 'contextHalfDay'>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        onClick={() => !disabled && setOpen(true)}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        className="w-full text-left rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
      >
        {formatTimeDisplay(value)}
      </button>
      {open && (
        <WheelSheet
          value={value}
          onConfirm={(v) => { onChange(v); setOpen(false); }}
          onCancel={() => setOpen(false)}
          label={label ?? ariaLabel ?? 'Select time'}
          step={step}
        />
      )}
    </div>
  );
}

interface WheelSheetProps {
  value: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  label: string;
  step: number;
}

function WheelSheet({ value, onConfirm, onCancel, label, step }: WheelSheetProps) {
  const [h24, mRaw] = value.split(':').map(Number);
  const initialPeriod: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const initialHour12 = ((h24 + 11) % 12) + 1;

  const [hour12, setHour12] = useState(initialHour12);
  const [minute, setMinute] = useState(Math.round(mRaw / step) * step % 60);
  const [period, setPeriod] = useState<'AM' | 'PM'>(initialPeriod);

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const minutes = useMemo(() => {
    const arr: number[] = [];
    for (let m = 0; m < 60; m += step) arr.push(m);
    return arr;
  }, [step]);
  const periods: Array<'AM' | 'PM'> = ['AM', 'PM'];

  function handleConfirm() {
    let h = hour12 % 12;
    if (period === 'PM') h += 12;
    const hh = String(h).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    onConfirm(`${hh}:${mm}`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-label={label}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl bg-white dark:bg-zinc-900 pb-[env(safe-area-inset-bottom)]"
        style={{ maxHeight: '60vh' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-800">
          <button type="button" onClick={onCancel} className="text-sm text-gray-600 dark:text-zinc-400">Cancel</button>
          <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">{label}</div>
          <button type="button" onClick={handleConfirm} className="text-sm font-semibold text-blue-600 dark:text-blue-400">Done</button>
        </div>
        <div className="flex justify-center gap-4 py-4 relative">
          <div className="pointer-events-none absolute left-4 right-4 top-1/2 -translate-y-1/2 h-9 border-y border-blue-500/40" />
          <WheelColumn
            items={hours.map(String)}
            selected={String(hour12)}
            onSelect={(v) => setHour12(Number(v))}
          />
          <WheelColumn
            items={minutes.map((m) => String(m).padStart(2, '0'))}
            selected={String(minute).padStart(2, '0')}
            onSelect={(v) => setMinute(Number(v))}
          />
          <WheelColumn
            items={periods}
            selected={period}
            onSelect={(v) => setPeriod(v as 'AM' | 'PM')}
          />
        </div>
      </div>
    </div>
  );
}

interface WheelColumnProps {
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
}

function WheelColumn({ items, selected, onSelect }: WheelColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ROW_H = 36;
  const PADDING = 72;

  useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0 && containerRef.current) {
      containerRef.current.scrollTop = idx * ROW_H;
    }
  }, [selected, items]);

  function onScrollEnd() {
    if (!containerRef.current) return;
    const idx = Math.round(containerRef.current.scrollTop / ROW_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    const next = items[clamped];
    if (next !== selected) onSelect(next);
    containerRef.current.scrollTo({ top: clamped * ROW_H, behavior: 'smooth' });
  }

  return (
    <div
      ref={containerRef}
      onScroll={() => {
        const el = containerRef.current as HTMLDivElement & { __snapT?: number } | null;
        if (!el) return;
        if (el.__snapT) clearTimeout(el.__snapT);
        el.__snapT = window.setTimeout(onScrollEnd, 80);
      }}
      className="w-20 overflow-y-scroll snap-y snap-mandatory no-scrollbar"
      style={{
        height: ROW_H * 5,
        scrollbarWidth: 'none',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
        maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
      }}
    >
      <div style={{ height: PADDING }} />
      {items.map((item) => (
        <div
          key={item}
          className={`snap-center flex items-center justify-center text-base font-mono ${
            item === selected ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-400 dark:text-zinc-500'
          }`}
          style={{ height: ROW_H }}
        >
          {item}
        </div>
      ))}
      <div style={{ height: PADDING }} />
    </div>
  );
}

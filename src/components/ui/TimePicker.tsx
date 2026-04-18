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

function TimePickerMobile(props: Omit<TimePickerProps, 'contextHalfDay'>) {
  return <TimePickerDesktop {...props} contextHalfDay={undefined} />;
}

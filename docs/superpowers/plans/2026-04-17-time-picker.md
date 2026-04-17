# TimePicker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 216-option `<select>` in Add Class and the two native `<input type="time">` usages in Reschedule/Edit with one shared `<TimePicker>` component — typeable + short dropdown on desktop, iOS-style wheel in a bottom sheet on mobile.

**Architecture:** Pure-logic helpers (time parser, inference, dropdown builder) live in `src/lib/time-input.ts` and are fully unit-tested with Vitest. The `TimePicker` component lives at `src/components/ui/TimePicker.tsx` and chooses a variant at runtime via `matchMedia('(pointer: coarse)')` — desktop renders a typeable input with suggestion dropdown, mobile renders a bottom-sheet wheel. Callers continue to pass/receive `"HH:MM"` 24h strings.

**Tech Stack:** React 19, TypeScript 5, Tailwind 4, Vitest for unit tests. No new dependencies.

**Note on component tests:** The repo has Vitest configured for pure-logic tests only (no jsdom / @testing-library/react). This plan unit-tests the parser and inference helpers, and verifies component behavior manually in the browser against the live dev server. Adding jsdom + testing-library is out of scope.

---

## File Structure

**Create:**
- `src/lib/time-input.ts` — pure parser + inference + dropdown helpers
- `src/lib/__tests__/time-input.test.ts` — Vitest tests for the above
- `src/components/ui/TimePicker.tsx` — the component (both variants)

**Modify:**
- `src/components/ui/index.ts` — export `TimePicker`
- `src/app/dashboard/page.tsx` — swap 6 time-input usages (3 modals × 2 fields), delete `generateTimeOptions`

---

## Task 1: Parser — `parseTimeInput`

Parses arbitrary user typing into a canonical `"HH:MM"` string or `null`. The core risky piece — fully unit-tested.

**Files:**
- Create: `src/lib/time-input.ts`
- Create: `src/lib/__tests__/time-input.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/__tests__/time-input.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTimeInput } from '@/lib/time-input';

describe('parseTimeInput — suffix forms', () => {
  it('parses "9a" as 09:00', () => {
    expect(parseTimeInput('9a')).toBe('09:00');
  });
  it('parses "9am" as 09:00', () => {
    expect(parseTimeInput('9am')).toBe('09:00');
  });
  it('parses "9 AM" as 09:00', () => {
    expect(parseTimeInput('9 AM')).toBe('09:00');
  });
  it('parses "9p" as 21:00', () => {
    expect(parseTimeInput('9p')).toBe('21:00');
  });
  it('parses "12pm" as 12:00 (noon)', () => {
    expect(parseTimeInput('12pm')).toBe('12:00');
  });
  it('parses "12am" as 00:00 (midnight)', () => {
    expect(parseTimeInput('12am')).toBe('00:00');
  });
  it('parses "9:05 pm" as 21:05', () => {
    expect(parseTimeInput('9:05 pm')).toBe('21:05');
  });
});

describe('parseTimeInput — numeric forms without suffix', () => {
  it('parses "9" as 09:00 (AM default)', () => {
    expect(parseTimeInput('9')).toBe('09:00');
  });
  it('parses "905" as 09:05', () => {
    expect(parseTimeInput('905')).toBe('09:05');
  });
  it('parses "9:05" as 09:05', () => {
    expect(parseTimeInput('9:05')).toBe('09:05');
  });
  it('parses "9 30" as 09:30 (space separator)', () => {
    expect(parseTimeInput('9 30')).toBe('09:30');
  });
  it('parses "13" as 13:00 (24h interpretation for >12)', () => {
    expect(parseTimeInput('13')).toBe('13:00');
  });
  it('parses "1305" as 13:05', () => {
    expect(parseTimeInput('1305')).toBe('13:05');
  });
  it('parses "21:05" as 21:05', () => {
    expect(parseTimeInput('21:05')).toBe('21:05');
  });
  it('parses "0" as 00:00', () => {
    expect(parseTimeInput('0')).toBe('00:00');
  });
  it('parses "12" as 12:00 (noon)', () => {
    expect(parseTimeInput('12')).toBe('12:00');
  });
});

describe('parseTimeInput — contextHalfDay biasing', () => {
  it('bare "2" with contextHalfDay=PM becomes 14:00', () => {
    expect(parseTimeInput('2', { contextHalfDay: 'PM' })).toBe('14:00');
  });
  it('bare "2" with contextHalfDay=AM stays 02:00', () => {
    expect(parseTimeInput('2', { contextHalfDay: 'AM' })).toBe('02:00');
  });
  it('contextHalfDay does not override explicit suffix', () => {
    expect(parseTimeInput('2am', { contextHalfDay: 'PM' })).toBe('02:00');
  });
  it('contextHalfDay does not apply to 24h numbers >12', () => {
    expect(parseTimeInput('14', { contextHalfDay: 'AM' })).toBe('14:00');
  });
  it('bare "12" with contextHalfDay=PM stays 12:00 (noon)', () => {
    expect(parseTimeInput('12', { contextHalfDay: 'PM' })).toBe('12:00');
  });
  it('bare "12" with contextHalfDay=AM flips to 00:00 (midnight)', () => {
    expect(parseTimeInput('12', { contextHalfDay: 'AM' })).toBe('00:00');
  });
});

describe('parseTimeInput — invalid input', () => {
  it('returns null for empty string', () => {
    expect(parseTimeInput('')).toBeNull();
  });
  it('returns null for whitespace only', () => {
    expect(parseTimeInput('   ')).toBeNull();
  });
  it('returns null for letters only', () => {
    expect(parseTimeInput('abc')).toBeNull();
  });
  it('returns null for hours >= 24', () => {
    expect(parseTimeInput('25')).toBeNull();
  });
  it('returns null for minutes >= 60', () => {
    expect(parseTimeInput('9:75')).toBeNull();
  });
  it('returns null for negative numbers', () => {
    expect(parseTimeInput('-1')).toBeNull();
  });
  it('returns null for "13pm" (13 with pm is contradictory)', () => {
    expect(parseTimeInput('13pm')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test file to verify it fails**

Run: `npx vitest run src/lib/__tests__/time-input.test.ts`
Expected: All tests fail with `Cannot find module '@/lib/time-input'` or similar.

- [ ] **Step 3: Implement `parseTimeInput`**

Create `src/lib/time-input.ts`:

```ts
export type HalfDay = 'AM' | 'PM';

export interface ParseOptions {
  /** Bias AM/PM when the user types a bare 1–11 with no suffix. */
  contextHalfDay?: HalfDay;
}

/**
 * Parse a free-text time string into canonical "HH:MM" (24h).
 * Returns null if the input cannot be unambiguously interpreted.
 */
export function parseTimeInput(raw: string, opts: ParseOptions = {}): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  // Detect am/pm suffix (with or without space/period).
  const suffixMatch = trimmed.match(/\s*(a\.?m\.?|p\.?m\.?|a|p)\s*$/);
  const hasPM = suffixMatch ? /^p/.test(suffixMatch[1]) : false;
  const hasAM = suffixMatch ? /^a/.test(suffixMatch[1]) : false;
  const body = suffixMatch ? trimmed.slice(0, -suffixMatch[0].length).trim() : trimmed;

  // Extract hour and minute from the body.
  let hour: number;
  let minute: number;

  if (/^\d{1,2}[:\s]\d{1,2}$/.test(body)) {
    // "9:05", "13:5", "9 30"
    const [h, m] = body.split(/[:\s]/).map(Number);
    hour = h;
    minute = m;
  } else if (/^\d+$/.test(body)) {
    // Pure digits: "9", "905", "21", "1305"
    if (body.length <= 2) {
      hour = Number(body);
      minute = 0;
    } else if (body.length === 3) {
      hour = Number(body.slice(0, 1));
      minute = Number(body.slice(1));
    } else if (body.length === 4) {
      hour = Number(body.slice(0, 2));
      minute = Number(body.slice(2));
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || minute < 0 || minute >= 60) return null;

  // Apply AM/PM logic.
  if (hasAM || hasPM) {
    if (hour < 1 || hour > 12) return null; // "13pm" etc. is nonsense
    if (hasAM) hour = hour === 12 ? 0 : hour;
    if (hasPM) hour = hour === 12 ? 12 : hour + 12;
  } else {
    // No suffix — apply 24h rules + context bias.
    if (hour >= 24) return null;
    if (hour >= 13) {
      // Leave as 24h interpretation.
    } else if (opts.contextHalfDay === 'PM') {
      if (hour === 12) {
        // noon stays 12
      } else {
        hour += 12;
      }
    } else if (opts.contextHalfDay === 'AM') {
      if (hour === 12) hour = 0;
    }
    // Otherwise (no context): hour stays as typed (1–12 → 01:00–12:00, 0 → 00:00).
  }

  if (hour >= 24) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/time-input.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time-input.ts src/lib/__tests__/time-input.test.ts
git commit -m "Add time-input parser with AM/PM inference and contextHalfDay biasing"
```

---

## Task 2: Dropdown helpers — `nearbySteppedTimes`, `snapToStep`

Utilities to generate the 6–8 suggestion slots around the current value and to highlight the nearest stepped slot when the current value is off-step.

**Files:**
- Modify: `src/lib/time-input.ts`
- Modify: `src/lib/__tests__/time-input.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/__tests__/time-input.test.ts`:

```ts
import { nearbySteppedTimes, snapToStep } from '@/lib/time-input';

describe('snapToStep', () => {
  it('leaves an on-step value unchanged', () => {
    expect(snapToStep('09:05', 5)).toBe('09:05');
  });
  it('snaps 09:07 down to 09:05 with step 5', () => {
    expect(snapToStep('09:07', 5)).toBe('09:05');
  });
  it('snaps 09:08 up to 09:10 with step 5', () => {
    expect(snapToStep('09:08', 5)).toBe('09:10');
  });
  it('snaps across hour boundary: 09:58 → 10:00 with step 5', () => {
    expect(snapToStep('09:58', 5)).toBe('10:00');
  });
  it('snaps with step 30: 09:15 → 09:30', () => {
    expect(snapToStep('09:15', 30)).toBe('09:30');
  });
});

describe('nearbySteppedTimes', () => {
  it('returns 7 slots centered on the current value by default', () => {
    const slots = nearbySteppedTimes('09:00', 5);
    expect(slots).toHaveLength(7);
    expect(slots).toContain('09:00');
  });
  it('respects the count option', () => {
    expect(nearbySteppedTimes('09:00', 5, 3)).toHaveLength(3);
  });
  it('clamps at day start (never returns negative times)', () => {
    const slots = nearbySteppedTimes('00:00', 5, 7);
    expect(slots[0]).toBe('00:00');
  });
  it('clamps at day end (never returns times past 23:55)', () => {
    const slots = nearbySteppedTimes('23:55', 5, 7);
    expect(slots[slots.length - 1]).toBe('23:55');
  });
  it('uses the nearest stepped time as the anchor for off-step values', () => {
    // 09:07 with step 5 should anchor around 09:05
    const slots = nearbySteppedTimes('09:07', 5, 3);
    expect(slots).toContain('09:05');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/time-input.test.ts`
Expected: `snapToStep` and `nearbySteppedTimes` tests fail with "not a function".

- [ ] **Step 3: Implement helpers**

Append to `src/lib/time-input.ts`:

```ts
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Round a time to the nearest `step` minutes. Ties round up. */
export function snapToStep(time: string, step: number): string {
  const mins = toMinutes(time);
  const snapped = Math.round(mins / step) * step;
  const clamped = Math.max(0, Math.min(24 * 60 - step, snapped));
  return fromMinutes(clamped);
}

/**
 * Build a list of stepped times around `anchor`, clamped to [00:00, 23:55].
 * The anchor itself is included if on-step; otherwise the nearest stepped
 * time is used.
 */
export function nearbySteppedTimes(anchor: string, step: number, count = 7): string[] {
  const anchorSnapped = snapToStep(anchor, step);
  const anchorMin = toMinutes(anchorSnapped);
  const half = Math.floor(count / 2);
  const first = Math.max(0, anchorMin - half * step);
  const lastMax = 24 * 60 - step; // 23:55 for step=5
  const slots: string[] = [];
  for (let i = 0; i < count; i++) {
    const m = first + i * step;
    if (m > lastMax) break;
    slots.push(fromMinutes(m));
  }
  return slots;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/time-input.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time-input.ts src/lib/__tests__/time-input.test.ts
git commit -m "Add snapToStep and nearbySteppedTimes helpers"
```

---

## Task 3: Device detection hook — `usePointerType`

Tells the component whether the current device is coarse-pointer (touch) or fine-pointer (mouse). Listens for resize / media-query changes.

**Files:**
- Create: `src/hooks/usePointerType.ts`

- [ ] **Step 1: Create the hook file**

Create `src/hooks/usePointerType.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

export type PointerType = 'fine' | 'coarse';

/**
 * Returns 'coarse' when the primary pointer is touch (phones, tablets),
 * 'fine' otherwise (mice, trackpads). Updates live if the user rotates
 * the device or plugs in a mouse.
 */
export function usePointerType(): PointerType {
  const [pointer, setPointer] = useState<PointerType>('fine');

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const update = () => setPointer(mql.matches ? 'coarse' : 'fine');
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return pointer;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePointerType.ts
git commit -m "Add usePointerType hook for device-based UI selection"
```

---

## Task 4: TimePicker — desktop variant (typeable + dropdown)

The desktop experience: typeable input with smart parsing, dropdown of nearby 5-min slots, keyboard navigation, blur-revert-on-invalid.

**Files:**
- Create: `src/components/ui/TimePicker.tsx`

- [ ] **Step 1: Create the component file with the desktop variant**

Create `src/components/ui/TimePicker.tsx`:

```tsx
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
  value: string;                   // "HH:MM" 24h
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  ariaLabel?: string;
  step?: number;                   // default 5
  contextHalfDay?: HalfDay;        // bias AM/PM inference for typed bare numbers
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
    // Mobile variant added in Task 5.
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

// --- DESKTOP ---------------------------------------------------------------

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

  // Re-sync display when external value changes and we're not mid-edit.
  useEffect(() => {
    if (!editing) setRaw(formatTimeDisplay(value));
  }, [value, editing]);

  const slots = useMemo(() => nearbySteppedTimes(value, step, 7), [value, step]);
  const snappedValue = useMemo(() => snapToStep(value, step), [value, step]);
  const currentHighlight = highlight ?? snappedValue;

  // Close on outside click.
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
      setRaw(formatTimeDisplay(value)); // revert
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
    // Live-parse to update highlight if possible.
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
    } else if (e.key === 'Tab') {
      // commit happens via onBlur
    }
  }

  function onBlur() {
    // Defer slightly so dropdown clicks can fire first.
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
                onMouseDown={(e) => e.preventDefault()} // keep input focused
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

// --- MOBILE (stub for Task 5) ---------------------------------------------

function TimePickerMobile(props: Omit<TimePickerProps, 'contextHalfDay'>) {
  // Implemented in Task 5.
  return <TimePickerDesktop {...props} contextHalfDay={undefined} />;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/TimePicker.tsx
git commit -m "Add TimePicker desktop variant (typeable + dropdown)"
```

---

## Task 5: TimePicker — mobile variant (iOS-style wheel bottom sheet)

Replaces the mobile stub with a proper bottom-sheet wheel picker. Three scroll-snapped columns: hour (1–12), minute (00, 05, ..., 55), AM/PM.

**Files:**
- Modify: `src/components/ui/TimePicker.tsx`

- [ ] **Step 1: Replace the `TimePickerMobile` stub**

In `src/components/ui/TimePicker.tsx`, replace the entire `TimePickerMobile` function with:

```tsx
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
  const initialHour12 = ((h24 + 11) % 12) + 1; // 0→12, 13→1, etc.

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
          {/* Selection bars */}
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
  const PADDING = 72; // = 2 × ROW_H so the first and last items can center

  // Scroll to selected on mount / when `selected` changes externally.
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
    // Snap visually.
    containerRef.current.scrollTo({ top: clamped * ROW_H, behavior: 'smooth' });
  }

  return (
    <div
      ref={containerRef}
      onScroll={() => {
        // debounce via rAF-chain — we snap on the final scroll position.
        if ((containerRef.current as HTMLDivElement & { __snapT?: number }).__snapT) {
          clearTimeout((containerRef.current as HTMLDivElement & { __snapT?: number }).__snapT);
        }
        (containerRef.current as HTMLDivElement & { __snapT?: number }).__snapT = window.setTimeout(onScrollEnd, 80);
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
```

- [ ] **Step 2: Add `no-scrollbar` utility to globals.css if not present**

Check `src/app/globals.css`. If it does not already define `.no-scrollbar`, append:

```css
@layer utilities {
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
}
```

(Skip this step if `.no-scrollbar` already exists.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/TimePicker.tsx src/app/globals.css
git commit -m "Add TimePicker mobile variant (iOS-style wheel bottom sheet)"
```

---

## Task 6: Export `TimePicker` from the UI barrel

**Files:**
- Modify: `src/components/ui/index.ts`

- [ ] **Step 1: Add the export**

Edit `src/components/ui/index.ts`, add the line after the `DatePicker` export:

```ts
export { TimePicker } from './TimePicker';
```

The resulting file:

```ts
export { Button } from './Button';
export { Input } from './Input';
export { Select } from './Select';
export { Modal } from './Modal';
export { DatePicker } from './DatePicker';
export { TimePicker } from './TimePicker';
export { PhoneInput } from './PhoneInput';
export { ToastProvider, useToast } from './Toast';
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/index.ts
git commit -m "Export TimePicker from ui barrel"
```

---

## Task 7: Swap Add Class modal

Replace both `<select>` elements in the Add Class modal with `<TimePicker>`. The end-time field receives `contextHalfDay` derived from the current start-time value.

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add the import**

Find the existing UI imports near the top of `src/app/dashboard/page.tsx`. Add `TimePicker` to the import from `@/components/ui`:

```ts
import { Button, Input, Select, Modal, DatePicker, TimePicker } from '@/components/ui';
```

(If the current import is different, merge `TimePicker` into it. Do not duplicate.)

- [ ] **Step 2: Replace both `<select>` elements**

Locate the block around line 1842–1857 (the `grid grid-cols-2 gap-2` containing the two `<select>` time pickers inside the Add Class modal's WHEN section). Replace the entire block with:

```tsx
<div className="grid grid-cols-2 gap-2">
  <TimePicker
    id="lessonStartTime"
    value={lessonStartTime}
    onChange={(newStart) => {
      setLessonEndTime(shiftEndTime(lessonStartTime, lessonEndTime, newStart));
      setLessonStartTime(newStart);
    }}
    ariaLabel="Start time"
  />
  <TimePicker
    id="lessonEndTime"
    value={lessonEndTime}
    onChange={setLessonEndTime}
    ariaLabel="End time"
    contextHalfDay={Number(lessonStartTime.split(':')[0]) >= 12 ? 'PM' : 'AM'}
  />
</div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Manual verification in the browser**

Run `npm run dev`. Open `http://localhost:3000/dashboard`, trigger the Add Class modal. Verify:
- Start/end fields show as typeable inputs (desktop) or tappable fields (mobile).
- Typing `9` commits `9:00 AM`; `905` → `9:05 AM`; `9p` → `9:00 PM`.
- Start-time change shifts end by the same delta.
- Dropdown shows ~7 5-min slots centered on the current value.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Swap Add Class modal time pickers to TimePicker"
```

---

## Task 8: Swap Reschedule modal

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace both `<Input type="time">` elements**

Locate the block around line 1326–1342 (the `grid grid-cols-2 gap-3` inside the Reschedule modal with two `<Input type="time">`). Replace it with:

```tsx
<div className="grid grid-cols-2 gap-3">
  <TimePicker
    id="rescheduleStartTime"
    label="Start Time"
    value={rescheduleStartTime}
    onChange={setRescheduleStartTime}
  />
  <TimePicker
    id="rescheduleEndTime"
    label="End Time"
    value={rescheduleEndTime}
    onChange={setRescheduleEndTime}
    contextHalfDay={Number(rescheduleStartTime.split(':')[0]) >= 12 ? 'PM' : 'AM'}
  />
</div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

In the browser, open a class on today's Today list, click Reschedule. Verify the two time fields behave as `TimePicker` (typeable + dropdown on desktop, wheel sheet on touch devices).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Swap Reschedule modal time pickers to TimePicker"
```

---

## Task 9: Swap Edit Class modal

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace both `<Input type="time">` elements**

Locate the block around line 1484–1505 (the `grid grid-cols-2 gap-3` inside the Edit Class modal with two `<Input type="time">`). Replace it with:

```tsx
<div className="grid grid-cols-2 gap-3">
  <TimePicker
    id="editStartTime"
    label="Start Time"
    value={editStartTime}
    onChange={(newStart) => {
      if (editStartTime && editEndTime) {
        setEditEndTime(shiftEndTime(editStartTime, editEndTime, newStart));
      }
      setEditStartTime(newStart);
    }}
  />
  <TimePicker
    id="editEndTime"
    label="End Time"
    value={editEndTime}
    onChange={setEditEndTime}
    contextHalfDay={Number(editStartTime.split(':')[0]) >= 12 ? 'PM' : 'AM'}
  />
</div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

Open an existing recurring booking and click Edit. Verify the two time fields render as `TimePicker`, start-time change shifts end.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Swap Edit Class modal time pickers to TimePicker"
```

---

## Task 10: Delete `generateTimeOptions`

Now that no caller references it, remove the dead helper.

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -n "generateTimeOptions" src/app/dashboard/page.tsx`
Expected: Only the function definition at line 225 remains (no call sites).

- [ ] **Step 2: Delete the function**

Delete lines corresponding to this block (around line 225–233):

```ts
  const generateTimeOptions = () => {
    const options: string[] = [];
    for (let h = 6; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return options;
  };
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "Remove dead generateTimeOptions helper"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass (parser tests + existing tests).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Build succeeds, all 12 static pages generated.

- [ ] **Step 4: Full manual verification in browser**

In `npm run dev`, walk through every time-picker path:

Desktop (mouse/trackpad):
- Add Class: open modal, type times in both fields, use dropdown, use arrows + Enter.
- Reschedule: open, set times, confirm.
- Edit Class: open, change start — end shifts.
- Try invalid input (`abc`, `25`, `9:75`) — red border, revert on blur.
- Try `contextHalfDay`: set start to 2 PM (type `2p`), click end and type `3` — should become 3 PM.

Mobile (open in Chrome devtools mobile emulation or on a phone):
- Tap each field — bottom sheet wheel opens.
- Scroll columns, tap Done, verify committed value.
- Tap outside — dismisses without change.

- [ ] **Step 5: No commit needed** — this is verification only.

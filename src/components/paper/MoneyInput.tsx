'use client';

import { useEffect, useState } from 'react';
import { centsToInputValue, parseMoneyToCents } from '@/lib/money';

/**
 * Money field. State is cents; the box shows ringgit.
 *
 * It keeps the typed text in a local draft rather than re-deriving it from the
 * cents value on every keystroke. Without that, typing "150." would parse to
 * 15000, re-render as "150", and swallow the decimal point the moment you typed
 * it — making cents impossible to enter.
 *
 * The draft resyncs only when the parent's value diverges from what the draft
 * parses to, i.e. when something other than this input changed it.
 */
export function MoneyInput({
  valueCents,
  onChangeCents,
  placeholder = '0',
  className = '',
  style,
  min = 0,
}: {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  min?: number;
}) {
  const [draft, setDraft] = useState(() => centsToInputValue(valueCents));

  useEffect(() => {
    if ((parseMoneyToCents(draft) ?? 0) !== valueCents) {
      setDraft(centsToInputValue(valueCents));
    }
    // `draft` is deliberately not a dependency: this syncs external changes in,
    // and including it would fight the user's own typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueCents]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        // Allow only digits and a single decimal point while typing.
        if (next !== '' && !/^\d*\.?\d{0,2}$/.test(next)) return;
        setDraft(next);
        const cents = parseMoneyToCents(next) ?? 0;
        onChangeCents(min != null && cents < min ? min : cents);
      }}
      className={className}
      style={style}
    />
  );
}

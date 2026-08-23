'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterOptionGroups } from '@/lib/combobox-filter';
import type { OptionGroup } from '@/lib/combobox-filter';
import { usePointerType } from '@/hooks/usePointerType';
import { IconChevD, IconSearch } from './Icons';

/**
 * Grouped, searchable picker.
 *
 * Expands inline rather than floating: PaperModal's sheet is `overflow-hidden`
 * and its body `overflow-y-auto`, so an absolutely-positioned panel would be
 * clipped. Pushing content down keeps it visible without portal gymnastics.
 */
export function ComboBox({
  groups,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No matches',
  inputClassName = '',
  inputStyle,
}: {
  groups: OptionGroup[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const listId = useId();

  const pointer = usePointerType();
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterOptionGroups(groups, query), [groups, query]);
  // Flattened for keyboard traversal — headers aren't focusable.
  const flat = useMemo(() => filtered.flatMap((g) => g.options), [filtered]);
  // Same groups, each option tagged with its position in `flat`.
  const indexed = useMemo(() => {
    let i = 0;
    return filtered.map((g) => ({
      label: g.label,
      options: g.options.map((o) => ({ ...o, idx: i++ })),
    }));
  }, [filtered]);

  const selectedLabel = useMemo(() => {
    for (const g of groups) {
      const hit = g.options.find((o) => o.value === value);
      if (hit) return hit.label;
    }
    return '';
  }, [groups, value]);

  // Close on any click outside the wrapper.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // On open: clear the query, bring the panel into view, focus search on desktop.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    panelRef.current?.scrollIntoView({ block: 'nearest' });
    // Autofocusing on touch pops the keyboard over the list.
    if (pointer === 'fine') searchRef.current?.focus();
  }, [open, pointer]);

  // Keep the highlighted row visible as it moves.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-idx="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (!open) return;
      // Stop the modal's document-level Escape listener from closing it too.
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (flat.length === 0 ? 0 : (h + 1) % flat.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (flat.length === 0 ? 0 : (h - 1 + flat.length) % flat.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = flat[highlight];
      if (opt) commit(opt.value);
    }
  };

  return (
    <div ref={wrapRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={`${inputClassName} flex items-center justify-between text-left`}
        style={inputStyle}
      >
        <span
          className="truncate"
          style={{ color: selectedLabel ? 'var(--ink)' : 'var(--ink-3)' }}
        >
          {selectedLabel || placeholder}
        </span>
        <span style={{ color: 'var(--ink-3)' }} className="shrink-0 ml-2">
          <IconChevD size={16} />
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="mt-1.5 rounded-[10px] border overflow-hidden"
          style={{ background: 'var(--panel)', borderColor: 'var(--line-2)' }}
        >
          <div
            className="flex items-center gap-2 px-2.5 border-b"
            style={{ borderColor: 'var(--line)' }}
          >
            <span style={{ color: 'var(--ink-3)' }} className="shrink-0">
              <IconSearch size={14} />
            </span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent outline-none text-[13.5px] py-2.5"
              style={{ color: 'var(--ink)' }}
            />
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="overflow-y-auto no-scrollbar py-1"
            style={{ maxHeight: 220 }}
          >
            {flat.length === 0 ? (
              <div className="px-3 py-3 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                {emptyLabel}
              </div>
            ) : (
              indexed.map((g) => (
                <div key={g.label || '__ungrouped'}>
                  {g.label && (
                    <div
                      className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase"
                      style={{ color: 'var(--ink-3)', letterSpacing: '0.05em' }}
                    >
                      {g.label}
                    </div>
                  )}
                  {g.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      data-idx={o.idx}
                      onMouseEnter={() => setHighlight(o.idx)}
                      onClick={() => commit(o.value)}
                      className="w-full text-left px-3 py-2 text-[13.5px] truncate"
                      style={{
                        background: o.idx === highlight ? 'var(--bg)' : 'transparent',
                        color: 'var(--ink)',
                        fontWeight: o.value === value ? 600 : 400,
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

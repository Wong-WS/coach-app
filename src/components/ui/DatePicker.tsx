'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { formatDateMedium, parseDateString } from '@/lib/date-format';
import 'react-day-picker/style.css';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

function toDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function DatePicker({ value, onChange, placeholder = 'Select date', className = '', ariaLabel }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = value ? parseDateString(value) : undefined;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-full text-left rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between gap-2 ${className}`}
      >
        <span className={selected ? '' : 'text-gray-400 dark:text-zinc-500'}>
          {selected ? formatDateMedium(selected) : placeholder}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0">
          <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zM3.5 7.5v7.75c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V7.5h-13z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute z-20 mt-1 rounded-xl border border-gray-200 dark:border-[#333] bg-white dark:bg-[#1a1a1a] shadow-lg p-2"
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(toDateString(d));
                setOpen(false);
              }
            }}
            weekStartsOn={1}
            showOutsideDays
            classNames={{
              root: 'rdp text-sm text-gray-900 dark:text-zinc-100',
              months: 'flex flex-col gap-2',
              month: 'space-y-2',
              month_caption: 'flex items-center justify-center pt-1 pb-2 font-medium text-gray-900 dark:text-zinc-100',
              nav: 'absolute top-2 right-2 flex items-center gap-1',
              button_previous: 'inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700',
              button_next: 'inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700',
              month_grid: 'w-full border-collapse',
              weekdays: 'flex',
              weekday: 'w-9 h-8 flex items-center justify-center text-[11px] font-medium text-gray-500 dark:text-zinc-500',
              week: 'flex w-full',
              day: 'w-9 h-9 p-0 text-center',
              day_button: 'w-9 h-9 rounded-md text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:pointer-events-none',
              selected: '[&_button]:bg-blue-600 [&_button]:text-white [&_button:hover]:bg-blue-700 dark:[&_button:hover]:bg-blue-500',
              today: '[&_button]:ring-1 [&_button]:ring-blue-500/60',
              outside: '[&_button]:text-gray-400 dark:[&_button]:text-zinc-600',
              disabled: '[&_button]:opacity-40 [&_button]:pointer-events-none',
            }}
            components={{
              Chevron: ({ orientation }) => (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 ${orientation === 'left' ? '' : orientation === 'right' ? 'rotate-180' : ''}`}>
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 010 1.06L9.06 10l3.73 3.71a.75.75 0 11-1.06 1.08l-4.25-4.25a.75.75 0 010-1.08l4.25-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                </svg>
              ),
            }}
          />
        </div>
      )}
    </div>
  );
}

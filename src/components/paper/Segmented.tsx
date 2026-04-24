'use client';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const padClass = size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]';
  return (
    <div className="inline-flex rounded-[10px] p-[3px]" style={{ background: 'var(--line)' }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`${padClass} rounded-[7px] font-medium transition-colors`}
            style={{
              background: active ? 'var(--panel)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

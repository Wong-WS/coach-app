'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

const sizeClass: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-[12.5px]',
  md: 'px-3.5 py-2 text-[13.5px]',
  lg: 'px-4 py-2.5 text-[14px]',
};

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = 'outline', size = 'md', full, className = '', style, children, ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[8px] font-medium whitespace-nowrap border transition-colors disabled:opacity-55 disabled:cursor-not-allowed';

  let variantStyle: React.CSSProperties = {};
  let variantClass = '';
  if (variant === 'primary') {
    variantStyle = { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'transparent' };
    variantClass = 'hover:brightness-110';
  } else if (variant === 'accent') {
    variantStyle = { background: 'var(--accent)', color: '#fff', borderColor: 'transparent' };
    variantClass = 'hover:brightness-110';
  } else if (variant === 'ghost') {
    variantStyle = { background: 'transparent', color: 'var(--ink-2)', borderColor: 'transparent' };
    variantClass = 'hover:bg-[var(--line)] hover:text-[var(--ink)]';
  } else {
    variantStyle = { background: 'var(--panel)', color: 'var(--ink)', borderColor: 'var(--line-2)' };
    variantClass = 'hover:border-[var(--ink-3)]';
  }

  return (
    <button
      ref={ref}
      className={`${base} ${sizeClass[size]} ${variantClass} ${full ? 'w-full' : ''} ${className}`}
      style={{ ...variantStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
});

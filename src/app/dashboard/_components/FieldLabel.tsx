export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11.5px] font-semibold uppercase mb-1.5"
      style={{ color: 'var(--ink-3)', letterSpacing: '0.04em' }}
    >
      {children}
    </label>
  );
}

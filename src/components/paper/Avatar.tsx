export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const parts = (name || '?').trim().split(/\s+/);
  const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const hue = h % 360;
  return (
    <div
      className="inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `oklch(0.88 0.04 ${hue})`,
        color: `oklch(0.35 0.08 ${hue})`,
        fontSize: size * 0.38,
        letterSpacing: '-0.3px',
      }}
    >
      {initials}
    </div>
  );
}

export default function PortalNotFound() {
  return (
    <div className="py-16 text-center">
      <div
        className="text-[15px] font-semibold mb-1"
        style={{ color: 'var(--ink)' }}
      >
        Link no longer active
      </div>
      <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
        Please contact your coach for a new link.
      </div>
    </div>
  );
}

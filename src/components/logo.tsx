export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo" aria-label="T-Calendar">
      <span className="logo-mark" aria-hidden="true"><span>T</span></span>
      {!compact && <strong>T-Calendar</strong>}
    </div>
  );
}

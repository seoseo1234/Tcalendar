export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? "logo-compact" : ""}`} aria-label="T-Calendar">
      <img src="/brand/t-calendar-logo.png" alt="" aria-hidden="true" />
    </div>
  );
}

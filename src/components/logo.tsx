import Image from "next/image";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? "logo-compact" : ""}`} aria-label="T-Calendar">
      <Image src="/brand/t-calendar-logo.png" width={180} height={48} alt="" aria-hidden="true" priority />
    </div>
  );
}

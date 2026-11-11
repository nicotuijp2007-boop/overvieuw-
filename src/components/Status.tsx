import type { Level } from "@/lib/format";

export const STATUS: Record<Level, { label: string; fill: string; track: string }> = {
  ok: { label: "OK", fill: "bg-ok", track: "bg-ok/15" },
  warn: { label: "Watch", fill: "bg-warn", track: "bg-warn/20" },
  danger: { label: "Critical", fill: "bg-danger", track: "bg-danger/15" },
};

/** Status shape: never color alone. A check, an exclamation, or a cross. */
export function StatusIcon({ level, className = "h-4 w-4" }: { level: Level; className?: string }) {
  const color = { ok: "text-ok", warn: "text-warn", danger: "text-danger" }[level];
  return (
    <svg viewBox="0 0 16 16" className={`${className} ${color} shrink-0`} aria-hidden>
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      {level === "ok" && <path d="M4.5 8.2 7 10.6l4.6-5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {level === "warn" && (
        <>
          <path d="M8 4v5" stroke="#0b0b0b" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="1.1" fill="#0b0b0b" />
        </>
      )}
      {level === "danger" && <path d="m5.3 5.3 5.4 5.4m0-5.4-5.4 5.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

export function StatusBadge({ level }: { level: Level }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-secondary">
      <StatusIcon level={level} className="h-3.5 w-3.5" />
      {STATUS[level].label}
    </span>
  );
}

/**
 * A meter: the fill carries severity, the track is a lighter step of the same color.
 * The optional tick marks how far into the period we are: a fill past the tick means
 * usage is running ahead of time.
 */
export function Meter({ pct, level, elapsed, label }: { pct: number; level: Level; elapsed?: number; label: string }) {
  const s = STATUS[level];
  return (
    <div className="relative py-1">
      <div
        className={`h-2.5 overflow-hidden rounded-full ${s.track}`}
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${s.fill}`} style={{ width: `${Math.min(Math.max(pct, pct > 0 ? 1.5 : 0), 100)}%` }} />
      </div>
      {elapsed != null && (
        <div
          className="absolute top-0 h-[calc(100%)] w-0.5 -translate-x-1/2 rounded-full bg-text"
          style={{ left: `${elapsed * 100}%` }}
          title={`${Math.round(elapsed * 100)}% of the period has passed`}
          aria-hidden
        />
      )}
    </div>
  );
}

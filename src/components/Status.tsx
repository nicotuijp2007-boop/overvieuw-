import type { Level } from "@/lib/format";
import { Tip } from "./Tip";

export const STATUS: Record<Level, { label: string; rule: string; fill: string; track: string }> = {
  ok: { label: "OK", rule: "meer dan 30% over", fill: "bg-ok", track: "bg-ok/15" },
  warn: { label: "Let op", rule: "10–30% over", fill: "bg-warn", track: "bg-warn/20" },
  danger: { label: "Kritiek", rule: "minder dan 10% over", fill: "bg-danger", track: "bg-danger/15" },
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
    <span className="inline-flex items-center gap-1 font-medium text-secondary">
      <StatusIcon level={level} className="h-3.5 w-3.5" />
      {STATUS[level].label}
    </span>
  );
}

/**
 * A meter of what's LEFT: the fill is the remaining share and carries the status color;
 * the track is a lighter step of the same color. The marker shows how much TIME is left
 * in the period: a fill shorter than the marker means you run out before the reset.
 */
export function Meter({
  leftPct,
  level,
  elapsed,
  resetText,
  label,
}: {
  leftPct: number;
  level: Level;
  elapsed?: number;
  resetText?: string;
  label: string;
}) {
  const s = STATUS[level];
  const timeLeft = elapsed != null ? 1 - elapsed : undefined;
  const align = timeLeft == null ? "center" : timeLeft < 0.25 ? "left" : timeLeft > 0.75 ? "right" : "center";
  return (
    <div className="relative">
      <div
        className={`h-2.5 overflow-hidden rounded-full ${s.track}`}
        role="meter"
        aria-label={`${label}: ${leftPct}% over`}
        aria-valuenow={leftPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${s.fill}`} style={{ width: `${leftPct > 0 ? Math.max(leftPct, 1.5) : 0}%` }} />
      </div>
      {timeLeft != null && elapsed != null && (
        <div className="absolute -top-2 h-[calc(100%+1rem)] -translate-x-1/2" style={{ left: `${timeLeft * 100}%` }}>
          <Tip
            align={align}
            className="h-full w-6 justify-center"
            text={`${Math.round(elapsed * 100)}% van de periode verstreken${resetText ? ` · reset ${resetText}` : ""}. Balk korter dan dit streepje = op vóór de reset.`}
          >
            <span className="mt-1.5 block h-[calc(100%-0.75rem)] w-0.5 rounded-full bg-text" />
          </Tip>
        </div>
      )}
    </div>
  );
}

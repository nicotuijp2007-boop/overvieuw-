import { formatDuration, formatNumber } from "./format";
import type { Headroom } from "./headroom";

/** Shared Dutch texts for limits, used by the page (and later the widget API). */

/** "28% over" for percentage limits; "165 credits over" otherwise. */
export function leftText(h: Headroom): string {
  if (h.metric.unit === "%") return `${h.leftPct}% over`;
  return `${formatNumber(h.remaining)} ${h.metric.unit} over`;
}

export function usedText(h: Headroom): string {
  const m = h.metric;
  if (m.unit === "%") return `${h.usedPct}% gebruikt`;
  return `${formatNumber(m.used)} van ${formatNumber(m.limit ?? 0)} ${m.unit} gebruikt`;
}

/** The urgency line: when it runs out, or what's expected at the reset. */
export function urgencyText(h: Headroom, now: number): { text: string; urgent: boolean } | null {
  if (h.metric.used >= (h.metric.limit ?? Infinity)) return { text: "Limiet bereikt", urgent: true };
  if (h.runsOutAt) return { text: `Op over ~${formatDuration(Date.parse(h.runsOutAt) - now)}, vóór de reset`, urgent: true };
  if (h.projectedPct != null) {
    return { text: `Bij dit tempo ~${Math.max(100 - Math.round(h.projectedPct), 0)}% over bij de reset`, urgent: false };
  }
  return null;
}

/** Limits with nothing to watch: no reset, OK, at least half left. Shown small. */
export function isAmple(h: Headroom): boolean {
  return !h.metric.resetsAt && h.level === "ok" && !h.runsOutAt && h.leftPct >= 50;
}

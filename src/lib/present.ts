import type { ServiceResult } from "./runner";
import { formatDuration, formatNumber, type Level } from "./format";
import { byUrgency, headroom, type Headroom } from "./headroom";

/**
 * Presentation shared by the dashboard page and /api/widget: which limits there are, in
 * which order, and the Dutch sentences that describe them. One source, so both say the same.
 */

/** "28% over" for percentage limits; "165 credits over" otherwise. */
export function leftText(h: Headroom): string {
  if (h.metric.unit === "%") return `${h.leftPct}% over`;
  return `${formatNumber(h.remaining)} ${h.metric.unit} over`;
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

export interface Problem {
  service: string;
  name: string;
  /** True when the failed source still shows its last known values. */
  hasValues: boolean;
  message: string;
}

export interface LimitsView {
  /** Limits per service id, in the service's own order. */
  byService: Map<string, Headroom[]>;
  /** Every limit, most urgent first. */
  all: Headroom[];
  /** Sources that failed this time. */
  problems: Problem[];
}

/** Turn connector results into limits (what's left), sorted by urgency, plus the failed sources. */
export function limitsView(results: ServiceResult[], now: number): LimitsView {
  const byService = new Map<string, Headroom[]>();
  for (const r of results) byService.set(r.id, r.metrics.flatMap((m) => headroom(m, r.name, now) ?? []));
  const all = [...byService.values()].flat().sort(byUrgency);
  const problems = results
    .filter((r) => r.error && r.id !== "_manual")
    .map((r) => ({ service: r.id, name: r.name, hasValues: Boolean(r.staleSince), message: r.error ?? "" }));
  return { byService, all, problems };
}

/** How many limits have each status. */
export function levelCounts(items: Headroom[]): Record<Level, number> {
  const counts: Record<Level, number> = { ok: 0, warn: 0, danger: 0 };
  for (const h of items) counts[h.level]++;
  return counts;
}

export interface Headline {
  /** Status for the icon in front of the sentence; null when there are no limits. */
  level: Level | null;
  /** The bold part. */
  title: string;
  /** The rest of the sentence (may be empty). */
  detail: string;
}

/**
 * The status bar's sentence: the most urgent limit when it needs attention,
 * otherwise "Alles binnen marge" with the tightest limit. `items` must be sorted by urgency.
 */
export function headline(items: Headroom[], now: number): Headline {
  const top = items[0];
  if (!top) return { level: null, title: "Nog geen limieten.", detail: "" };
  const urgency = urgencyText(top, now);
  if (top.level !== "ok" || urgency?.urgent) {
    const tail = urgency ? ` · ${urgency.text.charAt(0).toLowerCase()}${urgency.text.slice(1)}` : "";
    return { level: top.level, title: `${top.serviceName} · ${top.metric.metric}`, detail: `${leftText(top)}${tail}` };
  }
  return { level: "ok", title: "Alles binnen marge", detail: `· krapst: ${top.serviceName} ${top.metric.metric}, ${leftText(top)}` };
}

/** The headline as one line of plain text. */
export function headlineText(h: Headline): string {
  return h.detail ? `${h.title} ${h.detail}` : h.title;
}

/** One line per failed source, as shown under the status bar. */
export function problemText(p: Pick<Problem, "name" | "hasValues">): string {
  return p.hasValues ? `${p.name} kon niet verversen (laatst bekende waarden)` : `${p.name} kon niet laden`;
}

/** "73% gebruikt", or "4,6 van 5 GB gebruikt" for limits with an absolute unit. */
export function usedText(h: Headroom): string {
  const m = h.metric;
  if (m.unit === "%") return `${h.usedPct}% gebruikt`;
  return `${formatNumber(m.used)} van ${formatNumber(m.limit ?? 0)} ${m.unit} gebruikt`;
}

/** Limits with nothing to watch: no reset, OK, at least half left. Shown as small rings. */
export function isAmple(h: Headroom): boolean {
  return !h.metric.resetsAt && h.level === "ok" && !h.runsOutAt && h.leftPct >= 50;
}

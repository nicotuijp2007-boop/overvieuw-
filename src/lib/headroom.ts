import type { UsageMetric } from "@/connectors/types";
import { levelFor, type Level } from "./format";

/**
 * One limit, expressed as what's LEFT (the dashboard's single mental model).
 * Percentages are rounded once: left = 100 - round(used), so used + left is always 100.
 */
export interface Headroom {
  metric: UsageMetric;
  serviceName: string;
  /** Exact % used (can exceed 100). */
  pct: number;
  /** Rounded % used. */
  usedPct: number;
  /** Rounded % left: 100 - usedPct, never below 0. */
  leftPct: number;
  /** Amount left, in the metric's unit (never below 0). */
  remaining: number;
  level: Level;
  /** 0..1: how much of the current period has passed, when the period is known. */
  elapsed?: number;
  /** Projected % used at reset if usage continues at the current pace. */
  projectedPct?: number;
  /** When the limit runs out at the current pace (now if already used up), if before the reset. */
  runsOutAt?: string;
}

/** Below this fraction of the period, a projection is mostly noise. */
const MIN_ELAPSED_FOR_PROJECTION = 0.1;

export function headroom(metric: UsageMetric, serviceName: string, now: number): Headroom | null {
  if (metric.limit == null || metric.limit <= 0) return null;
  const pct = (metric.used / metric.limit) * 100;
  const usedPct = Math.round(pct);
  const h: Headroom = {
    metric,
    serviceName,
    pct,
    usedPct,
    leftPct: Math.max(100 - usedPct, 0),
    remaining: Math.max(metric.limit - metric.used, 0),
    level: levelFor(pct),
  };
  if (metric.used >= metric.limit) h.runsOutAt = new Date(now).toISOString();

  if (metric.periodStart && metric.resetsAt) {
    const start = Date.parse(metric.periodStart);
    const end = Date.parse(metric.resetsAt);
    if (end > start && now >= start && now < end) {
      h.elapsed = (now - start) / (end - start);
      if (h.elapsed >= MIN_ELAPSED_FOR_PROJECTION && metric.used < metric.limit) {
        h.projectedPct = pct / h.elapsed;
        if (metric.used > 0 && h.projectedPct > 100) {
          // Linear: the rate since the period started continues until the limit is reached.
          const reachAt = start + (metric.limit / metric.used) * (now - start);
          if (reachAt < end) h.runsOutAt = new Date(reachAt).toISOString();
        }
      }
    }
  }
  return h;
}

/**
 * Most urgent first: limits that run out before their reset (soonest first),
 * then the rest by % left (least first).
 */
export function byUrgency(a: Headroom, b: Headroom): number {
  if (a.runsOutAt && b.runsOutAt) return Date.parse(a.runsOutAt) - Date.parse(b.runsOutAt);
  if (a.runsOutAt) return -1;
  if (b.runsOutAt) return 1;
  return a.leftPct - b.leftPct || b.pct - a.pct;
}

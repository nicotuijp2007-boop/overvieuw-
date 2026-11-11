import type { UsageMetric } from "@/connectors/types";
import { levelFor, type Level } from "./format";

/** One limit, with everything the dashboard needs to show how much is left. */
export interface Headroom {
  metric: UsageMetric;
  serviceName: string;
  /** % of the limit used (can exceed 100). */
  pct: number;
  /** Amount left, in the metric's unit (never below 0). */
  remaining: number;
  level: Level;
  /** 0..1: how far into the current period we are, when the period is known. */
  elapsed?: number;
  /** Projected % used at reset if usage continues at the current pace. */
  projectedPct?: number;
  /** When the limit would be reached at the current pace, if before the reset. */
  runsOutAt?: string;
}

/** Below this fraction of the period, a projection is mostly noise. */
const MIN_ELAPSED_FOR_PROJECTION = 0.1;

export function headroom(metric: UsageMetric, serviceName: string, now: number): Headroom | null {
  if (metric.limit == null || metric.limit <= 0) return null;
  const pct = (metric.used / metric.limit) * 100;
  const h: Headroom = {
    metric,
    serviceName,
    pct,
    remaining: Math.max(metric.limit - metric.used, 0),
    level: levelFor(pct),
  };

  if (metric.periodStart && metric.resetsAt) {
    const start = Date.parse(metric.periodStart);
    const end = Date.parse(metric.resetsAt);
    if (end > start && now >= start && now < end) {
      h.elapsed = (now - start) / (end - start);
      if (h.elapsed >= MIN_ELAPSED_FOR_PROJECTION) {
        h.projectedPct = pct / h.elapsed;
        if (metric.used > 0 && metric.used < metric.limit && h.projectedPct > 100) {
          // Constant rate since the period started: when does used reach the limit?
          const reachAt = start + (metric.limit / metric.used) * (now - start);
          if (reachAt < end) h.runsOutAt = new Date(reachAt).toISOString();
        }
      }
    }
  }
  return h;
}

/** Most-used first, so the limits that need attention are at the top. */
export function byUrgency(a: Headroom, b: Headroom): number {
  return b.pct - a.pct;
}

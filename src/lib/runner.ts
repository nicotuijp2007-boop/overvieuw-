import { services } from "@config/limits.config";
import { connectors } from "@/connectors";
import type { UsageMetric } from "@/connectors/types";
import { lastKnown, saveSnapshots } from "./history";
import { manualToMetric, readManual } from "./manual";

export interface ServiceResult {
  id: string;
  name: string;
  metrics: UsageMetric[];
  /** False when there is no connector for this service yet (manual entries only). */
  hasConnector: boolean;
  details?: string;
  /** Set when the connector failed. Other cards are unaffected. */
  error?: string;
  /** When the connector failed but earlier values exist: when those were fetched. */
  staleSince?: string;
  fetchedAt: string;
}

// Netlify functions stop after 10s, so each connector gets 8s and fails on its own card.
const TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Geen antwoord binnen ${ms / 1000}s`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** One period before `resetsAt`, for limits whose period length is set in config. */
function periodStartFor(resetsAt: string, period: "month" | "week" | "day"): string {
  const d = new Date(resetsAt);
  if (period === "month") d.setMonth(d.getMonth() - 1);
  else d.setTime(d.getTime() - (period === "week" ? 7 : 1) * 86_400_000);
  return d.toISOString();
}

/** Fill in what the source didn't provide from limits.config.ts: the limit, and the period start. */
function applyConfig(m: UsageMetric): UsageMetric {
  const cfg = services[m.service]?.limits[m.metric];
  if (!cfg) return m;
  const out = { ...m };
  if (out.limit == null) out.limit = cfg.limit;
  if (!out.periodStart && out.resetsAt && cfg.period) out.periodStart = periodStartFor(out.resetsAt, cfg.period);
  return out;
}

/** Run every enabled connector in parallel and merge in manual entries. Never throws. */
export async function fetchAll(): Promise<ServiceResult[]> {
  const enabled = Object.entries(services).filter(([, s]) => s.enabled);
  const byId = new Map(connectors.map((c) => [c.id, c]));

  // Start reading manual entries now, in parallel with the connectors.
  let manualError: string | undefined;
  const manualPromise = readManual().catch((err: Error) => {
    manualError = err.message;
    return [];
  });

  const results: ServiceResult[] = await Promise.all(
    enabled.map(async ([id, cfg]): Promise<ServiceResult> => {
      const fetchedAt = new Date().toISOString();
      const connector = byId.get(id);
      if (!connector) return { id, name: cfg.name, metrics: [], hasConnector: false, fetchedAt };
      try {
        const metrics = await withTimeout(connector.fetchUsage(), TIMEOUT_MS);
        return { id, name: cfg.name, metrics, hasConnector: true, details: connector.details, fetchedAt };
      } catch (err) {
        // Only the message is shown: connectors must not put tokens in error messages.
        // Fall back to the last values we stored, so the card doesn't go blank.
        const previous = await lastKnown(id).catch(() => []);
        const staleSince = previous.length
          ? previous.reduce((a, m) => (m.fetchedAt > a ? m.fetchedAt : a), previous[0].fetchedAt)
          : undefined;
        return {
          id,
          name: cfg.name,
          metrics: previous,
          hasConnector: true,
          details: connector.details,
          fetchedAt,
          error: (err as Error).message,
          staleSince,
        };
      }
    }),
  );

  // Manual entries are added to their service's card. If the connector also returned
  // a metric with the same name, the most recent value wins.
  const manual = await manualPromise;
  for (const entry of manual) {
    const card = results.find((r) => r.id === entry.service);
    if (!card) continue; // service disabled or removed from config
    const m = manualToMetric(entry);
    const i = card.metrics.findIndex((x) => x.metric === m.metric);
    if (i === -1) card.metrics.push(m);
    else if (Date.parse(m.fetchedAt) > Date.parse(card.metrics[i].fetchedAt)) card.metrics[i] = m;
  }
  if (manualError) {
    results.push({ id: "_manual", name: "Handmatige waarden", metrics: [], hasConnector: true, fetchedAt: new Date().toISOString(), error: manualError });
  }

  for (const r of results) r.metrics = r.metrics.map(applyConfig);

  // History for "last known value" and sparklines. Never let it break the page.
  await saveSnapshots(results.flatMap((r) => (r.error ? [] : r.metrics))).catch(() => {});
  return results;
}

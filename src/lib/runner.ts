import { services } from "@config/limits.config";
import { connectors } from "@/connectors";
import type { UsageMetric } from "@/connectors/types";
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
  fetchedAt: string;
}

// Netlify functions stop after 10s, so each connector gets 8s and fails on its own card.
const TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Fill in limits the API didn't provide from limits.config.ts. */
function applyLimits(m: UsageMetric): UsageMetric {
  if (m.limit != null) return m;
  const cfg = services[m.service]?.limits[m.metric];
  return cfg ? { ...m, limit: cfg.limit } : m;
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
    enabled.map(async ([id, cfg]) => {
      const fetchedAt = new Date().toISOString();
      const connector = byId.get(id);
      if (!connector) return { id, name: cfg.name, metrics: [], hasConnector: false, fetchedAt };
      try {
        const metrics = await withTimeout(connector.fetchUsage(), TIMEOUT_MS);
        return { id, name: cfg.name, metrics, hasConnector: true, details: connector.details, fetchedAt };
      } catch (err) {
        // Only the message is shown: connectors must not put tokens in error messages.
        return { id, name: cfg.name, metrics: [], hasConnector: true, details: connector.details, fetchedAt, error: (err as Error).message };
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
    results.push({ id: "_manual", name: "Manual entries", metrics: [], hasConnector: true, fetchedAt: new Date().toISOString(), error: manualError });
  }

  for (const r of results) r.metrics = r.metrics.map(applyLimits);
  return results;
}

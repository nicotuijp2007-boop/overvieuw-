import type { UsageMetric } from "@/connectors/types";
import { db } from "./db";

/** Manual values, stored in usage_dashboard.manual_entries. Added via the form on the dashboard. */
export interface ManualEntry {
  service: string;
  metric: string;
  used: number;
  limit: number | null;
  unit: string;
  resetsAt?: string;
  updatedAt: string;
}

export async function readManual(): Promise<ManualEntry[]> {
  const s = await db();
  const rows = await s<{ service: string; metric: string; used: number; limit: number | null; unit: string; resets_at: Date | null; updated_at: Date }[]>`
    select service, metric, used, "limit", unit, resets_at, updated_at
    from usage_dashboard.manual_entries
    order by service, metric
  `;
  return rows.map((r) => ({
    service: r.service,
    metric: r.metric,
    used: r.used,
    limit: r.limit,
    unit: r.unit,
    resetsAt: r.resets_at?.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

/** Insert or replace the entry with the same service + metric. */
export async function upsertManual(e: ManualEntry) {
  const s = await db();
  await s`
    insert into usage_dashboard.manual_entries (service, metric, used, "limit", unit, resets_at, updated_at)
    values (${e.service}, ${e.metric}, ${e.used}, ${e.limit}, ${e.unit}, ${e.resetsAt ?? null}, ${e.updatedAt})
    on conflict (service, metric) do update set
      used = excluded.used, "limit" = excluded."limit", unit = excluded.unit,
      resets_at = excluded.resets_at, updated_at = excluded.updated_at
  `;
}

export async function deleteManual(service: string, metric: string) {
  const s = await db();
  await s`delete from usage_dashboard.manual_entries where service = ${service} and metric = ${metric}`;
}

export function manualToMetric(e: ManualEntry): UsageMetric {
  return {
    service: e.service,
    metric: e.metric,
    used: e.used,
    limit: e.limit,
    unit: e.unit,
    resetsAt: e.resetsAt,
    source: "manual",
    fetchedAt: e.updatedAt,
  };
}

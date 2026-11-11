import type { Source, UsageMetric } from "@/connectors/types";
import { withDb } from "./db";

/**
 * Snapshots of fetched values (table usage_dashboard.snapshots).
 * A new row is stored only if the value changed or the last row is 10+ minutes old,
 * so refreshing a lot doesn't flood the table. Rows older than 90 days are removed.
 */
export async function saveSnapshots(metrics: UsageMetric[]): Promise<void> {
  const rows = metrics.filter((m) => m.source !== "manual" && !m.stale && Number.isFinite(m.used));
  if (!rows.length) return;
  await withDb(async (sql) => {
    await sql.unsafe(
      `insert into usage_dashboard.snapshots (service, metric, used, "limit", unit, source, note, fetched_at, period_start, resets_at)
       select * from unnest($1::text[], $2::text[], $3::float8[], $4::float8[], $5::text[], $6::text[], $7::text[], $8::timestamptz[], $9::timestamptz[], $10::timestamptz[])
         as n(service, metric, used, lim, unit, source, note, fetched_at, period_start, resets_at)
       where not exists (
         select 1 from usage_dashboard.snapshots s
         where s.service = n.service and s.metric = n.metric
           and s.used = n.used and s.fetched_at > n.fetched_at - interval '10 minutes'
       )`,
      [
        rows.map((m) => m.service),
        rows.map((m) => m.metric),
        rows.map((m) => m.used),
        rows.map((m) => m.limit),
        rows.map((m) => m.unit),
        rows.map((m) => m.source),
        rows.map((m) => m.note ?? null),
        rows.map((m) => m.fetchedAt),
        rows.map((m) => m.periodStart ?? null),
        rows.map((m) => m.resetsAt ?? null),
      ] as never[],
    );
    if (Math.random() < 0.02) await sql`delete from usage_dashboard.snapshots where fetched_at < now() - interval '90 days'`;
  });
}

interface SnapshotRow {
  service: string;
  metric: string;
  used: number;
  limit: number | null;
  unit: string;
  source: Source;
  note: string | null;
  fetched_at: Date;
  period_start: Date | null;
  resets_at: Date | null;
}

/** The most recent stored value of each metric of a service (last 7 days), marked stale. */
export async function lastKnown(service: string): Promise<UsageMetric[]> {
  const rows = await withDb((sql) => sql<SnapshotRow[]>`
    select distinct on (metric) service, metric, used, "limit", unit, source, note, fetched_at, period_start, resets_at
    from usage_dashboard.snapshots
    where service = ${service} and fetched_at > now() - interval '7 days'
    order by metric, fetched_at desc
  `);
  return rows.map((r) => ({
    service: r.service,
    metric: r.metric,
    used: r.used,
    limit: r.limit,
    unit: r.unit,
    source: r.source,
    note: r.note ?? undefined,
    fetchedAt: r.fetched_at.toISOString(),
    periodStart: r.period_start?.toISOString(),
    resetsAt: r.resets_at?.toISOString(),
    stale: true,
  }));
}

export interface Point {
  t: number;
  /** % of the limit used at that time. */
  pct: number;
}

/**
 * History per limit for the sparklines: since the start of the current period when
 * known, otherwise the last 7 days. Key: "service|metric".
 */
export async function series(limits: { service: string; metric: string; since: string }[]): Promise<Map<string, Point[]>> {
  const out = new Map<string, Point[]>();
  if (!limits.length) return out;
  const rows = await withDb((sql) =>
    sql.unsafe(
      `select s.service, s.metric, s.fetched_at, s.used, s."limit"
       from unnest($1::text[], $2::text[], $3::timestamptz[]) as q(service, metric, since)
       join lateral (
         select * from usage_dashboard.snapshots s
         where s.service = q.service and s.metric = q.metric and s.fetched_at >= q.since and s."limit" > 0
         order by s.fetched_at desc limit 200
       ) s on true
       order by s.fetched_at`,
      [limits.map((l) => l.service), limits.map((l) => l.metric), limits.map((l) => l.since)] as never[],
    ),
  );
  for (const r of rows as unknown as { service: string; metric: string; fetched_at: Date; used: number; limit: number }[]) {
    const key = `${r.service}|${r.metric}`;
    const list = out.get(key) ?? [];
    list.push({ t: r.fetched_at.getTime(), pct: (r.used / r.limit) * 100 });
    out.set(key, list);
  }
  return out;
}

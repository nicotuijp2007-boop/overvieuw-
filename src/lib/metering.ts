import { after } from "next/server";
import { withDb } from "./db";

/**
 * Counts this dashboard's own function runs (page loads, widget, sync), because they cost
 * Netlify credits (compute and requests) that Netlify's API doesn't report.
 *
 * Call meter("name") at the start of a page or route handler. The duration is measured until
 * the response is finished and stored afterwards, so it doesn't slow the response down.
 * The write itself (one short database call) isn't counted, so this slightly undercounts.
 */
export function meter(route: string): void {
  const start = Date.now();
  after(() => recordInvocation(route, Date.now() - start).catch(() => {}));
}

async function recordInvocation(route: string, ms: number): Promise<void> {
  await withDb((sql) => sql`
    insert into usage_dashboard.invocations (day, route, count, ms)
    values ((now() at time zone 'utc')::date, ${route}, 1, ${Math.max(0, Math.round(ms))})
    on conflict (day, route) do update set
      count = usage_dashboard.invocations.count + 1,
      ms = usage_dashboard.invocations.ms + excluded.ms
  `);
}

/** Function runs and their total duration since `since` (by UTC day). */
export async function functionUsage(since: Date): Promise<{ count: number; ms: number }> {
  const [row] = await withDb((sql) => sql<{ count: string | null; ms: string | null }[]>`
    select sum(count) as count, sum(ms) as ms
    from usage_dashboard.invocations
    where day >= (${since.toISOString()}::timestamptz at time zone 'utc')::date
  `);
  return { count: Number(row?.count ?? 0), ms: Number(row?.ms ?? 0) };
}

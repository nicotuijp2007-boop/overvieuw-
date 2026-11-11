import { withDb } from "./db";
import { todayIn } from "./format";

/** Claude data pushed by scripts/sync-claude.mjs, read back from the database. */

export interface Totals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
  responses: number;
}

const TOTALS = `
  coalesce(sum(input), 0)::float8 as input,
  coalesce(sum(output), 0)::float8 as output,
  coalesce(sum(cache_write), 0)::float8 as "cacheWrite",
  coalesce(sum(cache_read), 0)::float8 as "cacheRead",
  coalesce(sum(input + output + cache_write + cache_read), 0)::float8 as total,
  coalesce(sum(responses), 0)::float8 as responses
`;

export interface RateLimits {
  machine: string;
  recordedAt: Date;
  fiveHourPct: number | null;
  fiveHourResetsAt: Date | null;
  sevenDayPct: number | null;
  sevenDayResetsAt: Date | null;
}

/** The most recently recorded plan limits, from whichever computer reported last. */
export async function latestRateLimits(): Promise<RateLimits | null> {
  const [r] = await withDb((sql) => sql<RateLimits[]>`
    select machine, recorded_at as "recordedAt",
      five_hour_pct as "fiveHourPct", five_hour_resets_at as "fiveHourResetsAt",
      seven_day_pct as "sevenDayPct", seven_day_resets_at as "sevenDayResetsAt"
    from usage_dashboard.claude_rate_limits
    order by recorded_at desc limit 1
  `);
  return r ?? null;
}

/** Totals from `days` days ago up to today, across all computers. days = 1 means today only. */
export async function totalsSince(days: number): Promise<Totals & { machines: number; lastAt: Date | null }> {
  const today = todayIn();
  const [r] = await withDb((sql) => sql.unsafe(
    `select ${TOTALS}, count(distinct machine)::int as machines, max(last_at) as "lastAt"
     from usage_dashboard.claude_code_usage
     where day > $1::date - $2::int and day <= $1::date`,
    [today, days],
  ));
  return r as unknown as Totals & { machines: number; lastAt: Date | null };
}

export interface DayRow extends Totals {
  day: string;
  models: string[];
}

export async function byDay(limit = 30): Promise<DayRow[]> {
  return (await withDb((sql) => sql.unsafe(
    `select to_char(day, 'YYYY-MM-DD') as day, ${TOTALS},
       array(select distinct m from usage_dashboard.claude_code_usage u2, unnest(u2.models) m where u2.day = u.day order by m) as models
     from usage_dashboard.claude_code_usage u
     group by day order by day desc limit $1`,
    [limit],
  ))) as unknown as DayRow[];
}

export interface SessionRow extends Totals {
  machine: string;
  sessionId: string;
  project: string;
  lastAt: Date;
  models: string[];
}

export async function bySession(limit = 25): Promise<SessionRow[]> {
  return (await withDb((sql) => sql.unsafe(
    `select machine, session_id as "sessionId", max(project) as project, max(last_at) as "lastAt", ${TOTALS},
       array(select distinct m from usage_dashboard.claude_code_usage u2, unnest(u2.models) m
             where u2.machine = u.machine and u2.session_id = u.session_id order by m) as models
     from usage_dashboard.claude_code_usage u
     group by machine, session_id order by max(last_at) desc limit $1`,
    [limit],
  ))) as unknown as SessionRow[];
}

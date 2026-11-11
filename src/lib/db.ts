import postgres from "postgres";

/**
 * Postgres storage (your Supabase database) for manual entries and data pushed from
 * your computers (Claude usage). Everything lives in its own `usage_dashboard` schema,
 * created automatically on first use, so it doesn't mix with your app's tables.
 *
 * DATABASE_URL: Supabase dashboard > Connect > "Transaction pooler" connection string.
 *
 * Every call opens its own connection and closes it afterwards. On Netlify, functions are
 * frozen between requests, and a connection kept open across a freeze can be silently
 * dead, which makes the next query hang until the function times out. A fresh connection
 * per call avoids that, and the time limit below stops any query from hanging the page.
 */
const QUERY_TIMEOUT_MS = 7_000;

let migrated = false;

const MIGRATION = `
create schema if not exists usage_dashboard;

create table if not exists usage_dashboard.manual_entries (
  service     text not null,
  metric      text not null,
  used        double precision not null,
  "limit"     double precision,
  unit        text not null default '',
  resets_at   timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (service, metric)
);

-- Latest Claude plan limits per computer, as recorded by the status line.
create table if not exists usage_dashboard.claude_rate_limits (
  machine              text primary key,
  recorded_at          timestamptz not null,
  five_hour_pct        double precision,
  five_hour_resets_at  timestamptz,
  seven_day_pct        double precision,
  seven_day_resets_at  timestamptz
);

-- Claude Code token usage per computer, per session, per day (from local logs).
create table if not exists usage_dashboard.claude_code_usage (
  machine      text not null,
  session_id   text not null,
  day          date not null,
  project      text not null default '',
  models       text[] not null default '{}',
  input        bigint not null default 0,
  output       bigint not null default 0,
  cache_write  bigint not null default 0,
  cache_read   bigint not null default 0,
  responses    integer not null default 0,
  first_at     timestamptz not null,
  last_at      timestamptz not null,
  primary key (machine, session_id, day)
);
alter table usage_dashboard.claude_code_usage add column if not exists synced_at timestamptz not null default now();

-- One row per fetched value (at most every 10 minutes, or when the value changes).
-- Used for "last known value" when a source fails, and for the sparklines.
create table if not exists usage_dashboard.snapshots (
  id            bigserial primary key,
  service       text not null,
  metric        text not null,
  used          double precision not null,
  "limit"       double precision,
  unit          text not null default '',
  source        text not null,
  note          text,
  fetched_at    timestamptz not null,
  period_start  timestamptz,
  resets_at     timestamptz
);
create index if not exists snapshots_metric_time on usage_dashboard.snapshots (service, metric, fetched_at desc);

-- This dashboard's own function runs per day (UTC) and route: how often, and how long in total.
-- Netlify doesn't report compute or requests via its API, so they're estimated from this.
create table if not exists usage_dashboard.invocations (
  day    date not null,
  route  text not null,
  count  integer not null default 0,
  ms     bigint not null default 0,
  primary key (day, route)
);

-- Small key/value cache, e.g. the last /api/widget response.
create table if not exists usage_dashboard.cache (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
`;

function connect(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see README: Setup).");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, {
    max: 1,
    connect_timeout: 5,
    prepare: false, // required by Supabase's transaction pooler
    ssl: local ? false : "require",
    onnotice: () => {},
  });
}

/** Runs `fn` with a fresh connection that is always closed afterwards, with a time limit. */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = connect();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Database did not respond within ${QUERY_TIMEOUT_MS / 1000}s.`)), QUERY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        if (!migrated) {
          await sql.unsafe(MIGRATION).catch((err: Error) => {
            throw new Error(`Database setup failed: ${err.message}`);
          });
          migrated = true;
        }
        return fn(sql);
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
    // Don't wait for a graceful close if the connection is stuck.
    sql.end({ timeout: 0.5 }).catch(() => {});
  }
}

import postgres from "postgres";

/**
 * Postgres storage (your Supabase database) for manual entries and data pushed from
 * your computers (Claude usage). Everything lives in its own `usage_dashboard` schema,
 * created automatically on first use, so it doesn't mix with your app's tables.
 *
 * DATABASE_URL: Supabase dashboard > Connect > "Transaction pooler" connection string.
 */
let client: postgres.Sql | null = null;
let migrated: Promise<void> | null = null;

export function sql(): postgres.Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see README: Database).");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  client = postgres(url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 8,
    prepare: false, // required by Supabase's transaction pooler
    ssl: local ? false : "require",
    onnotice: () => {},
  });
  return client;
}

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
`;

/** Returns the client after making sure the schema exists (once per process). */
export async function db(): Promise<postgres.Sql> {
  const s = sql();
  migrated ??= s.unsafe(MIGRATION).then(() => undefined).catch((err) => {
    migrated = null; // retry next time
    throw new Error(`Database setup failed: ${(err as Error).message}`);
  });
  await migrated;
  return s;
}

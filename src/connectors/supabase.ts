import { services } from "@config/limits.config";
import type { Connector, UsageMetric } from "./types";

/**
 * Supabase Management API (https://api.supabase.com/v1), personal access token.
 *
 * Per project:
 *   GET  /projects                                              -> list of projects
 *   GET  /projects/{ref}/config/disk/util                       -> disk used / size
 *   GET  /projects/{ref}/analytics/endpoints/usage.api-counts   -> requests per day
 *   POST /projects/{ref}/database/query/read-only               -> database size, storage size, active users
 * The read-only query endpoint runs SQL in a read-only transaction, so this can't change anything.
 *
 * Not available via the API: egress, and the official billed MAU figure. Use manual entries for those.
 */
const API = "https://api.supabase.com/v1";

async function call<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`Could not reach api.supabase.com (${cause?.code ?? cause?.message ?? (err as Error).message})`);
  }
  if (res.status === 401) throw new Error("Supabase rejected the token (HTTP 401). Check SUPABASE_TOKEN in .env.local.");
  if (res.status === 403) throw new Error(`Supabase token lacks permission for ${path.split("?")[0]} (HTTP 403).`);
  if (!res.ok) throw new Error(`Supabase API ${path.split("?")[0]} returned HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const SQL = `
select
  pg_database_size(current_database())::bigint as db_bytes,
  (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects)::bigint as storage_bytes,
  (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days')::bigint as active_users
`;

const MB = 1_000_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const limitFor = (metric: string) => services.supabase?.limits[metric]?.limit ?? null;

interface Project {
  ref: string;
  name: string;
  status: string;
}

async function projectMetrics(p: Project, token: string, label: (m: string) => string): Promise<UsageMetric[]> {
  const fetchedAt = new Date().toISOString();
  const base = { service: "supabase", source: "api" as const, fetchedAt };

  if (p.status !== "ACTIVE_HEALTHY") {
    // Paused projects can't run SQL. Show the status instead of failing the whole card.
    return [{ ...base, metric: label("Status"), used: 0, limit: null, unit: "", note: `Project is ${p.status.toLowerCase()}` }];
  }

  const ref = encodeURIComponent(p.ref);
  const [rows, disk, counts] = await Promise.all([
    call<{ db_bytes: number | string; storage_bytes: number | string; active_users: number | string }[]>(
      `/projects/${ref}/database/query/read-only`,
      token,
      { method: "POST", body: JSON.stringify({ query: SQL }) },
    ),
    call<{ metrics: { fs_size_bytes: number; fs_used_bytes: number } }>(`/projects/${ref}/config/disk/util`, token),
    call<{ result: { total_rest_requests?: number; total_auth_requests?: number; total_storage_requests?: number; total_realtime_requests?: number }[] }>(
      `/projects/${ref}/analytics/endpoints/usage.api-counts?interval=7day`,
      token,
    ),
  ]);

  const r = rows[0];
  const requests = (counts.result ?? []).reduce(
    (sum, d) => sum + (d.total_rest_requests ?? 0) + (d.total_auth_requests ?? 0) + (d.total_storage_requests ?? 0) + (d.total_realtime_requests ?? 0),
    0,
  );

  return [
    { ...base, metric: label("Database size"), used: round1(Number(r.db_bytes) / MB), limit: limitFor("Database size"), unit: "MB" },
    { ...base, metric: label("Storage size"), used: round1(Number(r.storage_bytes) / MB), limit: limitFor("Storage size"), unit: "MB" },
    {
      ...base,
      metric: label("Monthly active users"),
      used: Number(r.active_users),
      limit: limitFor("Monthly active users"),
      unit: "MAU",
      note: "Approx.: users who signed in during the last 30 days",
    },
    {
      ...base,
      metric: label("Disk used"),
      used: round1(disk.metrics.fs_used_bytes / MB),
      limit: round1(disk.metrics.fs_size_bytes / MB),
      unit: "MB",
      note: "Includes indexes, WAL and system files. Supabase grows the disk automatically.",
    },
    { ...base, metric: label("API requests (7 days)"), used: requests, limit: null, unit: "requests" },
  ];
}

export const supabase: Connector = {
  id: "supabase",
  async fetchUsage() {
    const token = process.env.SUPABASE_TOKEN;
    if (!token) throw new Error("SUPABASE_TOKEN is not set in .env.local.");

    let projects = await call<Project[]>("/projects", token);
    const only = process.env.SUPABASE_PROJECTS?.split(",").map((s) => s.trim()).filter(Boolean);
    if (only?.length) projects = projects.filter((p) => only.includes(p.ref) || only.includes(p.name));
    if (projects.length === 0) throw new Error("No Supabase projects found for this token.");

    // With one project, metric names match limits.config.ts directly; with several, the project name is appended.
    const results = await Promise.allSettled(
      projects.map((p) => projectMetrics(p, token, projects.length === 1 ? (m) => m : (m) => `${m} · ${p.name}`)),
    );

    const metrics = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${projects[i].name}: ${(r.reason as Error).message}`] : []));
    // One failing project shouldn't hide the others; only fail the card if all failed.
    if (metrics.length === 0) throw new Error(failed.join("; "));
    if (failed.length) {
      metrics.push({ service: "supabase", metric: "Errors", used: failed.length, limit: null, unit: "projects", source: "api", fetchedAt: new Date().toISOString(), note: failed.join("; ") });
    }
    return metrics;
  },
};

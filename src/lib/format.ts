export type Level = "ok" | "warn" | "danger";

/** green under 70%, yellow 70–90%, red above 90%. */
export function levelFor(pct: number): Level {
  if (pct > 90) return "danger";
  if (pct >= 70) return "warn";
  return "ok";
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 });
}

/** "3d 4h", "2h 15m", "5m". Negative durations return "now". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min}m`;
  return `${Math.max(min, 1)}m`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  return `${formatDuration(ms)} ago`;
}

/**
 * Times are shown in DASHBOARD_TIMEZONE (e.g. "Europe/Amsterdam"). On Netlify the server runs
 * in UTC, so set it there; locally it defaults to your computer's timezone.
 */
function timeZone(): string | undefined {
  return process.env.DASHBOARD_TIMEZONE || undefined;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timeZone() });
}

/** Today's date as YYYY-MM-DD in DASHBOARD_TIMEZONE. */
export function todayIn(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** 1,284 / 12.9K / 28.9M: short numbers for stat tiles. */
export function compactNumber(n: number): string {
  if (Math.abs(n) < 10_000) return formatNumber(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

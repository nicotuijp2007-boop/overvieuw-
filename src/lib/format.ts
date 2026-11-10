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

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
